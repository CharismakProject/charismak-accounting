import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { friendlyAuthError, routeAfterAuthentication, validEmail } from "../lib/auth-flow";

export default function Login(){
  const [email,setEmail]=useState("");
  const [password,setPassword]=useState("");
  const [showPassword,setShowPassword]=useState(false);
  const [busy,setBusy]=useState(false);

  async function signIn(){
    if(!validEmail(email))return Alert.alert("Check your email","Enter a valid email address.");
    if(!password)return Alert.alert("Password required","Enter your password to continue.");
    setBusy(true);
    const {error}=await supabase.auth.signInWithPassword({email:email.trim().toLowerCase(),password});
    setBusy(false);
    if(error)return Alert.alert("Sign in failed",friendlyAuthError(error.message));
    await routeAfterAuthentication();
  }

  return <SafeAreaView style={s.safe}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={s.wrap}>
    <View style={s.logo}><View style={s.mark}><Text style={s.markText}>C</Text></View><View style={s.brandWrap}><Text style={s.brand}>Charismak App</Text><Text style={s.tag}>Estimate. Run projects. Know where the money went.</Text></View></View>
    <View style={s.card}>
      <Text style={s.title}>Welcome back</Text><Text style={s.copy}>Sign in to your construction workspace.</Text>
      <Text style={s.label}>Email</Text><TextInput style={s.input} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress" value={email} onChangeText={setEmail}/>
      <View style={s.labelRow}><Text style={s.label}>Password</Text><Pressable onPress={()=>router.push("/forgot-password")}><Text style={s.link}>Forgot password?</Text></Pressable></View>
      <View style={s.passwordRow}><TextInput style={s.passwordInput} autoCapitalize="none" textContentType="password" secureTextEntry={!showPassword} value={password} onChangeText={setPassword}/><Pressable style={s.show} onPress={()=>setShowPassword(v=>!v)}><Text style={s.showText}>{showPassword?"HIDE":"SHOW"}</Text></Pressable></View>
      <Pressable disabled={busy||!email||!password} style={[s.button,(busy||!email||!password)&&s.disabled]} onPress={signIn}><Text style={s.buttonText}>{busy?"Signing in…":"Sign in"}</Text></Pressable>
      <View style={s.createRow}><Text style={s.createCopy}>New to Charismak?</Text><Pressable onPress={()=>router.push("/sign-up")}><Text style={s.createLink}>Create account</Text></Pressable></View>
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f2f6fa"},wrap:{flex:1,justifyContent:"center",padding:22,gap:18},logo:{flexDirection:"row",alignItems:"center",gap:10},brandWrap:{flex:1},mark:{width:46,height:46,borderRadius:16,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center"},markText:{color:"white",fontWeight:"900",fontSize:20},brand:{fontSize:20,fontWeight:"800",color:"#0d2f49"},tag:{fontSize:11,color:"#708192",marginTop:2},card:{backgroundColor:"white",borderRadius:22,padding:18,gap:8,shadowColor:"#17384f",shadowOpacity:.08,shadowRadius:20,elevation:3},title:{fontSize:26,fontWeight:"800",color:"#0c2e47"},copy:{fontSize:13,color:"#768695",marginBottom:8},label:{fontSize:11,fontWeight:"700",color:"#486174",marginTop:4},labelRow:{flexDirection:"row",alignItems:"flex-end",justifyContent:"space-between",marginTop:4},link:{fontSize:10,fontWeight:"800",color:"#0b6b93"},input:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,paddingHorizontal:13,fontSize:15,backgroundColor:"#fff"},passwordRow:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,backgroundColor:"#fff",flexDirection:"row",alignItems:"center"},passwordInput:{flex:1,height:46,paddingHorizontal:13,fontSize:15},show:{paddingHorizontal:13,height:46,justifyContent:"center"},showText:{fontSize:9,fontWeight:"900",color:"#0b6b93",letterSpacing:.5},button:{height:50,borderRadius:14,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center",marginTop:10},buttonText:{color:"white",fontWeight:"900"},disabled:{opacity:.45},createRow:{flexDirection:"row",justifyContent:"center",gap:5,marginTop:8},createCopy:{fontSize:11,color:"#768695"},createLink:{fontSize:11,fontWeight:"900",color:"#0b6b93"}});
