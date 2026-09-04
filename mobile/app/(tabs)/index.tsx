import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadWorkspace, type RoleFamily } from "../../lib/workspace";
import { baseStyles as b, Card, MiniLine, money, ProgressBar, ScreenTitle, SectionHead, Stat } from "../../components/ui";

type Project={id:string;project_code:string|null;name:string;reported_progress:number|null;contract_value:number|null;finance?:any};

export default function Home(){
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [role,setRole]=useState<RoleFamily>("md_owner");
  const [company,setCompany]=useState("Company");
  const [projects,setProjects]=useState<Project[]>([]);
  const [accounts,setAccounts]=useState<any[]>([]);
  const [needsReview,setNeedsReview]=useState(0);
  const [series,setSeries]=useState<{in:number[];out:number[];labels:string[]}>({in:[],out:[],labels:[]});
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setError("");
    const w=await loadWorkspace();setRole(w.activeRole);setCompany(w.companyName);
    const [{data:projectRows,error:projectError},{data:positions,error:positionError},{data:acct,error:accountError},{data:reviewRows,error:reviewError},{data:tx,error:txError}]=await Promise.all([
      supabase.from("projects").select("id,project_code,name,reported_progress,status,contract_value").neq("status","closed").order("name"),
      supabase.from("project_financial_positions").select("project_id,received,spent,funding_position"),
      supabase.from("account_recorded_balances").select("account_id,name,account_type,currency_code,recorded_balance"),
      supabase.from("import_rows").select("id,status").eq("status","needs_review").limit(500),
      supabase.from("transactions").select("transaction_date,amount,kind,status").eq("status","posted").order("transaction_date").limit(5000),
    ]);
    const firstError=projectError||positionError||accountError||reviewError||txError;
    if(firstError)throw firstError;

    const finance=new Map((positions??[]).map((row:any)=>[row.project_id,row]));
    setProjects((projectRows??[]).map((p:any)=>({...p,finance:finance.get(p.id)})));
    setAccounts(acct??[]);
    setNeedsReview((reviewRows??[]).length);

    const months=new Map<string,{i:number;o:number}>();
    for(const r of tx??[]){
      if(r.kind==="transfer")continue;
      const key=String(r.transaction_date||"").slice(0,7);if(!key)continue;
      const m=months.get(key)||{i:0,o:0};
      const amount=Math.abs(Number(r.amount||0));
      if(r.kind==="income")m.i+=amount;else if(r.kind==="expense")m.o+=amount;
      months.set(key,m);
    }
    const keys=[...months.keys()].sort().slice(-8);
    setSeries({labels:keys,in:keys.map(k=>months.get(k)?.i||0),out:keys.map(k=>months.get(k)?.o||0)});
    setLoading(false);setRefreshing(false);
  },[]);

  useFocusEffect(useCallback(()=>{load().catch((e:any)=>{setError(e?.message||"Could not load company data");setLoading(false);setRefreshing(false);});},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;

  const funding=projects.reduce((a,p)=>a+Number(p.finance?.received||0),0);
  const spent=projects.reduce((a,p)=>a+Number(p.finance?.spent||0),0);
  const fundingPosition=projects.reduce((a,p)=>a+Number(p.finance?.funding_position||0),0);
  const contractValue=projects.reduce((a,p)=>a+Number(p.contract_value||0),0);
  const cash=accounts.reduce((a,r)=>a+Number(r.recorded_balance||0),0);
  const roleTitle=role==="accountant_cfo"?"Finance today":role==="project_manager"?"My projects":"Company today";
  const roleSub=role==="accountant_cfo"?"Recorded cash, imports and project spending.":role==="project_manager"?"Site money, project records and reported progress.":"The live Accounting position that needs your attention.";

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load().catch((e:any)=>{setError(e?.message||"Could not refresh company data");setRefreshing(false);})}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow={company.toUpperCase()} title={roleTitle} subtitle={roleSub}/>

    {!!error&&<Card style={s.errorCard}><Text style={s.errorTitle}>Some live data could not load</Text><Text style={s.errorCopy}>{error}</Text></Card>}

    <View style={b.grid}>
      {role==="accountant_cfo"?<>
        <View style={b.half}><Stat label="Recorded account cash" value={money(cash)} note={`${accounts.length} account${accounts.length===1?"":"s"}`}/></View>
        <View style={b.half}><Stat label="Needs review" value={String(needsReview)} note="Imported rows" tone={needsReview?"orange":"green"}/></View>
        <View style={b.half}><Stat label="Project received" value={money(funding)} note={`${projects.length} live projects`}/></View>
        <View style={b.half}><Stat label="Project spend" value={money(spent)} note="Posted Accounting records"/></View>
      </>:<>
        <View style={b.half}><Stat label="Project received" value={money(funding)} note={`${projects.length} live projects`}/></View>
        <View style={b.half}><Stat label="Project spend" value={money(spent)} note="Posted Accounting records"/></View>
        <View style={b.half}><Stat label="Contract value recorded" value={money(contractValue)} note="Only where entered"/></View>
        <View style={b.half}><Stat label="Funding position" value={money(fundingPosition)} note="Received less recorded spend" tone={fundingPosition<0?"orange":"navy"}/></View>
      </>}
    </View>

    <SectionHead title="Money in vs money out"/><Card><MiniLine values={series.in.length?series.in:[0,0]} comparison={series.out.length?series.out:[0,0]}/><View style={b.row}><Text style={b.muted}>{series.labels[0]||"No posted monthly data yet"}</Text><Text style={b.muted}>{series.labels.at(-1)||""}</Text></View></Card>

    <SectionHead title={role==="project_manager"?"Projects I can work on":"Projects"} action="See all" onPress={()=>router.push("/(tabs)/projects")}/>
    {projects.slice(0,6).map(p=>{const f=p.finance||{};const received=Number(f.received||0);const spent0=Number(f.spent||0);const basis=Number(p.contract_value||0)||received;const used=basis?Math.min(100,spent0/basis*100):0;return <Pressable key={p.id} onPress={()=>router.push({pathname:"/project/[id]",params:{id:p.id}})}><Card style={s.project}><View style={b.row}><View style={{flex:1}}><Text style={s.projectCode}>{p.project_code||"PROJECT"}</Text><Text style={s.projectName}>{p.name}</Text></View><Text style={s.projectValue}>{money(Number(p.contract_value||0)||received)}</Text></View><ProgressBar value={used}/><View style={s.projectFoot}><Text>Received {money(received)}</Text><Text>Spent {money(spent0)}</Text><Text>{Math.round(Number(p.reported_progress||0))}% reported</Text></View></Card></Pressable>})}

    <Pressable style={s.add} onPress={()=>router.push("/(tabs)/add")}><Text style={s.addPlus}>＋</Text><View><Text style={s.addTitle}>Add to Charismak App</Text><Text style={s.addCopy}>Upload statements, invoices, BOQs, receipts or project records together.</Text></View></Pressable>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},project:{gap:10},projectCode:{fontSize:9,color:"#1771ab",fontWeight:"900"},projectName:{fontSize:15,fontWeight:"800",color:"#16374f",marginTop:2},projectValue:{fontSize:13,fontWeight:"900",color:"#0a4265"},projectFoot:{flexDirection:"row",justifyContent:"space-between",gap:7},add:{flexDirection:"row",gap:12,alignItems:"center",backgroundColor:"#073f65",padding:15,borderRadius:18,marginTop:4},addPlus:{fontSize:30,color:"white"},addTitle:{fontSize:14,fontWeight:"900",color:"white"},addCopy:{fontSize:10,color:"#c7dae7",marginTop:3,maxWidth:280},errorCard:{borderColor:"#e4b9b9",backgroundColor:"#fff8f8"},errorTitle:{fontSize:13,fontWeight:"900",color:"#7f2929"},errorCopy:{fontSize:10,lineHeight:15,color:"#815858",marginTop:4}});
