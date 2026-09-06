import { useCallback,useState } from "react";
import { ActivityIndicator,Pressable,RefreshControl,ScrollView,StyleSheet,Text,View } from "react-native";
import { router,useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadWorkspace } from "../../lib/workspace";
import { Card,money,ScreenTitle,SectionHead,baseStyles as b,palette } from "../../components/ui";
import { readableError } from "../../lib/mobile-error";

export default function Projects(){
  const[loading,setLoading]=useState(true),[refreshing,setRefreshing]=useState(false),[projects,setProjects]=useState<any[]>([]),[error,setError]=useState("");
  const load=useCallback(async()=>{setError("");const w=await loadWorkspace();const[p,pos]=await Promise.all([
    supabase.from("projects").select("id,project_code,name,location,status,contract_value,client_name").eq("company_id",w.membership.company_id).neq("status","closed").order("name"),
    supabase.from("project_financial_positions").select("project_id,received,spent,funding_position").eq("company_id",w.membership.company_id)
  ]);if(p.error)throw p.error;if(pos.error)throw pos.error;const f=new Map((pos.data??[]).map((r:any)=>[r.project_id,r]));setProjects((p.data??[]).map((r:any)=>({...r,finance:f.get(r.id)})));setLoading(false);setRefreshing(false)},[]);
  useFocusEffect(useCallback(()=>{load().catch(e=>{setError(readableError(e,"Could not load projects."));setLoading(false);setRefreshing(false)})},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color={palette.navy}/></View></SafeAreaView>;
  const contract=projects.reduce((a,p)=>a+Number(p.contract_value||0),0),received=projects.reduce((a,p)=>a+Number(p.finance?.received||0),0),spent=projects.reduce((a,p)=>a+Number(p.finance?.spent||0),0);
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load().catch(e=>{setError(readableError(e));setRefreshing(false)})}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="PROJECTS" title="Job-cost control" subtitle="Each project shows contract information separately from money received, money spent and cash position."/>
    <Pressable onPress={()=>router.push("/new-project")} style={s.newProject}><Text style={s.newProjectText}>＋ New project</Text></Pressable>
    {!!error&&<Card style={s.error}><Text style={s.errorTitle}>Could not load projects</Text><Text style={s.errorCopy}>{error}</Text></Card>}
    {!!projects.length&&<View style={s.summary}><Mini label="Contract" value={money(contract)}/><Mini label="Received" value={money(received)}/><Mini label="Spent" value={money(spent)}/></View>}
    <SectionHead title={`${projects.length} active project${projects.length===1?"":"s"}`}/>
    {!projects.length&&!error&&<Card><Text style={s.emptyTitle}>No projects yet.</Text><Text style={s.emptyCopy}>Create the first project, then record its funding and project spending.</Text></Card>}
    {projects.map(p=>{const f=p.finance||{},projectReceived=Number(f.received||0),projectSpent=Number(f.spent||0),position=Number(f.funding_position||0);return <Pressable key={p.id} onPress={()=>router.push({pathname:"/project/[id]",params:{id:p.id}})}><Card style={s.card}><View style={b.row}><View style={{flex:1}}><Text style={s.code}>{p.project_code||"PROJECT"}</Text><Text style={s.name}>{p.name}</Text><Text style={s.meta}>{p.location||"Location not set"}{p.client_name?` · ${p.client_name}`:""}</Text></View><Text style={s.arrow}>›</Text></View><View style={s.metrics}><Mini label="Contract" value={p.contract_value?money(p.contract_value):"Not set"}/><Mini label="Received" value={money(projectReceived)}/><Mini label="Spent" value={money(projectSpent)}/><Mini label="Cash position" value={money(position)} red={position<0}/></View></Card></Pressable>})}
  </ScrollView></SafeAreaView>}
function Mini({label,value,red=false}:{label:string;value:string;red?:boolean}){return <View style={s.mini}><Text style={s.miniLabel}>{label}</Text><Text style={[s.miniValue,red&&{color:palette.red}]}>{value}</Text></View>}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},newProject:{minHeight:54,borderRadius:14,backgroundColor:palette.navy,alignItems:"center",justifyContent:"center"},newProjectText:{fontSize:16,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},summary:{flexDirection:"row",gap:8},card:{gap:14},code:{fontSize:12,fontWeight:"900",color:"#1771ab",fontFamily:"sans-serif"},name:{fontSize:19,fontWeight:"900",color:palette.ink,marginTop:2,fontFamily:"sans-serif"},meta:{fontSize:13,lineHeight:19,color:palette.muted,marginTop:4,fontFamily:"sans-serif"},arrow:{fontSize:30,color:"#7890a0"},metrics:{flexDirection:"row",flexWrap:"wrap",gap:10},mini:{minWidth:"29%",flex:1},miniLabel:{fontSize:12,color:palette.muted,fontFamily:"sans-serif"},miniValue:{fontSize:15,fontWeight:"900",color:palette.navy,marginTop:3,fontFamily:"sans-serif"},emptyTitle:{fontSize:18,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},emptyCopy:{fontSize:14,lineHeight:21,color:palette.muted,marginTop:5,fontFamily:"sans-serif"},error:{borderColor:"#e4b9b9",backgroundColor:"#fff8f8"},errorTitle:{fontSize:15,fontWeight:"900",color:"#7f2929",fontFamily:"sans-serif"},errorCopy:{fontSize:13,lineHeight:19,color:"#815858",marginTop:4,fontFamily:"sans-serif"}});