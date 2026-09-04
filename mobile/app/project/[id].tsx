import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { Card, money, ProgressBar, ScreenTitle, SectionHead, Stat, baseStyles as b } from "../../components/ui";

const COST_CONTROL_ENABLED=process.env.EXPO_PUBLIC_PROJECT_COST_BRIDGE_ENABLED==="true";
const PROGRESS_ENABLED=process.env.EXPO_PUBLIC_PROJECT_PROGRESS_VALUATION_ENABLED==="true";
const FIELD_PROGRESS_ENABLED=process.env.EXPO_PUBLIC_PROJECT_PROGRESS_FIELD_REVIEW_ENABLED==="true";

export default function Project(){
  const {id}=useLocalSearchParams<{id:string}>();
  const [loading,setLoading]=useState(true);
  const [project,setProject]=useState<any>(null);
  const [finance,setFinance]=useState<any>(null);
  const [tx,setTx]=useState<any[]>([]);
  const [error,setError]=useState("");

  const load=useCallback(async()=>{
    if(!id)return;
    setError("");
    const [{data:p,error:pe},{data:f,error:fe},{data:t,error:te}]=await Promise.all([
      supabase.from("projects").select("id,project_code,name,location,status,reported_progress,description,project_type,contract_value").eq("id",id).maybeSingle(),
      supabase.from("project_financial_positions").select("project_id,received,spent,funding_position").eq("project_id",id).maybeSingle(),
      supabase.from("transactions").select("id,transaction_date,title,description,amount,kind,category:categories(name)").eq("project_id",id).eq("status","posted").order("transaction_date",{ascending:false}).limit(20),
    ]);
    const firstError=pe||fe||te;if(firstError)throw firstError;
    setProject(p);setFinance(f);setTx(t??[]);setLoading(false);
  },[id]);

  useFocusEffect(useCallback(()=>{load().catch((e:any)=>{setError(e?.message||"Could not load project");setLoading(false);});},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s0.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  if(!project)return <SafeAreaView style={b.screen}><View style={s0.center}><Text>Project not available.</Text></View></SafeAreaView>;

  const spent=Number(finance?.spent||0);
  const funding=Number(finance?.received||0);
  const position=Number(finance?.funding_position||0);
  const contract=Number(project.contract_value||0);
  const basis=contract||funding;
  const spendPct=basis?Math.min(100,spent/basis*100):0;

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <View style={s0.backRow}><Pressable onPress={()=>router.back()}><Text style={s0.back}>← Projects</Text></Pressable><Text style={s0.code}>{project.project_code||"PROJECT"}</Text></View>
    <ScreenTitle eyebrow="PROJECT" title={project.name} subtitle={`${project.location||"Location not set"} · ${String(project.status).replaceAll("_"," ")} · ${Math.round(Number(project.reported_progress||0))}% reported progress`}/>

    {!!error&&<Card style={s0.errorCard}><Text style={s0.errorTitle}>Some project data could not load</Text><Text style={s0.errorCopy}>{error}</Text></Card>}

    <View style={s0.commercial}><Text style={s0.commercialLabel}>RECORDED CONTRACT VALUE</Text><Text style={s0.commercialValue}>{contract?money(contract):"Not entered"}</Text><Text style={s0.commercialNote}>V0.1 uses the current live Accounting project record. Additional-scope, variation and forecast ledgers stay behind their feature gates.</Text></View>

    <View style={b.grid}>
      <View style={b.half}><Stat label="Received" value={money(funding)}/></View>
      <View style={b.half}><Stat label="Spent" value={money(spent)}/></View>
      <View style={b.half}><Stat label="Funding position" value={money(position)} tone={position<0?"red":"navy"}/></View>
      <View style={b.half}><Stat label="Reported progress" value={`${Math.round(Number(project.reported_progress||0))}%`}/></View>
    </View>

    <Card><View style={b.row}><Text style={s0.cardTitle}>Spend against {contract?"contract value":"received funding"}</Text><Text style={s0.percent}>{Math.round(spendPct)}%</Text></View><ProgressBar value={spendPct}/><Text style={s0.note}>This is a simple live-schema control indicator, not profit or cost-to-complete.</Text></Card>

    <View style={s0.actions}><Pressable style={b.button} onPress={()=>router.push({pathname:"/(tabs)/add",params:{projectId:id}})}><Text style={b.buttonText}>＋ Add records</Text></Pressable></View>

    {FIELD_PROGRESS_ENABLED&&<View style={s0.actions}>
      <Pressable style={s0.featureButton} onPress={()=>router.push({pathname:"/project-field-progress/[id]",params:{id}})}><Text style={s0.featureButtonText}>Field Report</Text></Pressable>
      <Pressable style={s0.featureButton} onPress={()=>router.push({pathname:"/project-field-review/[id]",params:{id}})}><Text style={s0.featureButtonText}>MD Field Review</Text></Pressable>
    </View>}

    <SectionHead title="Advanced project controls"/>
    <Card style={s0.gatedCard}>
      <Text style={s0.gatedTitle}>Project-cost extensions are gated in this APK</Text>
      <Text style={s0.gatedCopy}>Commitments, cost control, MD field review and progress valuation will appear only after their reviewed migrations are explicitly approved. They are not allowed to query missing production tables.</Text>
      <View style={s0.gateRow}><Text>Cost control</Text><Text style={COST_CONTROL_ENABLED?s0.ready:s0.gated}>{COST_CONTROL_ENABLED?"ENABLED":"GATED"}</Text></View>
      <View style={s0.gateRow}><Text>Progress valuation</Text><Text style={PROGRESS_ENABLED?s0.ready:s0.gated}>{PROGRESS_ENABLED?"ENABLED":"GATED"}</Text></View>
      <View style={s0.gateRow}><Text>Field reporting & MD review</Text><Text style={FIELD_PROGRESS_ENABLED?s0.ready:s0.gated}>{FIELD_PROGRESS_ENABLED?"ENABLED":"GATED"}</Text></View>
    </Card>

    <SectionHead title="Recent money activity"/>
    {tx.length?tx.map(t=>{const incoming=t.kind==="income";const signed=incoming?Number(t.amount||0):-Number(t.amount||0);const category=Array.isArray(t.category)?t.category[0]?.name:t.category?.name;return <View key={t.id} style={s0.list}><View style={{flex:1}}><Text numberOfLines={2} style={s0.rowTitle}>{t.title||t.description||"Transaction"}</Text><Text style={s0.rowNote}>{t.transaction_date} · {String(t.kind||"movement").replaceAll("_"," ")}{category?` · ${category}`:""}</Text></View><Text style={[s0.rowAmount,{color:signed<0?"#b3423a":"#087450"}]}>{money(signed)}</Text></View>}):<Card><Text style={b.muted}>No posted money activity yet.</Text></Card>}
  </ScrollView></SafeAreaView>;
}

const s0=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},backRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},back:{fontSize:11,fontWeight:"800",color:"#0b5c8b"},code:{fontSize:9,fontWeight:"900",color:"#6e8495",letterSpacing:1},commercial:{backgroundColor:"#073f65",borderRadius:21,padding:16},commercialLabel:{fontSize:8,letterSpacing:1.3,fontWeight:"900",color:"#9cc2d9"},commercialValue:{fontSize:29,fontWeight:"900",color:"white",marginVertical:7},commercialNote:{fontSize:9,lineHeight:14,color:"#c6dce9"},cardTitle:{fontSize:11,fontWeight:"800",color:"#173b55"},percent:{fontSize:12,fontWeight:"900",color:"#0a5b89"},note:{fontSize:8,color:"#84929d",marginTop:7,lineHeight:12},actions:{flexDirection:"row",gap:8,flexWrap:"wrap"},featureButton:{flexGrow:1,minWidth:130,height:42,borderRadius:12,backgroundColor:"#0b668f",alignItems:"center",justifyContent:"center",paddingHorizontal:12},featureButtonText:{fontSize:10,fontWeight:"900",color:"#fff"},rowTitle:{fontSize:10,fontWeight:"800",color:"#29475c"},rowNote:{fontSize:8,color:"#84929c",marginTop:3},rowAmount:{fontSize:9,fontWeight:"900",color:"#173c56"},list:{flexDirection:"row",gap:10,alignItems:"center",paddingVertical:10,borderBottomWidth:1,borderBottomColor:"#e2e8ec"},gatedCard:{backgroundColor:"#fff8e8",borderColor:"#ecd9a7"},gatedTitle:{fontSize:13,fontWeight:"900",color:"#55451d"},gatedCopy:{fontSize:10,lineHeight:15,color:"#74694f",marginTop:4},gateRow:{flexDirection:"row",justifyContent:"space-between",paddingTop:9,marginTop:6,borderTopWidth:1,borderTopColor:"#eadfbe"},gated:{fontSize:8,fontWeight:"900",color:"#866416"},ready:{fontSize:8,fontWeight:"900",color:"#087450"},errorCard:{borderColor:"#e4b9b9",backgroundColor:"#fff8f8"},errorTitle:{fontSize:13,fontWeight:"900",color:"#7f2929"},errorCopy:{fontSize:10,lineHeight:15,color:"#815858",marginTop:4}});
