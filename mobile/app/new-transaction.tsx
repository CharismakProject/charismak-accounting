import { useEffect, useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { Card, ScreenTitle, baseStyles as b, money, palette } from "../components/ui";
import { readableError } from "../lib/mobile-error";

const IN_TYPES=[
  ["project_funding","Client/project funding"],["company_project_funding","Company/owner funding for project"],["company_income","Other company income"],["company_financing","Company loan / financing"]
] as const;
const OUT_TYPES=[
  ["project_expense","Project expense"],["project_advance","Site advance / imprest"],["reimbursement","Reimbursement"],["company_expense","Company overhead"]
] as const;
const DEFAULT_CATEGORIES=["Materials","Labour","Subcontractor","Transport / Logistics","Equipment / Hire","Site Operations","Professional Fees","Staff Costs","Administration / Office","Software / IT","Utilities","Repairs / Maintenance"];
const makeRequestKey=()=>`00000000-0000-4000-8000-${Math.floor(Math.random()*1e12).toString().padStart(12,"0")}`;

type AccountRow={account_id:string;name:string;account_type:string;currency_code:string;recorded_balance:number|string};
type ProjectRow={id:string;project_code?:string|null;name:string;status:string};

export default function NewTransaction(){
  const params=useLocalSearchParams<{kind?:string;projectId?:string}>();
  const direction=params.kind==="income"?"income":"expense";
  const options=direction==="income"?IN_TYPES:OUT_TYPES;
  const [entryKind,setEntryKind]=useState<string>(direction==="income"?"project_funding":"project_expense");
  const [accounts,setAccounts]=useState<AccountRow[]>([]),[projects,setProjects]=useState<ProjectRow[]>([]);
  const [accountId,setAccountId]=useState(""),[projectId,setProjectId]=useState(params.projectId||"");
  const [amount,setAmount]=useState(""),[description,setDescription]=useState(""),[counterparty,setCounterparty]=useState(""),[reference,setReference]=useState(""),[category,setCategory]=useState("");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[loadError,setLoadError]=useState("");

  useEffect(()=>{(async()=>{try{const w=await loadWorkspace();const[a,p]=await Promise.all([
    supabase.from("account_recorded_balances").select("account_id,name,recorded_balance,account_type,currency_code").eq("company_id",w.membership.company_id).order("name"),
    supabase.from("projects").select("id,project_code,name,status").eq("company_id",w.membership.company_id).neq("status","archived").order("name")
  ]);if(a.error)throw a.error;if(p.error)throw p.error;const accountRows=(a.data??[]) as AccountRow[];setAccounts(accountRows);setProjects((p.data??[]) as ProjectRow[]);if(accountRows.length===1)setAccountId(accountRows[0].account_id);setLoading(false)}catch(e){setLoadError(readableError(e));setLoading(false)}})()},[]);

  const projectRequired=["project_funding","company_project_funding","project_expense","project_advance"].includes(entryKind);
  const projectAllowed=projectRequired||entryKind==="reimbursement";
  const categoryRequired=["project_expense","company_expense","reimbursement"].includes(entryKind);
  const selectedAccount=useMemo(()=>accounts.find(a=>a.account_id===accountId),[accounts,accountId]);

  function changeKind(value:string){setEntryKind(value);if(!["project_funding","company_project_funding","project_expense","project_advance","reimbursement"].includes(value))setProjectId("");if(!["project_expense","company_expense","reimbursement","project_advance"].includes(value))setCategory("")}

  async function post(){
    const numeric=Number(amount.replace(/,/g,""));
    if(!accountId)return Alert.alert("Account required","Choose where the money moved.");
    if(!Number.isFinite(numeric)||numeric<=0)return Alert.alert("Amount required","Enter an amount greater than zero.");
    if(projectRequired&&!projectId)return Alert.alert("Project required","Choose the project this transaction belongs to.");
    if(!description.trim())return Alert.alert("Description required","Describe what the money was for.");
    if(categoryRequired&&!category.trim())return Alert.alert("Category required","Choose or enter a cost category.");
    setBusy(true);
    try{
      const w=await loadWorkspace();
      const {error}=await supabase.rpc("post_manual_transaction_atomic",{
        request_key:makeRequestKey(),
        target_company:w.membership.company_id,
        target_account:accountId,
        target_project:projectId||null,
        entry_kind:entryKind,
        entry_date:date,
        entry_amount:numeric,
        entry_narration:description.trim(),
        entry_reference:reference.trim()||null,
        entry_counterparty:counterparty.trim()||null,
        entry_category:category.trim()||null,
        entry_funding_source:entryKind==="project_funding"?"client":null,
        entry_notes:null,
        target_approval_request:null,
      });
      if(error)throw error;
      Alert.alert("Recorded","The transaction, account balance and project position were posted together.",[{text:"Done",onPress:()=>router.replace("/(tabs)/money")}]);
    }catch(e){Alert.alert("Could not record transaction",readableError(e));}
    finally{setBusy(false);}
  }

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content} keyboardShouldPersistTaps="handled">
    <Pressable onPress={()=>router.back()}><Text style={s.back}>← Back</Text></Pressable>
    <ScreenTitle eyebrow={direction==="income"?"MONEY IN":"MONEY OUT"} title={direction==="income"?"Record money received":"Record money spent"} subtitle="Record the real movement once. Charismak posts the accounting and job-cost effect together."/>
    {!!loadError&&<Card style={s.error}><Text style={s.errorTitle}>Could not prepare this form</Text><Text style={s.errorCopy}>{loadError}</Text></Card>}
    {!loading&&!accounts.length&&<Card><Text style={s.emptyTitle}>No financial account yet</Text><Text style={s.emptyCopy}>Upload a statement first and Charismak can create or match the account automatically. Manual account setup is optional.</Text><Pressable style={s.smallButton} onPress={()=>router.push("/import-statement")}><Text style={s.smallButtonText}>Upload statement</Text></Pressable></Card>}
    <Card style={s.form}>
      <Text style={s.label}>What happened?</Text><View style={s.options}>{options.map(([value,label])=><Pressable key={value} onPress={()=>changeKind(value)} style={[s.option,entryKind===value&&s.optionActive]}><Text style={[s.optionText,entryKind===value&&s.optionTextActive]}>{label}</Text></Pressable>)}</View>
      <Text style={s.label}>Financial account</Text>{accounts.map(a=><Pressable key={a.account_id} onPress={()=>setAccountId(a.account_id)} style={[s.pick,accountId===a.account_id&&s.pickActive]}><View style={{flex:1}}><Text style={s.pickTitle}>{a.name}</Text><Text style={s.pickMeta}>{String(a.account_type||"account").replaceAll("_"," ")} · {a.currency_code||"NGN"} · recorded {money(Number(a.recorded_balance||0))}</Text></View><Text style={s.radio}>{accountId===a.account_id?"●":"○"}</Text></Pressable>)}
      {projectAllowed&&<><Text style={s.label}>Project {projectRequired?"":"(optional)"}</Text>{!projects.length?<Text style={s.help}>No projects available.</Text>:projects.map(p=><Pressable key={p.id} onPress={()=>setProjectId(p.id)} style={[s.pick,projectId===p.id&&s.pickActive]}><View style={{flex:1}}><Text style={s.pickTitle}>{p.project_code?`${p.project_code} · `:""}{p.name}</Text></View><Text style={s.radio}>{projectId===p.id?"●":"○"}</Text></Pressable>)}</>}
      <Field label="Amount (₦)" value={amount} onChange={setAmount} placeholder="0" keyboard="decimal-pad"/>
      <Field label="Date" value={date} onChange={setDate} placeholder="YYYY-MM-DD"/>
      <Field label="Description" value={description} onChange={setDescription} placeholder="e.g. Cement and delivery for Jahi"/>
      <Field label={direction==="income"?"Received from (optional)":"Paid to (optional)"} value={counterparty} onChange={setCounterparty} placeholder="Client, supplier or person"/>
      {(categoryRequired||entryKind==="project_advance")&&<View style={s.field}><Text style={s.label}>Category {categoryRequired?"":"(optional)"}</Text><View style={s.chips}>{DEFAULT_CATEGORIES.map(c=><Pressable key={c} onPress={()=>setCategory(c)} style={[s.chip,category===c&&s.chipActive]}><Text style={[s.chipText,category===c&&s.chipTextActive]}>{c}</Text></Pressable>)}</View><TextInput value={category} onChangeText={setCategory} placeholder="Or type a category" style={s.input}/></View>}
      <Field label="Reference (optional)" value={reference} onChange={setReference} placeholder="Receipt, transfer or invoice reference"/>
      {!!selectedAccount&&<View style={s.note}><Text style={s.noteTitle}>Posting to {selectedAccount.name}</Text><Text style={s.noteCopy}>This is an accounting record, not just a note. If it is wrong later, correct it through the audit/reversal workflow rather than deleting history.</Text></View>}
      <Pressable disabled={busy||loading||!accounts.length} onPress={post} style={[s.post,busy&&{opacity:.5}]}><Text style={s.postText}>{busy?"Posting…":direction==="income"?"Record money in":"Record money out"}</Text></Pressable>
    </Card>
  </ScrollView></SafeAreaView>;
}

