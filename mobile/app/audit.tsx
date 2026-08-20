import { useCallback, useState } from "react";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { Card, ScreenTitle, baseStyles as b } from "../components/ui";

export default function Audit(){
  const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [rows,setRows]=useState<any[]>([]);
  const load=useCallback(async()=>{const w=await loadWorkspace();if(!w.membership.is_owner)throw new Error("MD / Owner access required");const {data,error}=await supabase.from("audit_log").select("id,actor_email,acting_interface,action,entity_type,project_id,context,created_at").eq("company_id",w.membership.company_id).order("created_at",{ascending:false}).limit(200);if(error)throw error;setRows(data??[]);setLoading(false);setRefreshing(false)},[]);useFocusEffect(useCallback(()=>{load().catch(()=>setLoading(false))},[load]));
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>} contentContainerStyle={b.content}><ScreenTitle eyebrow="AUDIT" title="Who changed what" subtitle="Every important change keeps the actual signed-in identity and the interface they were acting through."/>{rows.map(r=><Card key={r.id} style={s.card}><Text style={s.action}>{String(r.action||"activity").replaceAll("_"," ").replaceAll("."," · ")}</Text><Text style={s.meta}>{r.actor_email||"System"} · {String(r.acting_interface||"system").replaceAll("_"," ")}</Text><Text style={s.meta}>{new Date(r.created_at).toLocaleString("en-NG")}</Text>{r.entity_type&&<Text style={s.entity}>{String(r.entity_type).replaceAll("_"," ")}</Text>}</Card>)}{!rows.length&&<Card><Text style={s.empty}>No audit activity yet.</Text></Card>}</ScrollView></SafeAreaView>;
}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},card:{gap:4},action:{fontSize:11,fontWeight:"900",color:"#173b54",textTransform:"capitalize"},meta:{fontSize:8,color:"#7b8d99"},entity:{fontSize:8,fontWeight:"800",color:"#0b6c50",textTransform:"capitalize"},empty:{fontSize:11,color:"#7b8b98"}});
