import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadWorkspace, type RoleFamily } from "../../lib/workspace";
import { baseStyles as b, Card, MiniLine, money, ProgressBar, ScreenTitle, SectionHead, Stat } from "../../components/ui";

type Project={id:string;project_code:string;name:string;progress_percent:number|null;summary:any;commercial?:any};

export default function Home(){
  const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [role,setRole]=useState<RoleFamily>("md_owner");const [company,setCompany]=useState("Company");const [projects,setProjects]=useState<Project[]>([]);const [accounts,setAccounts]=useState<any[]>([]);const [approvals,setApprovals]=useState<any[]>([]);const [needsReview,setNeedsReview]=useState(0);const [series,setSeries]=useState<{in:number[];out:number[];labels:string[]}>({in:[],out:[],labels:[]});
  const load=useCallback(async()=>{
    const w=await loadWorkspace();setRole(w.activeRole);setCompany(w.companyName);
    const [{data:projectRows},{data:commercial},{data:acct},{data:appr},{data:intakes},{data:tx}]=await Promise.all([
      supabase.from("projects").select("id,project_code,name,progress_percent,status,summary:project_financial_summaries(funding_received,confirmed_expenditure,cash_balance,outstanding_commitments,forecast_profit,revised_budget,forecast_final_cost)").neq("status","archived").order("name"),
      supabase.from("project_commercial_positions").select("project_id,identified_commercial_value,base_scope,additional_scope,variations,documented_client_invoices"),
      supabase.from("financial_accounts").select("id,institution_name,account_name,current_balance,balance_as_of").eq("is_active",true).order("institution_name"),
      supabase.from("approval_requests").select("id,project_id,description,amount,status,urgency,requested_at").eq("status","pending").order("requested_at",{ascending:false}).limit(30),
      supabase.from("intake_items").select("id,status").eq("status","needs_review"),
      supabase.from("canonical_transactions").select("transaction_date,signed_amount,classification,status,is_personal_non_business,is_internal_transfer").eq("status","posted").order("transaction_date").limit(5000),
    ]);
    const cmap=new Map((commercial??[]).map((c:any)=>[c.project_id,c]));setProjects((projectRows??[]).map((p:any)=>({...p,summary:Array.isArray(p.summary)?p.summary[0]:p.summary,commercial:cmap.get(p.id)})));setAccounts(acct??[]);setApprovals(appr??[]);setNeedsReview((intakes??[]).length);
    const months=new Map<string,{i:number;o:number}>();for(const r of tx??[]){if(r.is_personal_non_business||r.is_internal_transfer)continue;const key=String(r.transaction_date||"").slice(0,7);if(!key)continue;const m=months.get(key)||{i:0,o:0};const a=Number(r.signed_amount||0);if(a>0)m.i+=a;else m.o+=Math.abs(a);months.set(key,m)}const keys=[...months.keys()].sort().slice(-8);setSeries({labels:keys,in:keys.map(k=>months.get(k)?.i||0),out:keys.map(k=>months.get(k)?.o||0)});
    setLoading(false);setRefreshing(false);
  },[]);
  useFocusEffect(useCallback(()=>{load().catch(()=>setLoading(false));},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;

  const funding=projects.reduce((a,p)=>a+Number(p.summary?.funding_received||0),0);const spent=projects.reduce((a,p)=>a+Number(p.summary?.confirmed_expenditure||0),0);const commercial=projects.reduce((a,p)=>a+Number(p.commercial?.identified_commercial_value||0),0);const commitments=projects.reduce((a,p)=>a+Number(p.summary?.outstanding_commitments||0),0);const cash=accounts.reduce((a,r)=>a+Number(r.current_balance||0),0);
  const roleTitle=role==="accountant_cfo"?"Finance today":role==="project_director"?"Project portfolio":role==="project_manager"?"My projects":"Company today";
  const roleSub=role==="accountant_cfo"?"Cash, statements, approvals and exceptions.":role==="project_director"?"Cost, funding, commitments and delivery risk.":role==="project_manager"?"Site money, requests, project records and progress.":"The numbers and decisions that need your attention.";
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow={company.toUpperCase()} title={roleTitle} subtitle={roleSub}/>
    <View style={b.grid}>
      {role==="accountant_cfo"?<><View style={b.half}><Stat label="Recorded account cash" value={money(cash)} note={`${accounts.length} account${accounts.length===1?"":"s"}`}/></View><View style={b.half}><Stat label="Needs your help" value={String(needsReview)} note="Documents / statements" tone={needsReview?"orange":"green"}/></View><View style={b.half}><Stat label="Pending approvals" value={String(approvals.length)} note="Finance work queue"/></View><View style={b.half}><Stat label="Project spend" value={money(spent)} note="Confirmed transactions"/></View></>:<><View style={b.half}><Stat label="Project funding" value={money(funding)} note={`${projects.length} projects`}/></View><View style={b.half}><Stat label="Confirmed spend" value={money(spent)} note="From project records"/></View><View style={b.half}><Stat label="Commercial value" value={money(commercial)} note="Base + additions + variations"/></View><View style={b.half}><Stat label="Still committed" value={money(commitments)} note={`${approvals.length} approvals pending`} tone={commitments>funding?"orange":"navy"}/></View></>}
    </View>

    <SectionHead title={role==="accountant_cfo"?"Money in vs money out":"Company money progression"}/><Card><MiniLine values={series.in.length?series.in:[0,0]} comparison={series.out.length?series.out:[0,0]}/><View style={b.row}><Text style={b.muted}>{series.labels[0]||"No confirmed monthly data yet"}</Text><Text style={b.muted}>{series.labels.at(-1)||""}</Text></View></Card>

    <SectionHead title={role==="project_manager"?"Projects I can work on":"Projects"} action="See all" onPress={()=>router.push("/(tabs)/projects")}/>
    {projects.slice(0,6).map(p=>{const s0=p.summary||{};const used=Number(s0.funding_received||0)>0?Math.min(100,Number(s0.confirmed_expenditure||0)/Number(s0.funding_received||1)*100):0;return <Pressable key={p.id} onPress={()=>router.push({pathname:"/project/[id]",params:{id:p.id}})}><Card style={s.project}><View style={b.row}><View style={{flex:1}}><Text style={s.projectCode}>{p.project_code}</Text><Text style={s.projectName}>{p.name}</Text></View><Text style={s.projectValue}>{money(p.commercial?.identified_commercial_value||s0.funding_received)}</Text></View><ProgressBar value={used}/><View style={s.projectFoot}><Text>Funding {money(s0.funding_received)}</Text><Text>Spent {money(s0.confirmed_expenditure)}</Text><Text>{Math.round(Number(p.progress_percent||0))}% site</Text></View></Card></Pressable>})}
    <Pressable style={s.add} onPress={()=>router.push("/(tabs)/add")}><Text style={s.addPlus}>＋</Text><View><Text style={s.addTitle}>Add to Charismak Accounting</Text><Text style={s.addCopy}>Upload statements, invoices, BOQs, receipts or project records together.</Text></View></Pressable>
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},project:{gap:10},projectCode:{fontSize:9,color:"#1771ab",fontWeight:"900"},projectName:{fontSize:15,fontWeight:"800",color:"#16374f",marginTop:2},projectValue:{fontSize:13,fontWeight:"900",color:"#0a4265"},projectFoot:{flexDirection:"row",justifyContent:"space-between",gap:7},add:{flexDirection:"row",gap:12,alignItems:"center",backgroundColor:"#073f65",padding:15,borderRadius:18,marginTop:4},addPlus:{fontSize:30,color:"white"},addTitle:{fontSize:14,fontWeight:"900",color:"white"},addCopy:{fontSize:10,color:"#c7dae7",marginTop:3,maxWidth:280}});
