import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadWorkspace } from "../../lib/workspace";
import { Card, ScreenTitle, SectionHead, Stat, baseStyles as b, money, palette } from "../../components/ui";
import { readableError } from "../../lib/mobile-error";

export default function Reports(){
  const [loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[error,setError]=useState("");
  const [pnl,setPnl]=useState<any[]>([]),[bs,setBs]=useState<any[]>([]),[ar,setAr]=useState<any[]>([]),[ap,setAp]=useState<any[]>([]),[projects,setProjects]=useState<any[]>([]);
  const load=useCallback(async()=>{setError("");const w=await loadWorkspace();const id=w.membership.company_id;const[r1,r2,r3,r4,r5]=await Promise.all([
    supabase.from("v_profit_and_loss").select("account_type,code,name,amount").eq("company_id",id),
    supabase.from("v_balance_sheet").select("account_type,code,name,amount").eq("company_id",id),
    supabase.from("accounts_receivable").select("id,outstanding_amount,status").eq("company_id",id).neq("status","void"),
    supabase.from("accounts_payable").select("id,outstanding_amount,status").eq("company_id",id).neq("status","void"),
    supabase.from("project_financial_positions").select("project_id,name,received,spent,funding_position,status").eq("company_id",id)
  ]);const err=r1.error||r2.error||r3.error||r4.error||r5.error;if(err)throw err;setPnl(r1.data??[]);setBs(r2.data??[]);setAr(r3.data??[]);setAp(r4.data??[]);setProjects(r5.data??[]);setLoading(false);setRefreshing(false)},[]);
  useFocusEffect(useCallback(()=>{load().catch(e=>{setError(readableError(e,"Could not load accounting reports."));setLoading(false);setRefreshing(false)})},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color={palette.navy}/></View></SafeAreaView>;
  const income=pnl.filter(r=>r.account_type==="income").reduce((a,r)=>a+Number(r.amount||0),0),expenses=pnl.filter(r=>r.account_type==="expense").reduce((a,r)=>a+Number(r.amount||0),0);
  const assets=bs.filter(r=>r.account_type==="asset").reduce((a,r)=>a+Number(r.amount||0),0),liabilities=bs.filter(r=>r.account_type==="liability").reduce((a,r)=>a+Number(r.amount||0),0),equity=bs.filter(r=>r.account_type==="equity").reduce((a,r)=>a+Number(r.amount||0),0);
  const arOpen=ar.reduce((a,r)=>a+Number(r.outstanding_amount||0),0),apOpen=ap.reduce((a,r)=>a+Number(r.outstanding_amount||0),0);
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load().catch(e=>{setError(readableError(e));setRefreshing(false)})}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="REPORTS" title="Accounting, not guesswork" subtitle="Cash and project position are not profit. These reports come from the posted double-entry ledger."/>
    {!!error&&<Card style={s.error}><Text style={s.errorTitle}>Reports need attention</Text><Text style={s.errorCopy}>{error}</Text></Card>}
    <View style={b.grid}><View style={b.half}><Stat label="Operating result" value={money(income-expenses)} tone={income-expenses<0?"red":"green"} note={`Income ${money(income)} · expense ${money(expenses)}`}/></View><View style={b.half}><Stat label="Receivables" value={money(arOpen)} note="Client invoices still outstanding"/></View><View style={b.half}><Stat label="Payables" value={money(apOpen)} tone={apOpen>0?"orange":"navy"} note="Supplier bills still outstanding"/></View><View style={b.half}><Stat label="Net assets" value={money(assets-liabilities)} note={`Assets ${money(assets)} · liabilities ${money(liabilities)}`}/></View></View>
    <Card style={s.rule}><Text style={s.ruleTitle}>Cash ≠ profit</Text><Text style={s.ruleCopy}>Client funding may be an advance, loans are financing, unpaid supplier bills can still be project cost, and internal transfers are not income or expense.</Text></Card>
    <SectionHead title="Project cash positions"/>
    {projects.length?projects.map(p=><Card key={p.project_id}><Text style={s.project}>{p.name}</Text><View style={s.projectGrid}><Mini label="Received" value={money(p.received)}/><Mini label="Spent" value={money(p.spent)}/><Mini label="Cash position" value={money(p.funding_position)} tone={Number(p.funding_position)<0?"red":"normal"}/></View></Card>):<Card><Text style={b.muted}>No project financial positions yet.</Text></Card>}
    <SectionHead title="Profit & loss lines"/>{pnl.length?pnl.map((r,i)=><View key={`${r.code}-${i}`} style={s.row}><View style={{flex:1}}><Text style={s.rowTitle}>{r.code} · {r.name}</Text><Text style={s.rowMeta}>{String(r.account_type).replaceAll("_"," ")}</Text></View><Text style={s.rowAmount}>{money(r.amount)}</Text></View>):<Card><Text style={b.muted}>No posted income or expense journal lines yet.</Text></Card>}
    <SectionHead title="Balance sheet lines"/>{bs.length?bs.map((r,i)=><View key={`${r.code}-${i}`} style={s.row}><View style={{flex:1}}><Text style={s.rowTitle}>{r.code} · {r.name}</Text><Text style={s.rowMeta}>{String(r.account_type).replaceAll("_"," ")}</Text></View><Text style={s.rowAmount}>{money(r.amount)}</Text></View>):<Card><Text style={b.muted}>No balance-sheet journal lines yet.</Text></Card>}
    <Text style={s.equity}>Recorded equity: {money(equity)}</Text>
  </ScrollView></SafeAreaView>;
}
function Mini({label,value,tone="normal"}:{label:string;value:string;tone?:"normal"|"red"}){return <View style={s.mini}><Text style={s.miniLabel}>{label}</Text><Text style={[s.miniValue,tone==="red"&&{color:palette.red}]}>{value}</Text></View>}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},error:{backgroundColor:"#fff7f7",borderColor:"#e8bcbc"},errorTitle:{fontSize:15,fontWeight:"900",color:"#7f2929",fontFamily:"sans-serif"},errorCopy:{fontSize:13,lineHeight:19,color:"#815858",marginTop:4,fontFamily:"sans-serif"},rule:{backgroundColor:"#eef6fa",borderColor:"#c9dde8"},ruleTitle:{fontSize:16,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},ruleCopy:{fontSize:14,lineHeight:21,color:palette.muted,marginTop:4,fontFamily:"sans-serif"},project:{fontSize:16,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},projectGrid:{flexDirection:"row",gap:8,marginTop:12,flexWrap:"wrap"},mini:{minWidth:"30%",flex:1},miniLabel:{fontSize:12,color:palette.muted,fontFamily:"sans-serif"},miniValue:{fontSize:15,fontWeight:"900",color:palette.navy,marginTop:3,fontFamily:"sans-serif"},row:{flexDirection:"row",gap:10,alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#e1e8ed"},rowTitle:{fontSize:14,fontWeight:"800",color:palette.ink,fontFamily:"sans-serif"},rowMeta:{fontSize:12,color:palette.muted,marginTop:3,textTransform:"capitalize",fontFamily:"sans-serif"},rowAmount:{fontSize:14,fontWeight:"900",color:palette.navy,fontFamily:"sans-serif"},equity:{fontSize:13,fontWeight:"800",color:palette.muted,fontFamily:"sans-serif",paddingBottom:10}});