import { useEffect, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { authParamsFromUrl, friendlyAuthError, routeAfterAuthentication } from "../lib/auth-flow";

export default function AuthCallback(){
  const url=Linking.useURL();
  const [message,setMessage]=useState("Finishing your account…");

  useEffect(()=>{
    if(!url)return;
    (async()=>{
      const params=authParamsFromUrl(url);
      if(params.errorDescription){setMessage(friendlyAuthError(params.errorDescription));return;}
      if(!params.accessToken||!params.refreshToken){setMessage("This link is incomplete or has expired. Request a new link and try again.");return;}
      const {error}=await supabase.auth.setSession({access_token:params.accessToken,refresh_token:params.refreshToken});
      if(error){setMessage(friendlyAuthError(error.message));return;}
      if(params.type==="recovery"){router.replace("/reset-password");return;}
      await routeAfterAuthentication();
    })();
  },[url]);

  return <SafeAreaView style={s.safe}><View style={s.wrap}><ActivityIndicator size="large" color="#073f65"/><Text style={s.title}>Charismak App</Text><Text style={s.copy}>{message}</Text></View></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f2f6fa"},wrap:{flex:1,alignItems:"center",justifyContent:"center",padding:28,gap:12},title:{fontSize:24,fontWeight:"900",color:"#0c2e47"},copy:{fontSize:12,lineHeight:18,textAlign:"center",color:"#6f8291"}});
