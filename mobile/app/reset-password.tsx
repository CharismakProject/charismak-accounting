import { useEffect, useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { friendlyAuthError, routeAfterAuthentication, validPassword } from "../lib/auth-flow";

export default function ResetPassword(){
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [show,setShow]=useState(false);
  const [busy,setBusy]=useState(false);
  const [ready,setReady]=useState(false);

  useEffect(()=>{supabase.auth.getSession().then(({data})=>{if(!data.session)router.replace("/forgot-password");else setReady(true);});},[]);

  async function save(){
    if(!validPassword(password))return Alert.alert("Use a stronger password","Use at least 8 characters.");
    if(password!==confirm)return Alert.alert("Passwords do not match","Enter the same password twice.");
    setBusy(true);
    const {error}=await supabase.auth.updateUser({password});
    setBusy(false);
    if(error)return Alert.alert("Could not update password",friendlyAuthError(error.message));
    Alert.alert("Password updated","Your new password is ready to use.",[{text:"Continue",onPress:()=>{void routeAfterAuthentication();}}]);
  }

  if(!ready)return <SafeAreaView style={s.safe}><View style={s.wrap}><Text style={s.copy}>Checking recovery session…</Text></View></SafeAreaView>;
  return <SafeAreaView style={s.safe}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={s.wrap}>
    <View><Text style={s.eyebrow}>ACCOUNT RECOVERY</Text><Text style={s.title}>Choose a new password</Text><Text style={s.copy}>Use at least 8 characters and keep it private.</Text></View>
    <View style={s.card}>
      <Text style={s.label}>New password</Text><View style={s.passwordRow}><TextInput style={s.passwordInput} value={password} onChangeText={setPassword} autoCapitalize="none" secureTextEntry={!show} textContentType="newPassword"/><Pressable style={s.show} onPress={()=>setShow(v=>!v)}><Text style={s.showText}>{show?"HIDE":"SHOW"}</Text></Pressable></View>
      <Text style={s.label}>Confirm new password</Text><TextInput style={s.input} value={confirm} onChangeText={setConfirm} autoCapitalize="none" secureTextEntry={!show} textContentType="newPassword"/>
      <Pressable disabled={busy||!password||!confirm} style={[s.button,(busy||!password||!confirm)&&s.disabled]} onPress={save}><Text style={s.buttonText}>{busy?"Updating…":"Update password"}</Text></Pressable>
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f2f6fa"},wrap:{flex:1,justifyContent:"center",padding:22,gap:18},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.5,color:"#16856b"},title:{fontSize:30,fontWeight:"900",color:"#0c2e47",marginTop:5},copy:{fontSize:13,color:"#768695",marginTop:4},card:{backgroundColor:"white",borderRadius:22,padding:18,gap:9,shadowColor:"#17384f",shadowOpacity:.08,shadowRadius:20,elevation:3},label:{fontSize:11,fontWeight:"800",color:"#486174",marginTop:4},input:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,paddingHorizontal:13,fontSize:15,backgroundColor:"#fff"},passwordRow:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,backgroundColor:"#fff",flexDirection:"row",alignItems:"center"},passwordInput:{flex:1,height:46,paddingHorizontal:13,fontSize:15},show:{paddingHorizontal:13,height:46,justifyContent:"center"},showText:{fontSize:9,fontWeight:"900",color:"#0b6b93"},button:{height:50,borderRadius:14,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center",marginTop:8},buttonText:{color:"white",fontWeight:"900"},disabled:{opacity:.45}});
