import { useCallback,useState } from "react";
import { Pressable,ScrollView,StyleSheet,Text } from "react-native";
import { router,useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadWorkspace,type RoleFamily } from "../../lib/workspace";
import { Card,ScreenTitle,baseStyles as b,palette } from "../../components/ui";

const roleLabel:Record<RoleFamily,string>={md_owner:"MD / Owner",accountant_cfo:"Accountant / CFO",project_director:"Project Director",project_manager:"Project / Construction Manager"};
export default function More(){
  const[workspace,setWorkspace]=useState<any>(null);
  const load=useCallback(async()=>setWorkspace(await loadWorkspace()),[]);
  useFocusEffect(useCallback(()=>{load().catch(()=>undefined)},[load]));
  async function signOut(){await supabase.auth.signOut();router.replace("/login")}
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="MORE" title="Accounting workspace" subtitle="This version intentionally removes Estimate, marketplace and unfinished management modules. The focus is construction accounting."/>
    {workspace&&<Card><Text style={s.company}>{workspace.companyName}</Text><Text style={s.email}>{workspace.user.email}</Text><Text style={s.role}>{roleLabel[workspace.activeRole as RoleFamily]||"Member"}</Text></Card>}
    <Tool title="Add financial account" note="Bank account, fintech wallet, cash or site imprest" onPress={()=>router.push("/new-account")}/>
    <Tool title="Record money in" note="Project funding, company funding or financing" onPress={()=>router.push({pathname:"/new-transaction",params:{kind:"income"}})}/>
    <Tool title="Record money out" note="Project cost, advance, reimbursement or company overhead" onPress={()=>router.push({pathname:"/new-transaction",params:{kind:"expense"}})}/>
    <Tool title="Projects" note="Job-level received, spent and cash position" onPress={()=>router.push("/(tabs)/projects")}/>
    <Tool title="Reports" note="Profit & loss, balance sheet, receivables and payables" onPress={()=>router.push("/(tabs)/reports")}/>
    <Card style={s.rule}><Text style={s.ruleTitle}>Accounting-first product rule</Text><Text style={s.ruleCopy}>If a feature cannot update or explain the accounting truth reliably, it stays out of this APK until it is ready.</Text></Card>
    <Pressable style={s.signout} onPress={signOut}><Text style={s.signoutText}>Sign out</Text></Pressable>
  </ScrollView></SafeAreaView>}
function Tool({title,note,onPress}:{title:string;note:string;onPress:()=>void}){return <Pressable onPress={onPress} style={s.tool}><Text style={s.chev}>›</Text><Text style={s.toolText}><Text style={s.toolTitle}>{title}</Text>{"\n"}<Text style={s.toolNote}>{note}</Text></Text></Pressable>}
const s=StyleSheet.create({company:{fontSize:19,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},email:{fontSize:13,color:palette.muted,marginTop:4,fontFamily:"sans-serif"},role:{fontSize:14,fontWeight:"900",color:palette.navy,marginTop:12,fontFamily:"sans-serif"},tool:{minHeight:72,borderBottomWidth:1,borderBottomColor:"#e2e8ec",paddingVertical:12,flexDirection:"row",alignItems:"center",gap:10},chev:{fontSize:28,color:"#7890a0"},toolText:{flex:1},toolTitle:{fontSize:16,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},toolNote:{fontSize:13,lineHeight:20,color:palette.muted,fontFamily:"sans-serif"},rule:{backgroundColor:"#eef6fa",borderColor:"#c9dde8"},ruleTitle:{fontSize:15,fontWeight:"900",color:palette.ink,fontFamily:"sans-serif"},ruleCopy:{fontSize:13,lineHeight:20,color:palette.muted,marginTop:4,fontFamily:"sans-serif"},signout:{minHeight:52,borderRadius:13,borderWidth:1,borderColor:"#e7caca",alignItems:"center",justifyContent:"center",backgroundColor:"#fff"},signoutText:{fontSize:15,fontWeight:"900",color:"#a43d3d",fontFamily:"sans-serif"}});