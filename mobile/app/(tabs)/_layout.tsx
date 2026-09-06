import { Tabs } from "expo-router";
import { Text } from "react-native";
const icon=(symbol:string)=><Text style={{fontSize:22}}>{symbol}</Text>;
export default function TabsLayout(){return <Tabs screenOptions={{headerShown:false,tabBarActiveTintColor:"#073f65",tabBarInactiveTintColor:"#718492",tabBarStyle:{height:74,paddingTop:7,paddingBottom:9,borderTopColor:"#dce6ec",backgroundColor:"#fff"},tabBarLabelStyle:{fontSize:12,fontWeight:"800",fontFamily:"sans-serif"}}}>
  <Tabs.Screen name="index" options={{title:"Home",tabBarIcon:()=>icon("⌂")}}/>
  <Tabs.Screen name="money" options={{title:"Money",tabBarIcon:()=>icon("₦")}}/>
  <Tabs.Screen name="projects" options={{title:"Projects",tabBarIcon:()=>icon("▦")}}/>
  <Tabs.Screen name="reports" options={{title:"Reports",tabBarIcon:()=>icon("▥")}}/>
  <Tabs.Screen name="more" options={{title:"More",tabBarIcon:()=>icon("•••")}}/>
  <Tabs.Screen name="estimate" options={{href:null}}/>
  <Tabs.Screen name="add" options={{href:null}}/>
  <Tabs.Screen name="approvals" options={{href:null}}/>
</Tabs>}