function Field({label,value,onChange,placeholder,keyboard="default"}:{label:string;value:string;onChange:(v:string)=>void;placeholder:string;keyboard?:"default"|"decimal-pad"}){return <View style={s.field}><Text style={s.label}>{label}</Text><TextInput value={value} onChangeText={onChange} placeholder={placeholder} keyboardType={keyboard} style={s.input}/></View>}
const s=StyleSheet.create({back:{fontSize:15,fontWeight:"800",color:palette.navy,fontFamily:"sans-serif"},form:{gap:14},label:{fontSize:14,fontWeight:"900",color:"#38566b",fontFamily:"sans-serif"},options:{gap:7},option:{minHeight:48,borderWidth:1,borderColor:"#d1dde5",borderRadius:13,paddingHorizontal:13,justifyContent:"center",backgroundColor:"#fff"},optionActive:{backgroundColor:palette.navy,borderColor:palette.navy},optionText:{fontSize:14,fontWeight:"800",color:"#496577",fontFamily:"sans-serif"},optionTextActive:{color:"#fff"},pick:{minHeight:58,borderWidth:1,borderColor:"#d2dfe7",borderRadius:13,padding:12,flexDirection:"row",alignItems:"center",gap:8,backgroundColor:"#fff"},pickActive:{borderColor:"#4d91b5",backgroundColor:"#eef6fa"},pickTitle:{fontSize:14,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},pickMeta:{fontSize:12,color:palette.muted,marginTop:3,fontFamily:"sans-serif",textTransform:"capitalize"},radio:{fontSize:20,color:palette.navy},field:{gap:7},input:{minHeight:56,borderWidth:1,borderColor:"#cbd9e2",borderRadius:14,paddingHorizontal:14,fontSize:17,color:palette.ink,backgroundColor:"#fff",fontFamily:"sans-serif"},chips:{flexDirection:"row",flexWrap:"wrap",gap:7},chip:{paddingVertical:8,paddingHorizontal:10,borderRadius:11,borderWidth:1,borderColor:"#d2dde5",backgroundColor:"#fff"},chipActive:{backgroundColor:"#e7f2f7",borderColor:"#6b9eb9"},chipText:{fontSize:12,fontWeight:"700",color:"#557083",fontFamily:"sans-serif"},chipTextActive:{color:palette.navy},note:{borderRadius:13,padding:13,backgroundColor:"#eef5f8"},noteTitle:{fontSize:14,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},noteCopy:{fontSize:13,lineHeight:19,color:palette.muted,marginTop:3,fontFamily:"sans-serif"},post:{minHeight:58,borderRadius:14,backgroundColor:palette.navy,alignItems:"center",justifyContent:"center"},postText:{fontSize:16,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},help:{fontSize:13,color:palette.muted,fontFamily:"sans-serif"},error:{backgroundColor:"#fff7f7",borderColor:"#e8bcbc"},errorTitle:{fontSize:15,fontWeight:"900",color:"#7f2929",fontFamily:"sans-serif"},errorCopy:{fontSize:13,lineHeight:19,color:"#815858",marginTop:3,fontFamily:"sans-serif"},emptyTitle:{fontSize:17,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},emptyCopy:{fontSize:13,lineHeight:19,color:palette.muted,marginTop:4,fontFamily:"sans-serif"},smallButton:{alignSelf:"flex-start",backgroundColor:palette.navy,borderRadius:11,paddingHorizontal:13,paddingVertical:10,marginTop:12},smallButtonText:{fontSize:13,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"}});