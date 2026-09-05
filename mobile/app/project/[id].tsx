import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { Card, money, ProgressBar, ScreenTitle, SectionHead, Stat, baseStyles as b } from "../../components/ui";

export default function Project(){
  const {id}=useLocalSearchParams<{id:string}>();
  const [loading,setLoading]=useState(true);const [project,setProject]=useState<any>(null);const [finance,setFinance]=useState<any>(null);const [tx,setTx]=useState<any[]>([]);const [error,setError]=useState("");
  const load=useCallback(async()=>{if(!id)return;setError("");const [{data:p,error:pe},{data:f,error:fe},{data:t,error:te}]=await Promise.all([
    supabase.from("projects").select("id,project_code,name,location,status,reported_progress,description,contract_value,client_name").eq("id",id).maybeSingle(),
    supabase.from("project_financial_positions").select("project_id,received,spent,funding_position").eq("project_id",id).maybeSingle(),
    supabase.from("transactions").select("id,transaction_date,title,description,amount,kind,category:categories(name)").eq("project_id",id).eq("status","posted").order("transaction_date",{ascending:false}).limit(20),
  ]);const firstError=pe||fe||te;if(firstError)throw firstError;setProject(p);setFinance(f);setTx(t??[]);setLoading(false);},[id]);
  useFocusEffect(useCallback(()=>{load().catch((e:any)=>{setError(e?.message||"Could not load project");setLoading(false);});},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  if(!project)return <SafeAreaView style={b.screen}><View style={s.center}><Text style={b.muted}>Project not available.</Text></View></SafeAreaView>;

  const spent=Number(finance?.spent||0),received=Number(finance?.received||0),position=Number(finance?.funding_position||0),contract=Number(project.contract_value||0),progress=Math.max(0,Math.min(100,Number(project.reported_progress||0)));
  const spendPct=contract?Math.min(100,spent/contract*100):null;

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <View style={s.backRow}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Projects</Text></Pressable><Text style={s.code}>{project.project_code||"PROJECT"}</Text></View>
    <ScreenTitle eyebrow="PROJECT" title={project.name} subtitle={`${project.location} · ${String(project.status).replaceAll("_"," ")}`}/>
    {!!project.client_name&&<Text style={s.client}>Client · {project.client_name}</Text>}
    {!!error&&<Card style={s.errorCard}><Text style={s.errorTitle}>Some project data could not load</Text><Text style={s.errorCopy}>{error}</Text></Card>}

    <View style={b.grid}><View style={b.half}><Stat label="Contract value" value={contract?money(contract):"Not set"}/></View><View style={b.half}><Stat label="Reported progress" value={`${Math.round(progress)}%`}/></View><View style={b.half}><Stat label="Received" value={money(received)}/></View><View style={b.half}><Stat label="Spent" value={money(spent)}/></View><View style={b.half}><Stat label="Funding position" value={money(position)} tone={position<0?"red":"navy"}/></View></View>

    <Card><View style={s.progressHead}><Text style={s.cardTitle}>Reported project progress</Text><Text style={s.percent}>{Math.round(progress)}%</Text></View><ProgressBar value={progress}/></Card>
    {spendPct!=null&&<Card><View style={s.progressHead}><Text style={s.cardTitle}>Spend against contract value</Text><Text style={s.percent}>{Math.round(spendPct)}%</Text></View><ProgressBar value={spendPct}/></Card>}

    <View style={s.actions}><Pressable style={s.primaryAction} onPress={()=>router.push({pathname:"/upload-boq",params:{projectId:id,projectName:project.name}})}><Text style={s.primaryTitle}>Upload BOQ</Text><Text style={s.primaryCopy}>Preserve the project bill and review only real exceptions.</Text></Pressable><Pressable style={s.secondaryAction} onPress={()=>router.push({pathname:"/(tabs)/add",params:{projectId:id}})}><Text style={s.secondaryTitle}>Add records</Text><Text style={s.secondaryCopy}>Add other project records without turning them into BOQ assumptions.</Text></Pressable></View>

    <SectionHead title="Recent money activity"/>{tx.length?tx.map(t=>{const incoming=t.kind==="income";const signed=incoming?Number(t.amount||0):-Number(t.amount||0);const category=Array.isArray(t.category)?t.category[0]?.name:t.category?.name;return <View key={t.id} style={s.list}><View style={{flex:1}}><Text numberOfLines={2} style={s.rowTitle}>{t.title||t.description||"Transaction"}</Text><Text style={s.rowNote}>{t.transaction_date} · {String(t.kind||"movement").replaceAll("_"," ")}{category?` · ${category}`:""}</Text></View><Text style={[s.rowAmount,{color:signed<0?"#b3423a":"#087450"}]}>{money(signed)}</Text></View>}):<Card><Text style={s.empty}>No posted money activity yet.</Text></Card>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},backRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},back:{fontSize:13,fontWeight:"800",color:"#0b5c8b",fontFamily:"sans-serif"},code:{fontSize:11,fontWeight:"900",color:"#6e8495",letterSpacing:1,fontFamily:"sans-serif"},client:{fontSize:13,color:"#607786",fontWeight:"700",fontFamily:"sans-serif"},progressHead:{flexDirection:"row",justifyContent:"space-between",alignItems:"center",marginBottom:8},cardTitle:{fontSize:13,fontWeight:"800",color:"#173b55",fontFamily:"sans-serif"},percent:{fontSize:14,fontWeight:"900",color:"#0a5b89",fontFamily:"sans-serif"},actions:{flexDirection:"row",gap:9},primaryAction:{flex:1,backgroundColor:"#073f65",borderRadius:15,padding:14},primaryTitle:{fontSize:15,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},primaryCopy:{fontSize:11,lineHeight:17,color:"#c8dce9",marginTop:4,fontFamily:"sans-serif"},secondaryAction:{flex:1,backgroundColor:"#fff",borderWidth:1,borderColor:"#d7e3ea",borderRadius:15,padding:14},secondaryTitle:{fontSize:15,fontWeight:"900",color:"#173b55",fontFamily:"sans-serif"},secondaryCopy:{fontSize:11,lineHeight:17,color:"#718492",marginTop:4,fontFamily:"sans-serif"},rowTitle:{fontSize:13,fontWeight:"800",color:"#29475c",fontFamily:"sans-serif"},rowNote:{fontSize:11,color:"#84929c",marginTop:3,fontFamily:"sans-serif"},rowAmount:{fontSize:13,fontWeight:"900",fontFamily:"sans-serif"},list:{flexDirection:"row",gap:10,alignItems:"center",paddingVertical:12,borderBottomWidth:1,borderBottomColor:"#e2e8ec"},empty:{fontSize:12,color:"#748795",fontFamily:"sans-serif"},errorCard:{borderColor:"#e4b9b9",backgroundColor:"#fff8f8"},errorTitle:{fontSize:14,fontWeight:"900",color:"#7f2929",fontFamily:"sans-serif"},errorCopy:{fontSize:12,lineHeight:18,color:"#815858",marginTop:4,fontFamily:"sans-serif"}});