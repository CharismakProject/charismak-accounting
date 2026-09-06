import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { readableError } from "../lib/mobile-error";
import { Card, ScreenTitle, baseStyles as b, money, palette } from "../components/ui";
import {
  analyseStatement,
  parseStandardStatement,
  type ProjectStatementItem,
  type StatementAccount,
  type StatementAnalysis,
  type StatementProject,
} from "../lib/statement-import";
import { findExistingStatementImport } from "../lib/statement-import-resume";
import { loadPriorStatementRows, postProjectStatementItems, postStatementTransferPairs, saveStatementImport } from "../lib/statement-import-store";

type SavedImport = { importId: string; idByIndex: Map<number, string> };

type WorkspaceShape = Awaited<ReturnType<typeof loadWorkspace>>;

export default function ImportStatement(){
  const [workspace,setWorkspace]=useState<WorkspaceShape|null>(null);
  const [accounts,setAccounts]=useState<StatementAccount[]>([]);
  const [projects,setProjects]=useState<StatementProject[]>([]);
  const [selectedAccountId,setSelectedAccountId]=useState("");
  const [keywords,setKeywords]=useState<Record<string,string>>({});
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState("");
  const [fileName,setFileName]=useState("");
  const [analysis,setAnalysis]=useState<StatementAnalysis|null>(null);
  const [saved,setSaved]=useState<SavedImport|null>(null);
  const [postedProjects,setPostedProjects]=useState<Set<string>>(new Set());
  const [transfersPosted,setTransfersPosted]=useState(false);
  const [decisionProjects,setDecisionProjects]=useState<Record<string,string>>({});
  const [decisionCategories,setDecisionCategories]=useState<Record<string,string>>({});
  const [resolvedDecisions,setResolvedDecisions]=useState<Set<string>>(new Set());

  useEffect(()=>{(async()=>{
    try{
      const w=await loadWorkspace();setWorkspace(w);
      const [{data:a,error:ae},{data:p,error:pe}]=await Promise.all([
        supabase.from("financial_accounts").select("id,institution_name,account_name,account_number_masked").eq("company_id",w.membership.company_id).eq("is_active",true).order("account_name"),
        supabase.from("projects").select("id,name").eq("company_id",w.membership.company_id).neq("status","archived").order("name"),
      ]);
      if(ae)throw ae;if(pe)throw pe;
      const mappedAccounts=(a??[]).map((row:any)=>({id:String(row.id),institution:row.institution_name,name:String(row.account_name),number:row.account_number_masked}));
      const mappedProjects=(p??[]).map((row:any)=>({id:String(row.id),name:String(row.name)}));
      setAccounts(mappedAccounts);setProjects(mappedProjects);
      if(mappedAccounts.length===1)setSelectedAccountId(mappedAccounts[0].id);
    }catch(e){Alert.alert("Could not open statement import",readableError(e));}
    finally{setLoading(false);}
  })()},[]);

  const sourceAccount=accounts.find(a=>a.id===selectedAccountId)??null;
  const projectGroups=useMemo(()=>{
    const groups=new Map<string,{projectId:string;projectName:string;items:ProjectStatementItem[];in:number;out:number}>();
    for(const item of analysis?.projectItems??[]){
      const current=groups.get(item.projectId)??{projectId:item.projectId,projectName:item.projectName,items:[],in:0,out:0};
      current.items.push(item);if(item.kind==="project_expense")current.out+=item.amount;else current.in+=item.amount;groups.set(item.projectId,current);
    }
    return Array.from(groups.values());
  },[analysis]);

  async function chooseAndAnalyse(){
    if(!workspace)return;
    if(!sourceAccount)return Alert.alert("Choose account","Choose the account this statement belongs to first.");
    const picked=await DocumentPicker.getDocumentAsync({type:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","application/csv","text/comma-separated-values"],multiple:false,copyToCacheDirectory:true});
    if(picked.canceled)return;
    const asset=picked.assets[0];
    const lower=asset.name.toLowerCase();
    if(!lower.endsWith(".xlsx")&&!lower.endsWith(".csv"))return Alert.alert("Use Excel or CSV","For this test version, convert the statement to .xlsx or .csv first.");
    setBusy(true);setProgress("Reading statement…");setAnalysis(null);setSaved(null);setPostedProjects(new Set());setTransfersPosted(false);setResolvedDecisions(new Set());
    try{
      const bytes=await (await fetch(asset.uri)).arrayBuffer();
      const rows=parseStandardStatement(bytes);
      const existing=await findExistingStatementImport(workspace.membership.company_id,bytes);
      if(existing&&existing.sourceAccountId!==sourceAccount.id)throw new Error("This statement was already saved against a different account. Use the account it originally belonged to.");
      setProgress("Checking earlier statements…");
      const history=await loadPriorStatementRows(workspace.membership.company_id,sourceAccount.id,rows);
      const projectRules=projects.map(project=>({...project,keywords:String(keywords[project.id]??"").split(",").map(v=>v.trim()).filter(Boolean)}));
      const result=analyseStatement({
        rows,
        sourceAccount,
        accounts,
        projects:projectRules,
        priorRows:existing?history.priorRows.filter(row=>row.statementKey!==existing.importId):history.priorRows,
        knownFingerprints:existing?new Set<string>():history.knownFingerprints,
      });
      setProgress(existing?"Opening saved analysis…":"Saving statement source…");
      const savedResult=existing??await saveStatementImport({companyId:workspace.membership.company_id,userId:workspace.user.id,sourceAccount,fileName:asset.name,fileBytes:bytes,rows});
      setFileName(asset.name);setAnalysis(result);setSaved({importId:savedResult.importId,idByIndex:savedResult.idByIndex});
      setProgress("");
    }catch(e){setProgress("");Alert.alert("Could not analyse statement",readableError(e,"Check the statement format and try again."));}
    finally{setBusy(false);}
  }

  async function postProjectGroup(group:(typeof projectGroups)[number]){
    if(!workspace||!saved||!sourceAccount)return;
    setBusy(true);setProgress(`Adding ${group.projectName} entries…`);
    try{
      const count=await postProjectStatementItems({importId:saved.importId,companyId:workspace.membership.company_id,sourceAccountId:sourceAccount.id,rowIdByIndex:saved.idByIndex,items:group.items,onProgress:(done,total)=>setProgress(`Adding ${group.projectName}: ${done} of ${total}`)});
      setPostedProjects(prev=>new Set(prev).add(group.projectId));
      Alert.alert("Added to project",count?`${count} statement entr${count===1?"y":"ies"} added to ${group.projectName}.`:"These entries were already in the books.");
    }catch(e){Alert.alert("Could not add project entries",readableError(e));}
    finally{setBusy(false);setProgress("");}
  }

  async function postTransfers(){
    if(!workspace||!saved||!analysis)return;
    setBusy(true);setProgress("Recording account transfers…");
    try{
      const count=await postStatementTransferPairs({importId:saved.importId,companyId:workspace.membership.company_id,rowIdByIndex:saved.idByIndex,pairs:analysis.transferPairs,onProgress:(done,total)=>setProgress(`Recording transfers: ${done} of ${total}`)});
      setTransfersPosted(true);
      Alert.alert("Account transfers recorded",count?`${count} matched transfer${count===1?"":"s"} recorded without treating them as income or project cost.`:"These transfers were already recorded.");
    }catch(e){Alert.alert("Could not record transfers",readableError(e));}
    finally{setBusy(false);setProgress("");}
  }

  async function resolveDecision(key:string){
    if(!workspace||!saved||!sourceAccount||!analysis)return;
    const decision=analysis.decisions.find(d=>d.key===key);if(!decision)return;
    const projectId=decisionProjects[key];const project=projects.find(p=>p.id===projectId);
    if(!project)return Alert.alert("Choose project","Choose the project these transactions belong to.");
    const category=(decisionCategories[key]||"Other project cost").trim();
    const items:ProjectStatementItem[]=decision.rows.map(row=>({
      row,fees:[],projectId:project.id,projectName:project.name,
      kind:row.signedAmount<0?"project_expense":"project_funding",
      category:row.signedAmount<0?category:null,
      amount:Math.abs(row.signedAmount),
      reason:"Confirmed during statement import",
    }));
    setBusy(true);setProgress(`Adding ${decision.label}…`);
    try{
      await postProjectStatementItems({importId:saved.importId,companyId:workspace.membership.company_id,sourceAccountId:sourceAccount.id,rowIdByIndex:saved.idByIndex,items,onProgress:(done,total)=>setProgress(`Adding ${done} of ${total}`)});
      setResolvedDecisions(prev=>new Set(prev).add(key));
    }catch(e){Alert.alert("Could not add these transactions",readableError(e));}
    finally{setBusy(false);setProgress("");}
  }

  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><Text style={s.muted}>Opening statement import…</Text></View></SafeAreaView>;

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content} keyboardShouldPersistTaps="handled">
    <Pressable onPress={()=>router.back()}><Text style={s.back}>← Back</Text></Pressable>
    <ScreenTitle eyebrow="PRIVATE TEST · STATEMENT IMPORT" title="Bring an existing project account up to date" subtitle="Use one Excel or CSV statement at a time. Charismak separates project costs, project funding and movements between your own accounts before anything is added to the books."/>

    <Card style={s.block}>
      <Text style={s.step}>1 · Account</Text><Text style={s.heading}>Which account does this statement belong to?</Text>
      <View style={s.chips}>{accounts.map(account=><Pressable key={account.id} disabled={!!analysis} onPress={()=>setSelectedAccountId(account.id)} style={[s.chip,selectedAccountId===account.id&&s.chipActive]}><Text style={[s.chipText,selectedAccountId===account.id&&s.chipTextActive]}>{account.institution?`${account.institution} · `:""}{account.name}{account.number?` · ${String(account.number).slice(-4)}`:""}</Text></Pressable>)}</View>
      {!accounts.length&&<><Text style={s.muted}>Add the bank or wallet account before importing its statement.</Text><Pressable onPress={()=>router.push("/new-account")}><Text style={s.link}>Add account</Text></Pressable></>}
    </Card>

    <Card style={s.block}>
      <Text style={s.step}>2 · Project words</Text><Text style={s.heading}>Add any extra words you normally use for a project.</Text><Text style={s.muted}>Project names are already checked. Only add useful extras such as a client name, site nickname or supplier name. Separate them with commas.</Text>
      {projects.map(project=><View key={project.id} style={s.keywordRow}><Text style={s.projectName}>{project.name}</Text><TextInput editable={!analysis} value={keywords[project.id]??""} onChangeText={value=>setKeywords(prev=>({...prev,[project.id]:value}))} placeholder="Optional extra words" style={s.input}/></View>)}
      {!projects.length&&<Text style={s.muted}>There are no projects yet. Create the projects you want this statement to feed before importing it.</Text>}
    </Card>

    <Card style={s.block}>
      <Text style={s.step}>3 · Statement</Text><Text style={s.heading}>Use the same simple format every time.</Text>
      <Text style={s.format}>Date · Description · Debit · Credit · Balance</Text><Text style={s.muted}>Value Date and Reference are optional. The first row must contain the headings. Use .xlsx or .csv.</Text>
      <Pressable disabled={busy||!sourceAccount||!projects.length} onPress={chooseAndAnalyse} style={[s.primary,(busy||!sourceAccount||!projects.length)&&s.disabled]}><Text style={s.primaryText}>{busy?(progress||"Working…"):analysis?"Choose another statement":"Choose statement"}</Text></Pressable>
      {!!fileName&&<Text style={s.file}>Statement: {fileName}</Text>}
    </Card>

    {analysis&&saved&&<>
      <Card style={s.summary}>
        <Text style={s.step}>STATEMENT CHECK</Text><Text style={s.heading}>{analysis.rows.length.toLocaleString()} transaction rows read</Text>
        <View style={s.summaryGrid}>
          <Summary label="Ready for projects" value={String(analysis.projectItems.length)}/>
          <Summary label="Matched own-account transfers" value={String(analysis.transferPairs.length)}/>
          <Summary label="Waiting for another account" value={String(analysis.waitingTransfers.length)}/>
          <Summary label="Need your decision" value={String(analysis.decisions.reduce((n,d)=>n+d.rows.length,0))}/>
          <Summary label="Unrelated / hidden" value={String(analysis.ignoredCount)}/>
          <Summary label="Already seen" value={String(analysis.duplicateCount)}/>
        </View>
        {!!analysis.mechanicsCount&&<Text style={s.small}>{analysis.mechanicsCount} statement-only movement{analysis.mechanicsCount===1?" was":"s were"} removed before project analysis.</Text>}
        {!!analysis.feeRowsAttached&&<Text style={s.small}>{analysis.feeRowsAttached} transfer charge{analysis.feeRowsAttached===1?" was":"s were"} kept with the related project payment.</Text>}
      </Card>

      {!!analysis.waitingTransfers.length&&<Card style={s.waiting}><Text style={s.heading}>Site-fund movements left untouched</Text><Text style={s.muted}>{analysis.waitingTransfers.length} movement{analysis.waitingTransfers.length===1?" looks":"s look"} like money being moved for disbursement rather than final construction cost. Import the other account statement later; matching amounts will be paired before they affect the books.</Text></Card>}

      {!!analysis.transferPairs.length&&<Card style={s.block}><Text style={s.heading}>Own-account transfers</Text><Text style={s.muted}>{analysis.transferPairs.length} movement{analysis.transferPairs.length===1?" matches":"s match"} an equal and opposite movement in an earlier statement. Recording them moves money between your accounts without creating income or project cost.</Text><Pressable disabled={busy||transfersPosted} onPress={postTransfers} style={[s.secondary,(busy||transfersPosted)&&s.disabled]}><Text style={s.secondaryText}>{transfersPosted?"Transfers recorded":`Record ${analysis.transferPairs.length} transfer${analysis.transferPairs.length===1?"":"s"}`}</Text></Pressable></Card>}

      {!!projectGroups.length&&<View style={s.section}><Text style={s.sectionTitle}>Ready by project</Text><Text style={s.muted}>These are grouped so you do not have to approve them one by one.</Text>{projectGroups.map(group=><Card key={group.projectId} style={s.projectCard}><Text style={s.projectTitle}>{group.projectName}</Text><Text style={s.projectNumbers}>{group.items.length} entr{group.items.length===1?"y":"ies"}{group.out?` · Money out ${money(group.out)}`:""}{group.in?` · Money in ${money(group.in)}`:""}</Text><Pressable disabled={busy||postedProjects.has(group.projectId)} onPress={()=>postProjectGroup(group)} style={[s.primary,postedProjects.has(group.projectId)&&s.disabled]}><Text style={s.primaryText}>{postedProjects.has(group.projectId)?"Added to project":`Add ${group.items.length} to ${group.projectName}`}</Text></Pressable></Card>)}</View>}

      {!!analysis.decisions.length&&<View style={s.section}><Text style={s.sectionTitle}>Needs your decision</Text><Text style={s.muted}>These are grouped by the repeated relationship or construction clue. Choose once for the group rather than reviewing every bank row.</Text>{analysis.decisions.map(decision=>{
        const done=resolvedDecisions.has(decision.key);const total=decision.rows.reduce((sum,row)=>sum+Math.abs(row.signedAmount),0);const mostlyOut=decision.rows.filter(r=>r.signedAmount<0).length>=decision.rows.length/2;
        return <Card key={decision.key} style={s.decision}><Text style={s.projectTitle}>{decision.label}</Text><Text style={s.projectNumbers}>{decision.rows.length} transaction{decision.rows.length===1?"":"s"} · {money(total)} · {mostlyOut?"mostly money out":"mostly money in"}</Text><Text style={s.small}>{decision.reason}</Text>{!done&&<><Text style={s.label}>Project</Text><View style={s.chips}>{projects.map(project=><Pressable key={project.id} onPress={()=>setDecisionProjects(prev=>({...prev,[decision.key]:project.id}))} style={[s.smallChip,decisionProjects[decision.key]===project.id&&s.chipActive]}><Text style={[s.smallChipText,decisionProjects[decision.key]===project.id&&s.chipTextActive]}>{project.name}</Text></Pressable>)}</View>{mostlyOut&&<><Text style={s.label}>Cost category</Text><TextInput value={decisionCategories[decision.key]??""} onChangeText={value=>setDecisionCategories(prev=>({...prev,[decision.key]:value}))} placeholder="e.g. Labour, Painting, Materials" style={s.input}/></>}<Pressable disabled={busy||!decisionProjects[decision.key]} onPress={()=>resolveDecision(decision.key)} style={[s.secondary,(busy||!decisionProjects[decision.key])&&s.disabled]}><Text style={s.secondaryText}>Add this group</Text></Pressable><Pressable onPress={()=>setResolvedDecisions(prev=>new Set(prev).add(decision.key))}><Text style={s.ignore}>Not for a project</Text></Pressable></>}{done&&<Text style={s.done}>Decision completed</Text>}</Card>})}</View>}

      <Card style={s.finish}><Text style={s.heading}>The statement stays attached to the account.</Text><Text style={s.muted}>Only confirmed project entries and matched own-account transfers change the books. Everything else stays as statement history or waits for another decision.</Text><Pressable disabled={busy} onPress={()=>router.replace("/(tabs)/money")} style={s.primary}><Text style={s.primaryText}>Back to Money</Text></Pressable></Card>
    </>}
  </ScrollView></SafeAreaView>;
}

function Summary({label,value}:{label:string;value:string}){return <View style={s.summaryItem}><Text style={s.summaryValue}>{value}</Text><Text style={s.summaryLabel}>{label}</Text></View>}

const s=StyleSheet.create({
  center:{flex:1,alignItems:"center",justifyContent:"center",padding:20},back:{fontSize:15,fontWeight:"800",color:palette.navy,fontFamily:"sans-serif"},
  block:{gap:12},step:{fontSize:12,fontWeight:"900",letterSpacing:.8,color:"#4a7895",fontFamily:"sans-serif"},heading:{fontSize:18,lineHeight:24,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},muted:{fontSize:14,lineHeight:21,color:palette.muted,fontFamily:"sans-serif"},small:{fontSize:13,lineHeight:19,color:palette.muted,fontFamily:"sans-serif"},
  chips:{flexDirection:"row",flexWrap:"wrap",gap:8},chip:{borderWidth:1,borderColor:"#cddbe4",borderRadius:12,paddingVertical:10,paddingHorizontal:12,backgroundColor:"#fff"},chipActive:{backgroundColor:palette.navy,borderColor:palette.navy},chipText:{fontSize:13,fontWeight:"800",color:"#496477",fontFamily:"sans-serif"},chipTextActive:{color:"#fff"},
  keywordRow:{gap:6,paddingTop:4},projectName:{fontSize:14,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},input:{minHeight:52,borderWidth:1,borderColor:"#cbd9e2",borderRadius:13,paddingHorizontal:13,fontSize:16,color:palette.ink,backgroundColor:"#fff",fontFamily:"sans-serif"},
  format:{fontSize:15,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},primary:{minHeight:54,borderRadius:14,backgroundColor:palette.navy,alignItems:"center",justifyContent:"center",paddingHorizontal:14},primaryText:{fontSize:15,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},secondary:{minHeight:50,borderRadius:13,borderWidth:1,borderColor:"#aac4d5",backgroundColor:"#fff",alignItems:"center",justifyContent:"center",paddingHorizontal:14},secondaryText:{fontSize:14,fontWeight:"900",color:palette.navy,fontFamily:"sans-serif"},disabled:{opacity:.45},file:{fontSize:13,fontWeight:"700",color:"#547184",fontFamily:"sans-serif"},link:{fontSize:14,fontWeight:"900",color:palette.navy,fontFamily:"sans-serif"},
  summary:{gap:13,backgroundColor:"#eef5f8"},summaryGrid:{flexDirection:"row",flexWrap:"wrap",gap:8},summaryItem:{width:"48%",minHeight:84,borderRadius:13,backgroundColor:"#fff",borderWidth:1,borderColor:"#d7e3e9",padding:12,justifyContent:"center"},summaryValue:{fontSize:23,fontWeight:"900",color:palette.navy,fontFamily:"sans-serif"},summaryLabel:{fontSize:12,lineHeight:17,color:palette.muted,marginTop:3,fontFamily:"sans-serif"},waiting:{gap:8,backgroundColor:"#fff9ea",borderColor:"#ead7a8"},section:{gap:10},sectionTitle:{fontSize:21,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},projectCard:{gap:10},projectTitle:{fontSize:17,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},projectNumbers:{fontSize:14,lineHeight:21,fontWeight:"700",color:"#536f81",fontFamily:"sans-serif"},decision:{gap:10},label:{fontSize:13,fontWeight:"900",color:"#496477",fontFamily:"sans-serif"},smallChip:{borderWidth:1,borderColor:"#cddbe4",borderRadius:10,paddingVertical:8,paddingHorizontal:10,backgroundColor:"#fff"},smallChipText:{fontSize:12,fontWeight:"800",color:"#496477",fontFamily:"sans-serif"},ignore:{fontSize:14,fontWeight:"900",color:"#7a5b4d",textAlign:"center",paddingVertical:8,fontFamily:"sans-serif"},done:{fontSize:14,fontWeight:"900",color:palette.green,fontFamily:"sans-serif"},finish:{gap:10,marginBottom:20},
});
