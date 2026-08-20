import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { baseStyles as b, Card, ScreenTitle } from "../components/ui";

export default function Notifications(){
  const [loading,setLoading]=useState(true);const [refreshing,setRefreshing]=useState(false);const [rows,setRows]=useState<any[]>([]);
  const load=useCallback(async()=>{const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Not signed in");const {data}=await supabase.from("notifications").select("id,title,body,href,priority,read_at,created_at,notification_type").eq("user_id",user.id).order("created_at",{ascending:false}).limit(100);setRows(data??[]);setLoading(false);setRefreshing(false)},[]);
  useFocusEffect(useCallback(()=>{load().catch(()=>setLoading(false))},[load]));
  async function open(row:any){if(!row.read_at){await supabase.from("notifications").update({read_at:new Date().toISOString()}).eq("id",row.id);setRows(x=>x.map(r=>r.id===row.id?{...r,read_at:new Date().toISOString()}:r))}if(String(row.href||"").includes("approvals"))router.push("/(tabs)/approvals");}
  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  const unread=rows.filter(r=>!r.read_at).length;
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView refreshControl={<RefreshControl refreshing={refreshing} onRefresh={()=>{setRefreshing(true);load()}}/>} contentContainerStyle={b.content}><ScreenTitle eyebrow="ACTION CENTRE" title="Notifications" subtitle={`${unread} unread. Approvals and project actions come here automatically.`}/>{rows.length?rows.map(row=><Pressable key={row.id} onPress={()=>open(row)}><Card style={[s.card,!row.read_at&&s.unread]}><View style={s.top}><Text style={s.title}>{row.title}</Text><Text style={[s.priority,row.priority==="urgent"&&s.urgent]}>{row.priority||"normal"}</Text></View><Text style={s.body}>{row.body}</Text><Text style={s.time}>{new Date(row.created_at).toLocaleString("en-NG")}</Text></Card></Pressable>):<Card><Text style={b.muted}>No notifications yet.</Text></Card>}</ScrollView></SafeAreaView>
}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},card:{gap:7},unread:{borderColor:"#8fc2df",backgroundColor:"#f8fcff"},top:{flexDirection:"row",justifyContent:"space-between",gap:10,alignItems:"center"},title:{flex:1,fontSize:12,fontWeight:"900",color:"#173a53"},priority:{fontSize:8,fontWeight:"900",textTransform:"uppercase",color:"#778b99"},urgent:{color:"#b44632"},body:{fontSize:10,lineHeight:15,color:"#627886"},time:{fontSize:8,color:"#93a0aa"}});
