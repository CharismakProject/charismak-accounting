import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadMobileStagedProjectWorkspaces } from "../../lib/staged-project-storage";
import type { MobileStagedProjectWorkspace } from "../../lib/estimate-summary";
import { Card, money, ProgressBar, ScreenTitle, SectionHead, baseStyles as b } from "../../components/ui";

const draftMoney=(value:number|null,currency:string)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);

export default function Projects(){
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [projects,setProjects]=useState<any[]>([]);
  const [drafts,setDrafts]=useState<MobileStagedProjectWorkspace[]>([]);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setError("");
    const [{data:p,error:projectError},{data:positions,error:positionError},localDrafts]=await Promise.all([
      supabase.from("projects").select("id,project_code,name,location,status,reported_progress,contract_value").neq("status","closed").order("name"),
      supabase.from("project_financial_positions").select("project_id,received,spent,funding_position"),
      loadMobileStagedProjectWorkspaces(),
    ]);
    if(projectError)throw projectError;
    if(positionError)throw positionError;
    const finance=new Map((positions??[]).map((row:any)=>[row.project_id,row]));
    setProjects((p??[]).map((row:any)=>({...row,finance:finance.get(row.id)})));
    setDrafts(localDrafts);
    setLoading(false);
    setRefreshing(false);
  },[]);

  useFocusEffect(useCallback(()=>{load().catch((e:any)=>{setError(e?.message||"Could not load projects");setLoading(false);setRefreshing(false);});},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;

  const contract=projects.reduce((a,p)=>a+Number(p.contract_value||0),0);
  const funding=projects.reduce((a,p)=>a+Number(p.finance?.received||0),0);
  const spend=projects.reduce((a,p)=>a+Number(p.finance?.spent||0),0);

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load().catch((e:any)=>{setError(e?.message||"Could not refresh projects");setRefreshing(false);})}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="PROJECTS" title="Your project portfolio" subtitle="Live projects use the current Accounting records. Reviewed Estimate drafts stay separate until you deliberately approve them."/>
    <View style={s.topActions}><Pressable onPress={()=>router.push("/new-project")} style={s.newProject}><Text style={s.newProjectText}>＋ New project</Text></Pressable><Pressable onPress={()=>router.push("/(tabs)/add")} style={s.addRecords}><Text style={s.addRecordsText}>Add records</Text></Pressable></View>

    {!!error&&<Card style={s.errorCard}><Text style={s.errorTitle}>Could not load live projects</Text><Text style={s.errorCopy}>{error}</Text></Card>}

    {!!drafts.length&&<><SectionHead title={`From Estimate · ${drafts.length} draft${drafts.length===1?"":"s"}`}/>{drafts.map(d=><Pressable key={d.workspaceId} onPress={()=>router.push({pathname:"/project-draft/[id]",params:{id:d.workspaceId}})}><Card style={s.draftCard}><View style={b.row}><View style={{flex:1}}><Text style={s.draftStatus}>REVIEWED DRAFT · MONEY NOT LINKED</Text><Text style={s.name}>{d.project.name}</Text><Text style={s.meta}>{d.costGroups.length} cost groups · {d.materials.length} material totals</Text></View><Text style={s.value}>{draftMoney(d.project.internalCostBudget,d.project.currency)}</Text></View><View style={s.draftMetrics}><Text>Contract {draftMoney(d.project.contractValue,d.project.currency)}</Text><Text>Forecast {draftMoney(d.forecastProfit,d.project.currency)}</Text><Text>Actual —</Text></View></Card></Pressable>)}</>}

    {!!projects.length&&<View style={s.summary}><View><Text style={s.summaryLabel}>Contract value</Text><Text style={s.summaryValue}>{money(contract)}</Text></View><View><Text style={s.summaryLabel}>Received</Text><Text style={s.summaryValue}>{money(funding)}</Text></View><View><Text style={s.summaryLabel}>Spent</Text><Text style={s.summaryValue}>{money(spend)}</Text></View></View>}

    <SectionHead title={`${projects.length} live project${projects.length===1?"":"s"}`}/>
    {!projects.length&&!error&&<Card><Text style={s.emptyTitle}>No live projects yet.</Text><Text style={s.emptyCopy}>Create a project, stage one from Estimate, or add existing records.</Text></Card>}

    {projects.map(p=>{const f=p.finance||{};const received=Number(f.received||0);const spent=Number(f.spent||0);const basis=Number(p.contract_value||0)||received;const spendPct=basis?Math.min(100,spent/basis*100):0;return <Pressable key={p.id} onPress={()=>router.push({pathname:"/project/[id]",params:{id:p.id}})}><Card style={s.card}><View style={b.row}><View style={{flex:1}}><Text style={s.code}>{p.project_code||"PROJECT"}</Text><Text style={s.name}>{p.name}</Text><Text style={s.meta}>{p.location||"Location not set"} · {String(p.status).replaceAll("_"," ")} · {Math.round(Number(p.reported_progress||0))}% reported</Text></View><Text style={s.value}>{money(Number(p.contract_value||0)||received)}</Text></View><ProgressBar value={spendPct}/><View style={s.metrics}><Text>Received {money(received)}</Text><Text>Spent {money(spent)}</Text><Text>Balance {money(Number(f.funding_position||0))}</Text></View></Card></Pressable>})}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},topActions:{flexDirection:"row",gap:8},newProject:{flex:1,height:44,borderRadius:13,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center"},newProjectText:{fontSize:11,fontWeight:"900",color:"#fff"},addRecords:{flex:1,height:44,borderRadius:13,borderWidth:1,borderColor:"#cbdbe5",backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},addRecordsText:{fontSize:11,fontWeight:"900",color:"#0a4c74"},summary:{flexDirection:"row",justifyContent:"space-between",gap:7},summaryLabel:{fontSize:8,color:"#768897"},summaryValue:{fontSize:12,fontWeight:"900",color:"#133b57",marginTop:2},card:{gap:10},draftCard:{gap:10,borderColor:"#9fc3d7",backgroundColor:"#f8fbfd"},draftStatus:{fontSize:7,fontWeight:"900",color:"#16825c",letterSpacing:.4},code:{fontSize:9,fontWeight:"900",color:"#1771ab"},name:{fontSize:16,fontWeight:"900",color:"#14364f",marginTop:2},meta:{fontSize:9,color:"#81909d",marginTop:3},value:{fontSize:13,fontWeight:"900",color:"#0a476c"},metrics:{flexDirection:"row",justifyContent:"space-between",gap:6},draftMetrics:{flexDirection:"row",justifyContent:"space-between",gap:6,paddingTop:7,borderTopWidth:1,borderTopColor:"#dce6ec"},emptyTitle:{fontSize:14,fontWeight:"900",color:"#173a53"},emptyCopy:{fontSize:10,lineHeight:15,color:"#718692",marginTop:5},errorCard:{borderColor:"#e4b9b9",backgroundColor:"#fff8f8"},errorTitle:{fontSize:13,fontWeight:"900",color:"#7f2929"},errorCopy:{fontSize:10,lineHeight:15,color:"#815858",marginTop:4}});
