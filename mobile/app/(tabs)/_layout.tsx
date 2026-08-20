import { Tabs } from "expo-router";
import { Text } from "react-native";

const icon=(symbol:string)=><Text style={{fontSize:20}}>{symbol}</Text>;
export default function TabsLayout(){
  return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:"#073f65",tabBarInactiveTintColor:"#81909d",tabBarStyle:{height:68,paddingTop:7,paddingBottom:8,borderTopColor:"#dde6ed",backgroundColor:"#fff"},tabBarLabelStyle:{fontSize:10,fontWeight:"700"}}}>
    <Tabs.Screen name="index" options={{title:"Home",tabBarIcon:()=>icon("⌂")}}/>
    <Tabs.Screen name="projects" options={{title:"Projects",tabBarIcon:()=>icon("▦")}}/>
    <Tabs.Screen name="add" options={{title:"Add",tabBarIcon:()=>icon("＋")}}/>
    <Tabs.Screen name="approvals" options={{title:"Approvals",tabBarIcon:()=>icon("✓")}}/>
    <Tabs.Screen name="more" options={{title:"More",tabBarIcon:()=>icon("•••")}}/>
  </Tabs>;
}
