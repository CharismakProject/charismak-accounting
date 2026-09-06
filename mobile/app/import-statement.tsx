import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { readableError } from "../lib/mobile-error";
import { parseStandardStatement, type StatementRow } from "../lib/statement-import";
import { matchStatementAccount, suggestAccountName } from "../lib/statement-account-match";
import { Card, ScreenTitle, baseStyles as b, money, palette } from "../components/ui";

type WorkspaceShape = Awaited<ReturnType<typeof loadWorkspace>>;
type Account = { id: string; name: string; account_type: string; currency_code: string };
type Project = { id: string; name: string; project_code?: string | null };
type ParsedStatement = { fileName: string; rows: StatementRow[] };
type StageSummary = { importId: string; total: number; ready: number; duplicates: number; needsReview: number };

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function projectMatch(description: string, projects: Project[]) {
  const text = normalize(description);
  const matches = projects.filter(project => {
    const terms = [project.name, project.project_code ?? ""].map(normalize).filter(term => term.length >= 3);
    return terms.some(term => text.includes(term));
  });
  return matches.length === 1 ? matches[0].id : null;
}

function stageRows(rows: StatementRow[], projects: Project[]) {
  return rows.map(row => {
    const projectId = projectMatch(row.description, projects);
    return {
      rowNumber: row.rowIndex,
      date: row.date,
      kind: row.signedAmount < 0 ? "expense" : "income",
      amount: Math.abs(row.signedAmount),
      title: row.description,
      description: row.reference ? `Reference: ${row.reference}` : "",
      category: null,
      party: null,
      projectId,
      needsReview: !projectId,
      reviewReason: projectId ? null : projects.length ? "Project not confidently identified" : "No project exists yet; assign later",
      raw: {
        valueDate: row.valueDate,
        debit: row.debit,
        credit: row.credit,
        balance: row.balance,
        reference: row.reference,
        fingerprint: row.fingerprint,
      },
    };
  });
}

