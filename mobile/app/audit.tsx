import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { baseStyles as b, Card, ScreenTitle } from "../components/ui";

export default function Audit(){
  const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [rows,setRows]=useState<any[]>([]);const [allowed,setAllowed]=useState(false);
  const load=useCallback(async()=>{const w=await loadWorkspace();setAllowed(Boolean(w.membership.is_owner));if(!w.membership.is_owner){setLoading(false);setRefreshing(false);return}const {data}=await supabase.from("audit_log").select("id,actor_email,acting_interface,action,entity_type,project_id,created_at,context").eq("company_id",w.membership.company_id).order("created_at",{ascending:false}).limit(200);setRows(data??[]);setLoading(false);setRefreshing(false)},[]);
  useFocusEffect(useCallback(()=>{load().catch(()=>setLoading(false))},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>} contentContainerStyle={b.content}><ScreenTitle eyebrow="ACCOUNTABILITY" title="Audit trail" subtitle="Who changed what, when, and which role interface they were acting through."/>{!allowed?<Card><Text style={b.muted}>Only the MD / Owner can review the company-wide audit trail.</Text></Card>:rows.length?rows.map(r=><Card key={r.id}><Text style={s.action}>{String(r.action||"").replaceAll("."," · ").replaceAll("_"," ")}</Text><Text style={s.actor}>{r.actor_email||"System"} · {String(r.acting_interface||"system").replaceAll("_"," ")}</Text><Text style={s.meta}>{String(r.entity_type||"record").replaceAll("_"," ")} · {new Date(r.created_at).toLocaleString("en-NG")}</Text></Card>):<Card><Text style={b.muted}>No audit activity yet.</Text></Card>}</ScrollView></SafeAreaView>
}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},action:{fontSize:12,fontWeight:"900",color:"#173a53",textTransform:"capitalize"},actor:{fontSize:9,color:"#5f7686",marginTop:4},meta:{fontSize:8,color:"#94a1aa",marginTop:5,textTransform:"capitalize"}});
