import { useEffect } from "react";
import { ActivityIndicator, View } from "react-native";
import { routeAfterAuthentication } from "../lib/auth-flow";

export default function Index(){
  useEffect(()=>{void routeAfterAuthentication();},[]);
  return <View style={{flex:1,alignItems:"center",justifyContent:"center",backgroundColor:"#f4f7fb"}}><ActivityIndicator size="large" color="#073f65"/></View>;
}