export default function ImportStatement(){
  const [workspace,setWorkspace]=useState<WorkspaceShape|null>(null);
  const [accounts,setAccounts]=useState<Account[]>([]);
  const [projects,setProjects]=useState<Project[]>([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [progress,setProgress]=useState("");
  const [parsed,setParsed]=useState<ParsedStatement|null>(null);
  const [selectedAccountId,setSelectedAccountId]=useState("");
  const [staged,setStaged]=useState<StageSummary|null>(null);

  useEffect(()=>{(async()=>{
    try{
      const w=await loadWorkspace();setWorkspace(w);
      const [{data:a,error:ae},{data:p,error:pe}]=await Promise.all([
        supabase.from("financial_accounts").select("id,name,account_type,currency_code").eq("company_id",w.membership.company_id).eq("is_active",true).order("name"),
        supabase.from("projects").select("id,name,project_code").eq("company_id",w.membership.company_id).neq("status","closed").order("name"),
      ]);
      if(ae)throw ae;if(pe)throw pe;
      setAccounts((a??[]).map((row:any)=>({id:String(row.id),name:String(row.name),account_type:String(row.account_type||"bank"),currency_code:String(row.currency_code||"NGN")})));
      setProjects((p??[]).map((row:any)=>({id:String(row.id),name:String(row.name),project_code:row.project_code?String(row.project_code):null})));
    }catch(e){Alert.alert("Could not open statement upload",readableError(e));}
    finally{setLoading(false);}
  })()},[]);

  const selectedAccount=accounts.find(account=>account.id===selectedAccountId)??null;
  const totals=useMemo(()=>{
    const rows=parsed?.rows??[];
    return rows.reduce((acc,row)=>{if(row.signedAmount<0)acc.out+=Math.abs(row.signedAmount);else acc.in+=row.signedAmount;return acc},{in:0,out:0});
  },[parsed]);

  async function stage(accountId:string, statement=parsed){
    if(!workspace||!statement||busy||staged)return;
    setBusy(true);setProgress("Staging statement safely…");
    try{
      const {data,error}=await supabase.rpc("stage_import_batch",{
        target_company_id:workspace.membership.company_id,
        target_project_id:null,
        target_account_id:accountId,
        import_filename:statement.fileName,
        import_source_type:"bank_statement",
        parsed_rows:stageRows(statement.rows,projects),
      });
      if(error)throw error;
      const result=(data??{}) as any;
      setSelectedAccountId(accountId);
      setStaged({
        importId:String(result.importId||""),
        total:Number(result.total||statement.rows.length),
        ready:Number(result.ready||0),
        duplicates:Number(result.duplicates||0),
        needsReview:Number(result.needsReview||0),
      });
      setProgress("");
    }catch(e){setProgress("");Alert.alert("Could not stage statement",readableError(e,"Nothing was posted. Please try again."));}
    finally{setBusy(false);}
  }

  async function chooseStatement(){
    if(!workspace||busy)return;
    const picked=await DocumentPicker.getDocumentAsync({
      type:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","text/csv","application/csv","text/comma-separated-values"],
      multiple:false,
      copyToCacheDirectory:true,
    });
    if(picked.canceled)return;
    const asset=picked.assets[0];
    const lower=asset.name.toLowerCase();
    if(!lower.endsWith(".xlsx")&&!lower.endsWith(".csv"))return Alert.alert("Use Excel or CSV","This test path currently accepts .xlsx and .csv statements.");

    setBusy(true);setProgress("Reading statement…");setParsed(null);setStaged(null);setSelectedAccountId("");
    try{
      const bytes=await (await fetch(asset.uri)).arrayBuffer();
      const rows=parseStandardStatement(bytes);
      const statement={fileName:asset.name,rows};
      setParsed(statement);
      const matched=matchStatementAccount(asset.name,accounts);
      if(matched){
        setSelectedAccountId(matched);
        setBusy(false);setProgress("");
        await stage(matched,statement);
        return;
      }
      setProgress("");
    }catch(e){setProgress("");Alert.alert("Could not read statement",readableError(e,"Check the statement format and try again."));}
    finally{setBusy(false);}
  }

  async function createAccountFromStatement(){
    if(!workspace||!parsed||busy)return;
    setBusy(true);setProgress("Creating the statement account…");
    try{
      const name=suggestAccountName(parsed.fileName);
      const {data,error}=await supabase.from("financial_accounts").insert({
        company_id:workspace.membership.company_id,
        name,
        account_type:"bank",
        currency_code:"NGN",
        is_active:true,
        created_by:workspace.user.id,
      }).select("id,name,account_type,currency_code").single();
      if(error||!data)throw error??new Error("Could not create the account");
      const account={id:String(data.id),name:String(data.name),account_type:String(data.account_type),currency_code:String(data.currency_code)};
      setAccounts(prev=>[...prev,account]);setSelectedAccountId(account.id);setBusy(false);setProgress("");
      await stage(account.id,parsed);
    }catch(e){setProgress("");Alert.alert("Could not create account",readableError(e));}
    finally{setBusy(false);}
  }

  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><Text style={s.muted}>Opening statement upload…</Text></View></SafeAreaView>;

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <Pressable onPress={()=>router.back()}><Text style={s.back}>← Back</Text></Pressable>
    <ScreenTitle eyebrow="STATEMENT UPLOAD" title="Choose the statement first" subtitle="No bank-account setup and no project setup is required before upload. Charismak reads the file, matches an existing account when it can, and stages the rows for review. Nothing is posted automatically."/>

    <Pressable disabled={busy} onPress={chooseStatement} style={[s.upload,busy&&s.disabled]}>
      <Text style={s.uploadTitle}>{busy?(progress||"Working…"):parsed?"Choose another statement":"Upload statement"}</Text>
      <Text style={s.uploadCopy}>Excel (.xlsx) or CSV · Date · Description · Debit · Credit · Balance</Text>
    </Pressable>

    {parsed&&<Card style={s.block}>
      <Text style={s.step}>FILE READ</Text><Text style={s.heading}>{parsed.fileName}</Text>
      <View style={s.metrics}><Metric label="Rows" value={parsed.rows.length.toLocaleString()}/><Metric label="Money in" value={money(totals.in)}/><Metric label="Money out" value={money(totals.out)}/></View>
    </Card>}

    {parsed&&!staged&&<Card style={s.block}>
      <Text style={s.step}>ACCOUNT MATCH</Text>
      {selectedAccount?<><Text style={s.heading}>Matched to {selectedAccount.name}</Text><Text style={s.muted}>No account form is required.</Text></>:accounts.length?<><Text style={s.heading}>Which existing account is this?</Text><Text style={s.muted}>I could not identify it confidently from the filename. Tap once; you do not need to recreate the account.</Text><View style={s.chips}>{accounts.map(account=><Pressable key={account.id} disabled={busy} onPress={()=>stage(account.id)} style={s.chip}><Text style={s.chipText}>{account.name}</Text></Pressable>)}</View></>:<><Text style={s.heading}>No account exists yet</Text><Text style={s.muted}>No setup form is needed. Charismak can create a basic bank account from this statement and you can rename it later if needed.</Text><Pressable disabled={busy} onPress={createAccountFromStatement} style={s.secondary}><Text style={s.secondaryText}>Use this statement as a new account</Text></Pressable></>}
    </Card>}

    {staged&&<Card style={s.success}>
      <Text style={s.successEye}>STAGED · NOTHING POSTED YET</Text><Text style={s.successTitle}>Statement is ready for review</Text>
      <Text style={s.successCopy}>{staged.total} rows stored · {staged.ready} confidently tied to an existing project · {staged.needsReview} waiting for project/review · {staged.duplicates} duplicate{staged.duplicates===1?"":"s"} detected.</Text>
      <Text style={s.successCopy}>Account: {accounts.find(a=>a.id===selectedAccountId)?.name||"Matched account"}</Text>
    </Card>}

    {parsed&&<Card style={s.block}>
      <Text style={s.step}>PREVIEW</Text><Text style={s.heading}>First statement rows</Text>
      {parsed.rows.slice(0,8).map(row=><View key={`${row.rowIndex}-${row.fingerprint}`} style={s.row}><View style={{flex:1}}><Text numberOfLines={2} style={s.rowTitle}>{row.description}</Text><Text style={s.rowMeta}>{row.date}{row.reference?` · ${row.reference}`:""}</Text></View><Text style={[s.rowAmount,{color:row.signedAmount<0?palette.red:palette.green}]}>{money(row.signedAmount)}</Text></View>)}
      {parsed.rows.length>8&&<Text style={s.more}>+ {parsed.rows.length-8} more rows</Text>}
    </Card>}
  </ScrollView></SafeAreaView>;
}

function Metric({label,value}:{label:string;value:string}){return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={s.metricValue}>{value}</Text></View>}

const s=StyleSheet.create({
  center:{flex:1,alignItems:"center",justifyContent:"center"},back:{fontSize:14,fontWeight:"800",color:palette.navy,fontFamily:"sans-serif"},
  upload:{minHeight:96,borderRadius:18,backgroundColor:palette.navy,padding:18,justifyContent:"center"},uploadTitle:{fontSize:20,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},uploadCopy:{fontSize:13,lineHeight:19,color:"#c8dce9",marginTop:5,fontFamily:"sans-serif"},disabled:{opacity:.55},
  block:{gap:8},step:{fontSize:10,fontWeight:"900",letterSpacing:1,color:palette.green,fontFamily:"sans-serif"},heading:{fontSize:17,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},muted:{fontSize:13,lineHeight:19,color:palette.muted,fontFamily:"sans-serif"},
  metrics:{flexDirection:"row",gap:8,flexWrap:"wrap",marginTop:4},metric:{minWidth:"30%",flex:1,backgroundColor:"#f4f7f9",borderRadius:12,padding:10},metricLabel:{fontSize:10,color:palette.muted,fontFamily:"sans-serif"},metricValue:{fontSize:14,fontWeight:"900",color:palette.ink,marginTop:3,fontFamily:"sans-serif"},
  chips:{gap:8,marginTop:4},chip:{borderWidth:1,borderColor:"#bfd2de",backgroundColor:"#f7fbfd",borderRadius:12,paddingVertical:12,paddingHorizontal:13},chipText:{fontSize:14,fontWeight:"800",color:palette.navy,fontFamily:"sans-serif"},
  secondary:{borderWidth:1,borderColor:"#b9cfdb",backgroundColor:"#eef5f8",borderRadius:12,paddingVertical:13,paddingHorizontal:14,alignItems:"center",marginTop:4},secondaryText:{fontSize:14,fontWeight:"900",color:palette.navy,fontFamily:"sans-serif"},
  success:{backgroundColor:"#e9f7f0",borderColor:"#b9dfcf"},successEye:{fontSize:10,fontWeight:"900",letterSpacing:.8,color:palette.green,fontFamily:"sans-serif"},successTitle:{fontSize:18,fontWeight:"900",color:"#174b38",marginTop:3,fontFamily:"sans-serif"},successCopy:{fontSize:13,lineHeight:19,color:"#4f7466",marginTop:5,fontFamily:"sans-serif"},
  row:{flexDirection:"row",alignItems:"center",gap:10,paddingVertical:11,borderBottomWidth:1,borderBottomColor:"#e4eaee"},rowTitle:{fontSize:13,fontWeight:"800",color:"#29475c",fontFamily:"sans-serif"},rowMeta:{fontSize:11,color:palette.muted,marginTop:3,fontFamily:"sans-serif"},rowAmount:{fontSize:13,fontWeight:"900",fontFamily:"sans-serif"},more:{fontSize:12,fontWeight:"800",color:palette.muted,marginTop:5,fontFamily:"sans-serif"},
});
