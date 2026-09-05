import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { Card, money, ProgressBar, ScreenTitle, SectionHead, baseStyles as b } from "../../components/ui";

export default function Projects(){
  const [loading,setLoading]=useState(true);
  const [refreshing,setRefreshing]=useState(false);
  const [projects,setProjects]=useState<any[]>([]);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    setError("");
    const [{data:p,error:projectError},{data:positions,error:positionError}]=await Promise.all([
      supabase.from("projects").select("id,project_code,name,location,status,reported_progress,contract_value").neq("status","closed").order("name"),
      supabase.from("project_financial_positions").select("project_id,received,spent,funding_position")
    ]);
    if(projectError)throw projectError;
    if(positionError)throw positionError;
    const finance=new Map((positions??[]).map((row:any)=>[row.project_id,row]));
    setProjects((p??[]).map((row:any)=>({...row,finance:finance.get(row.id)})));
    setLoading(false);setRefreshing(false);
  },[]);

  useFocusEffect(useCallback(()=>{load().catch((e:any)=>{setError(e?.message||"Could not load projects");setLoading(false);setRefreshing(false);});},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;

  const contract=projects.reduce((a,p)=>a+Number(p.contract_value||0),0);
  const funding=projects.reduce((a,p)=>a+Number(p.finance?.received||0),0);
  const spend=projects.reduce((a,p)=>a+Number(p.finance?.spent||0),0);

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load().catch((e:any)=>{setError(e?.message||"Could not refresh projects");setRefreshing(false);});}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="PROJECTS" title="Your projects" subtitle="Create the live project first. Then add its BOQ and money records as their real sources become available."/>
    <View style={s.topActions}><Pressable onPress={()=>router.push("/new-project")} style={s.newProject}><Text style={s.newProjectText}>＋ New project</Text></Pressable><Pressable onPress={()=>router.push("/(tabs)/add")} style={s.addRecords}><Text style={s.addRecordsText}>Add records</Text></Pressable></View>
    {!!error&&<Card style={s.errorCard}><Text style={s.errorTitle}>Could not load projects</Text><Text style={s.errorCopy}>{error}</Text></Card>}
    {!!projects.length&&<View style={s.summary}><View><Text style={s.summaryLabel}>Contract value</Text><Text style={s.summaryValue}>{money(contract)}</Text></View><View><Text style={s.summaryLabel}>Received</Text><Text style={s.summaryValue}>{money(funding)}</Text></View><View><Text style={s.summaryLabel}>Spent</Text><Text style={s.summaryValue}>{money(spend)}</Text></View></View>}
    <SectionHead title={`${projects.length} live project${projects.length===1?"":"s"}`}/>
    {!projects.length&&!error&&<Card><Text style={s.emptyTitle}>No projects yet.</Text><Text style={s.emptyCopy}>Create the first project, then upload its BOQ from inside the project.</Text><Pressable style={s.emptyButton} onPress={()=>router.push("/new-project")}><Text style={s.emptyButtonText}>Create first project</Text></Pressable></Card>}
    {projects.map(p=>{const f=p.finance||{};const received=Number(f.received||0);const spent=Number(f.spent||0);const contractValue=Number(p.contract_value||0);const progress=Math.max(0,Math.min(100,Number(p.reported_progress||0)));return <Pressable key={p.id} onPress={()=>router.push({pathname:"/project/[id]",params:{id:p.id}})}><Card style={s.card}><View style={b.row}><View style={{flex:1}}><Text style={s.code}>{p.project_code||"PROJECT"}</Text><Text style={s.name}>{p.name}</Text><Text style={s.meta}>{p.location||"Location not set"} · {String(p.status).replaceAll("_"," ")}</Text></View><View style={s.valueWrap}><Text style={s.valueLabel}>CONTRACT</Text><Text style={s.value}>{contractValue?money(contractValue):"Not set"}</Text></View></View><View><View style={s.progressHead}><Text style={s.progressLabel}>Reported progress</Text><Text style={s.progressValue}>{Math.round(progress)}%</Text></View><ProgressBar value={progress}/></View><View style={s.metrics}><Text style={s.metric}>Received {money(received)}</Text><Text style={s.metric}>Spent {money(spent)}</Text><Text style={s.metric}>Balance {money(Number(f.funding_position||0))}</Text></View></Card></Pressable>;})}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},topActions:{flexDirection:"row",gap:8},newProject:{flex:1,height:50,borderRadius:13,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center"},newProjectText:{fontSize:14,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},addRecords:{flex:1,height:50,borderRadius:13,borderWidth:1,borderColor:"#cbdbe5",backgroundColor:"#fff",alignItems:"center",justifyContent:"center"},addRecordsText:{fontSize:14,fontWeight:"900",color:"#0a4c74",fontFamily:"sans-serif"},summary:{flexDirection:"row",justifyContent:"space-between",gap:7},summaryLabel:{fontSize:11,color:"#768897",fontFamily:"sans-serif"},summaryValue:{fontSize:15,fontWeight:"900",color:"#133b57",marginTop:2,fontFamily:"sans-serif"},card:{gap:13},code:{fontSize:11,fontWeight:"900",color:"#1771ab",fontFamily:"sans-serif"},name:{fontSize:18,fontWeight:"900",color:"#14364f",marginTop:2,fontFamily:"sans-serif"},meta:{fontSize:12,lineHeight:17,color:"#81909d",marginTop:3,fontFamily:"sans-serif"},valueWrap:{alignItems:"flex-end"},valueLabel:{fontSize:10,fontWeight:"900",color:"#8595a0",fontFamily:"sans-serif"},value:{fontSize:15,fontWeight:"900",color:"#0a476c",fontFamily:"sans-serif"},progressHead:{flexDirection:"row",justifyContent:"space-between",marginBottom:5},progressLabel:{fontSize:11,color:"#6b7f8e",fontFamily:"sans-serif"},progressValue:{fontSize:11,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},metrics:{flexDirection:"row",justifyContent:"space-between",gap:8,flexWrap:"wrap"},metric:{fontSize:12,color:"#526c7e",fontFamily:"sans-serif"},emptyTitle:{fontSize:18,fontWeight:"900",color:"#173a53",fontFamily:"sans-serif"},emptyCopy:{fontSize:13,lineHeight:20,color:"#718692",marginTop:5,fontFamily:"sans-serif"},emptyButton:{backgroundColor:"#073f65",borderRadius:12,paddingVertical:13,alignItems:"center",marginTop:12},emptyButtonText:{fontSize:14,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},errorCard:{borderColor:"#e4b9b9",backgroundColor:"#fff8f8"},errorTitle:{fontSize:14,fontWeight:"900",color:"#7f2929",fontFamily:"sans-serif"},errorCopy:{fontSize:12,lineHeight:18,color:"#815858",marginTop:4,fontFamily:"sans-serif"}});