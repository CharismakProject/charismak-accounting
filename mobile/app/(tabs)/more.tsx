import { useCallback, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { router, useFocusEffect } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { loadWorkspace, type RoleFamily } from "../../lib/workspace";
import { Card, ScreenTitle, baseStyles as b } from "../../components/ui";

const meta:Record<RoleFamily,{label:string;note:string}>={md_owner:{label:"MD / Owner",note:"Company-wide control"},accountant_cfo:{label:"Accountant / CFO",note:"Finance operations"},project_director:{label:"Project Director",note:"Portfolio & cost control"},project_manager:{label:"Project / Construction Manager",note:"Site & project control"}};
const notEnabled=(name:string,reason:string)=>Alert.alert(`${name} · not enabled yet`,reason);

export default function More(){
  const [workspace,setWorkspace]=useState<any>(null);
  const load=useCallback(async()=>setWorkspace(await loadWorkspace()),[]);
  useFocusEffect(useCallback(()=>{load().catch(()=>undefined)},[load]));
  async function signOut(){await supabase.auth.signOut();router.replace("/login")}

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="MORE" title="Your workspace" subtitle="Only modules that are safe against the current live Accounting schema are interactive in this internal test."/>

    {workspace&&<Card><Text style={s.company}>{workspace.companyName}</Text><Text style={s.email}>{workspace.user.email}</Text><View style={s.identity}><Text style={s.identityLabel}>Signed in as</Text><Text style={s.identityRole}>{meta[workspace.activeRole as RoleFamily]?.label}</Text></View></Card>}

    <Text style={s.group}>APP MODULES</Text>
    <Tool title="Market" badge="COMING LATER" note="Materials, suppliers, artisans, professionals and local rates" onPress={()=>notEnabled("Market","Market is a future sourcing module. It will use location-aware rates and verified suppliers without mixing marketplace data into Accounting truth.")}/>
    <Tool title="Ask Charismak" badge="COMING LATER" note="Questions across authorised project, BOQ and money data" onPress={()=>notEnabled("Ask Charismak","The conversational layer will be enabled after the live Estimate → Project → Money core is stable and permission-safe.")}/>

    <Text style={s.group}>TOOLS</Text>
    <Tool title="Add records" badge="BOQ READY" note="BOQ upload is testable; general document organising remains gated" onPress={()=>router.push("/(tabs)/add")}/>
    <Tool title="Needs your decision" badge="GATED" note="Document-intelligence review requires its approved backend" onPress={()=>notEnabled("Needs your decision","The review queue depends on document-intelligence tables that are not yet present in the live Accounting schema.")}/>
    <Tool title="Notifications" badge="GATED" note="Approval and action notifications will follow the approved workflow backend" onPress={()=>notEnabled("Notifications","Notification workflows are not enabled in this internal compatibility build.")}/>

    {workspace?.membership?.is_owner&&<>
      <Tool title="Company Branding" badge="GATED" note="Logo, letterhead, company details and report colours" onPress={()=>notEnabled("Company Branding","Branding persistence will be enabled after its live schema is reviewed. This test build will not write to non-existent settings tables.")}/>
      <Tool title="People & Access" badge="GATED" note="Roles, team members and project access" onPress={()=>notEnabled("People & Access","The live V0.1 database currently uses the established company_members role model. The newer multi-position access model remains gated.")}/>
      <Tool title="Audit trail" badge="GATED" note="Who changed what and through which workflow" onPress={()=>notEnabled("Audit trail","The expanded audit interface is not enabled until its reviewed backend is available.")}/>
    </>}

    <View style={s.testNote}><Text style={s.testEye}>INTERNAL TEST</Text><Text style={s.testText}>A visible “GATED” module is intentional. It means the app is refusing to query or write backend structures that have not been approved for production yet.</Text></View>
    <Pressable style={s.signout} onPress={signOut}><Text style={s.signoutText}>Sign out</Text></Pressable>
  </ScrollView></SafeAreaView>;
}

function Tool({title,note,badge,onPress}:{title:string;note:string;badge?:string;onPress:()=>void}){return <Pressable onPress={onPress} style={s.tool}><View style={{flex:1,paddingRight:8}}><View style={s.toolTitleRow}><Text style={s.toolTitle}>{title}</Text>{badge&&<Text style={[s.badge,badge==="BOQ READY"&&s.badgeReady]}>{badge}</Text>}</View><Text style={s.toolNote}>{note}</Text></View><Text style={s.chev}>›</Text></Pressable>}

const s=StyleSheet.create({company:{fontSize:17,fontWeight:"900",color:"#14364f"},email:{fontSize:10,color:"#7e8d99",marginTop:3},identity:{marginTop:13,borderRadius:13,backgroundColor:"#edf4f8",padding:11},identityLabel:{fontSize:8,color:"#768997",textTransform:"uppercase",letterSpacing:1},identityRole:{fontSize:13,fontWeight:"900",color:"#0a456c",marginTop:3},group:{fontSize:8,fontWeight:"900",letterSpacing:1.3,color:"#738696",marginTop:9,marginBottom:-4},chev:{fontSize:22,color:"#7890a0"},tool:{minHeight:64,borderBottomWidth:1,borderBottomColor:"#e2e8ec",paddingVertical:10,paddingHorizontal:3,flexDirection:"row",alignItems:"center",justifyContent:"space-between"},toolTitleRow:{flexDirection:"row",alignItems:"center",gap:7,flexWrap:"wrap"},toolTitle:{fontSize:12,fontWeight:"800",color:"#183b54"},toolNote:{fontSize:9,color:"#7c8d99",marginTop:3},badge:{fontSize:7,fontWeight:"900",color:"#866416",backgroundColor:"#fff3ce",borderRadius:8,paddingHorizontal:6,paddingVertical:3},badgeReady:{color:"#087450",backgroundColor:"#e3f5ed"},testNote:{marginTop:8,borderRadius:14,backgroundColor:"#fff8e8",borderWidth:1,borderColor:"#ecd9a7",padding:12},testEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#866416"},testText:{fontSize:9,lineHeight:14,color:"#74694f",marginTop:4},signout:{height:46,borderRadius:13,borderWidth:1,borderColor:"#e7caca",alignItems:"center",justifyContent:"center",marginTop:14,backgroundColor:"#fff"},signoutText:{fontSize:11,fontWeight:"900",color:"#a43d3d"}});
