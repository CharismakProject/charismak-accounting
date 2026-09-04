import { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { AUTH_CALLBACK_URL, friendlyAuthError, validEmail } from "../lib/auth-flow";

export default function ForgotPassword(){
  const [email,setEmail]=useState("");
  const [busy,setBusy]=useState(false);
  const [sent,setSent]=useState(false);

  async function sendReset(){
    if(!validEmail(email))return Alert.alert("Check your email","Enter a valid email address.");
    setBusy(true);
    const {error}=await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(),{redirectTo:AUTH_CALLBACK_URL});
    setBusy(false);
    if(error)return Alert.alert("Could not send reset email",friendlyAuthError(error.message));
    setSent(true);
  }

  return <SafeAreaView style={s.safe}><KeyboardAvoidingView behavior={Platform.OS==="ios"?"padding":undefined} style={s.wrap}>
    <Pressable onPress={()=>router.back()}><Text style={s.back}>← Sign in</Text></Pressable>
    <View><Text style={s.eyebrow}>ACCOUNT RECOVERY</Text><Text style={s.title}>Forgot your password?</Text><Text style={s.copy}>Enter the email used for your Charismak account.</Text></View>
    <View style={s.card}>
      {sent?<><Text style={s.sentTitle}>Check your email</Text><Text style={s.sentCopy}>If an account exists for <Text style={s.strong}>{email.trim().toLowerCase()}</Text>, a password reset link has been sent. Open that link on this phone.</Text><Pressable style={s.button} onPress={()=>router.replace("/login")}><Text style={s.buttonText}>Back to sign in</Text></Pressable></>:<><Text style={s.label}>Email</Text><TextInput style={s.input} value={email} onChangeText={setEmail} autoCapitalize="none" autoCorrect={false} keyboardType="email-address" textContentType="emailAddress"/><Pressable disabled={busy||!email} style={[s.button,(busy||!email)&&s.disabled]} onPress={sendReset}><Text style={s.buttonText}>{busy?"Sending…":"Send reset link"}</Text></Pressable><Text style={s.note}>For privacy, Charismak will not reveal whether an email is registered.</Text></>}
    </View>
  </KeyboardAvoidingView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f2f6fa"},wrap:{flex:1,justifyContent:"center",padding:22,gap:18},back:{fontSize:11,fontWeight:"900",color:"#0b6b93"},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.5,color:"#16856b"},title:{fontSize:30,fontWeight:"900",color:"#0c2e47",marginTop:5},copy:{fontSize:13,color:"#768695",marginTop:4},card:{backgroundColor:"white",borderRadius:22,padding:18,gap:10,shadowColor:"#17384f",shadowOpacity:.08,shadowRadius:20,elevation:3},label:{fontSize:11,fontWeight:"800",color:"#486174"},input:{height:48,borderWidth:1,borderColor:"#d5e0e8",borderRadius:13,paddingHorizontal:13,fontSize:15,backgroundColor:"#fff"},button:{height:50,borderRadius:14,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center",marginTop:6},buttonText:{color:"white",fontWeight:"900"},disabled:{opacity:.45},note:{fontSize:9,lineHeight:14,color:"#84929d",textAlign:"center"},sentTitle:{fontSize:20,fontWeight:"900",color:"#0c2e47"},sentCopy:{fontSize:12,lineHeight:18,color:"#647989"},strong:{fontWeight:"900",color:"#0c2e47"}});
