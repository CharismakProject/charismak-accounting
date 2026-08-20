import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { baseStyles as b, Card, ScreenTitle, SectionHead } from "../components/ui";

const nice=(v:any)=>String(v??"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function Review(){
  const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [intake,setIntake]=useState<any[]>([]);const [statements,setStatements]=useState<any[]>([]);const [docs,setDocs]=useState<any[]>([]);
  const load=useCallback(async()=>{const w=await loadWorkspace();const [{data:i},{data:s},{data:d}]=await Promise.all([
    supabase.from("intake_items").select("id,document_id,detected_type,detected_project_id,confidence,status,message,suggested_action,created_at,document:source_documents(file_name),project:projects(name,project_code)").eq("company_id",w.membership.company_id).in("status",["needs_review","failed"]).order("created_at",{ascending:false}).limit(100),
    supabase.from("statement_imports").select("id,detected_institution_name,detected_account_name,rows_pending_review,status,created_at").eq("company_id",w.membership.company_id).gt("rows_pending_review",0).order("created_at",{ascending:false}).limit(50),
    supabase.from("project_document_intelligence").select("id,document_id,project_id,detected_subtype,confidence,grand_total,title,created_at,project:projects(name,project_code),document:source_documents(file_name)").eq("company_id",w.membership.company_id).eq("review_status","pending").order("created_at",{ascending:false}).limit(100),
  ]);const docIds=new Set((d??[]).map((r:any)=>r.document_id));setIntake((i??[]).filter((r:any)=>!docIds.has(r.document_id)));setStatements(s??[]);setDocs(d??[]);setLoading(false);setRefreshing(false)},[]);
  useFocusEffect(useCallback(()=>{load().catch(()=>setLoading(false))},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  const total=intake.length+statements.length+docs.length;
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>} contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="NEEDS YOUR DECISION" title={total?`${total} item${total===1?"":"s"} need your help`:"You're clear"} subtitle="Confident records are handled automatically. Only genuine exceptions stay here."/>
    {!total&&<Card><Text style={b.muted}>New records that need clarification will appear here automatically.</Text></Card>}
    {!!statements.length&&<><SectionHead title="Money activity"/>{statements.map(row=><Pressable key={row.id} onPress={()=>router.push("/(tabs)/add")}><Card><Text style={s.title}>{row.detected_institution_name||"Bank statement"}</Text><Text style={s.note}>{row.detected_account_name||"Account"} · {row.rows_pending_review||0} movement(s) need a decision</Text><Text style={s.open}>Review →</Text></Card></Pressable>)}</>}
    {!!docs.length&&<><SectionHead title="Project documents"/>{docs.map(row=>{const p=Array.isArray(row.project)?row.project[0]:row.project;const f=Array.isArray(row.document)?row.document[0]:row.document;return <Pressable key={row.id} onPress={()=>router.push("/(tabs)/projects")}><Card><Text style={s.title}>{row.title||f?.file_name||nice(row.detected_subtype)}</Text><Text style={s.note}>{p?`${p.project_code} · ${p.name} · `:""}{nice(row.detected_subtype)} · {Math.round(Number(row.confidence||0))}% confidence</Text><Text style={s.open}>Open project →</Text></Card></Pressable>})}</>}
    {!!intake.length&&<><SectionHead title="Unmatched records"/>{intake.map(row=>{const f=Array.isArray(row.document)?row.document[0]:row.document;const p=Array.isArray(row.project)?row.project[0]:row.project;return <Pressable key={row.id} onPress={()=>router.push("/(tabs)/add")}><Card><Text style={s.title}>{f?.file_name||nice(row.detected_type)||"Uploaded record"}</Text><Text style={s.note}>{p?`${p.project_code} · ${p.name} · `:""}{row.message||"One confirmation needed"}</Text><Text style={s.open}>Decide →</Text></Card></Pressable>})}</>}
  </ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},title:{fontSize:12,fontWeight:"900",color:"#173a53"},note:{fontSize:9,lineHeight:14,color:"#728693",marginTop:4},open:{fontSize:9,fontWeight:"900",color:"#0b6d9a",marginTop:8}});
