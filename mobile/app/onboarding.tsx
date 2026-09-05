import { useEffect, useState } from "react";
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { createWorkspace, hasActiveWorkspace } from "../lib/workspace";

export default function Onboarding(){
  const [companyName,setCompanyName]=useState("");
  const [busy,setBusy]=useState(false);
  const [checking,setChecking]=useState(true);

  async function checkAccess(){
    setChecking(true);
    try{if(await hasActiveWorkspace()){router.replace("/(tabs)");return;}}catch{}
    setChecking(false);
  }

  useEffect(()=>{void checkAccess();},[]);

  async function create(){
    setBusy(true);
    try{await createWorkspace(companyName);router.replace("/(tabs)");}
    catch(e:any){Alert.alert("Could not create workspace",e?.message||"Please try again.");}
    finally{setBusy(false);}
  }

  async function signOut(){await supabase.auth.signOut();router.replace("/login");}

  return <SafeAreaView style={s.safe}><View style={s.wrap}>
    <View><Text style={s.eyebrow}>FIRST SETUP</Text><Text style={s.title}>Your construction workspace</Text><Text style={s.copy}>Charismak keeps each company’s estimates, projects and money inside its own workspace.</Text></View>
    <View style={s.card}>
      <Text style={s.cardTitle}>{checking?"Checking your access…":"Create your company workspace"}</Text>
      {!checking&&<><Text style={s.label}>Company or business name</Text><TextInput style={s.input} value={companyName} onChangeText={setCompanyName} placeholder="e.g. Charismak Project Nigeria Limited"/><Pressable disabled={busy||companyName.trim().length<2} style={[s.button,(busy||companyName.trim().length<2)&&s.disabled]} onPress={create}><Text style={s.buttonText}>{busy?"Creating workspace…":"Create workspace"}</Text></Pressable><Text style={s.note}>You will become the MD/owner of this workspace. If someone already invited you, use “Check invitation again” instead.</Text><Pressable style={s.secondary} onPress={()=>void checkAccess()}><Text style={s.secondaryText}>Check invitation again</Text></Pressable></>}
    </View>
    <Pressable onPress={signOut}><Text style={s.signOut}>Sign out and use another account</Text></Pressable>
  </View></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f2f6fa"},wrap:{flex:1,justifyContent:"center",padding:22,gap:18},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.5,color:"#16856b"},title:{fontSize:30,fontWeight:"900",color:"#0c2e47",marginTop:5},copy:{fontSize:13,lineHeight:19,color:"#768695",marginTop:4},card:{backgroundColor:"white",borderRadius:22,padding:18,gap:10,shadowColor:"#17384f",shadowOpacity:.08,shadowRadius:20,elevation:3},cardTitle:{fontSize:18,fontWeight:"900",color:"#0c2e47"},label:{fontSize:11,fontWeight:"800",color:"#486174",marginTop:3},input:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,paddingHorizontal:13,fontSize:14,backgroundColor:"#fff"},button:{height:50,borderRadius:14,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center",marginTop:4},buttonText:{color:"white",fontWeight:"900"},disabled:{opacity:.45},note:{fontSize:9,lineHeight:14,color:"#84929d"},secondary:{height:44,borderRadius:13,borderWidth:1,borderColor:"#bfd0da",alignItems:"center",justifyContent:"center"},secondaryText:{fontSize:11,fontWeight:"900",color:"#0b6b93"},signOut:{fontSize:10,fontWeight:"800",color:"#8c4f4f",textAlign:"center"}});
