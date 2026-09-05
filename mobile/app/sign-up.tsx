import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { AUTH_CALLBACK_URL, friendlyAuthError, routeAfterAuthentication, validEmail, validPassword } from "../lib/auth-flow";

export default function SignUp(){
  const [name,setName]=useState("");
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [confirm,setConfirm]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);

  async function createAccount(){
    if(name.trim().length<2)return Alert.alert("Your name is required","Enter your name so the workspace can identify you.");
    if(!validEmail(email))return Alert.alert("Check your email","Enter a valid email address.");
    if(!validPassword(password))return Alert.alert("Use a stronger password","Use at least 8 characters.");
    if(password!==confirm)return Alert.alert("Passwords do not match","Enter the same password twice.");
    setBusy(true);
    const {data,error}=await supabase.auth.signUp({
      email:email.trim().toLowerCase(),
      password,
      options:{emailRedirectTo:AUTH_CALLBACK_URL,data:{full_name:name.trim()}},
    });
    setBusy(false);
    if(error)return Alert.alert("Could not create account",friendlyAuthError(error.message));
    if(data.session){await routeAfterAuthentication();return;}
    Alert.alert("Check your email","We sent a confirmation link to your email. Open it on this phone to finish creating your Charismak account.",[{text:"OK",onPress:()=>router.replace("/login")}]);
  }

  return <SafeAreaView style={s.safe}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={s.flex}><ScrollView contentContainerStyle={s.wrap} keyboardShouldPersistTaps="handled">
    <Pressable onPress={()=>router.back()}><Text style={s.back}>← Sign in</Text></Pressable>
    <View><Text style={s.eyebrow}>CHARISMAK APP</Text><Text style={s.title}>Create your account</Text><Text style={s.copy}>One account for estimates, projects and money.</Text></View>
    <View style={s.card}>
      <Text style={s.label}>Your name</Text><TextInput style={s.input} value={name} onChangeText={setName} textContentType="name"/>
      <Text style={s.label}>Email</Text><TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress"/>
      <Text style={s.label}>Password</Text><View style={s.passwordRow}><TextInput style={s.passwordInput} value={password} onChangeText={setPassword} autoCapitalize="none" secureTextEntry={!showPassword} textContentType="newPassword"/><Pressable style={s.show} onPress={()=>setShowPassword(v=>!v)}><Text style={s.showText}>{showPassword?"HIDE":"SHOW"}</Text></Pressable></View>
      <Text style={s.hint}>At least 8 characters.</Text>
      <Text style={s.label}>Confirm password</Text><TextInput style={s.input} value={confirm} onChangeText={setConfirm} autoCapitalize="none" secureTextEntry={!showPassword} textContentType="newPassword"/>
      <Pressable disabled={busy} style={[s.button,busy&&s.disabled]} onPress={createAccount}><Text style={s.buttonText}>{busy?"Creating account…":"Create account"}</Text></Pressable>
      <Text style={s.legal}>Your company workspace is created only after your email is verified. Existing invited users will be connected to their assigned workspace instead.</Text>
    </View>
  </ScrollView></KeyboardAvoidingView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f2f6fa"},flex:{flex:1},wrap:{padding:22,paddingTop:28,paddingBottom:40,gap:18},back:{fontSize:11,fontWeight:"900",color:"#0b6b93"},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.5,color:"#16856b"},title:{fontSize:30,fontWeight:"900",color:"#0c2e47",marginTop:5},copy:{fontSize:13,color:"#768695",marginTop:4},card:{backgroundColor:"white",borderRadius:22,padding:18,gap:8,shadowColor:"#17384f",shadowOpacity:.08,shadowRadius:20,elevation:3},label:{fontSize:11,fontWeight:"800",color:"#486174",marginTop:5},input:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,paddingHorizontal:13,fontSize:15,backgroundColor:"#fff"},passwordRow:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,backgroundColor:"#fff",flexDirection:"row",alignItems:"center"},passwordInput:{flex:1,height:46,paddingHorizontal:13,fontSize:15},show:{paddingHorizontal:13,height:46,justifyContent:"center"},showText:{fontSize:9,fontWeight:"900",color:"#0b6b93"},hint:{fontSize:9,color:"#84929d"},button:{height:50,borderRadius:14,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center",marginTop:10},buttonText:{color:"white",fontWeight:"900"},disabled:{opacity:.5},legal:{fontSize:9,lineHeight:14,color:"#83909a",textAlign:"center",marginTop:4}});
