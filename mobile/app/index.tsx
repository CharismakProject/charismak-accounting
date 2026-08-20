import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { router } from "expo-router";
import { supabase } from "../lib/supabase";

export default function Index(){
  useEffect(()=>{(async()=>{const {data}=await supabase.auth.getSession();router.replace(data.session?"/(tabs)":"/login");})()},[]);
  return <View style={{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#f4f7fb"}}><ActivityIndicator size="large" color="#073f65"/></View>;
}
