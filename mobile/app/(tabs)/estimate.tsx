import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type EntryMode = "quick" | "build" | "boq" | "drawing" | "measured" | "studio";

const modes: Array<{id:EntryMode; title:string; note:string; badge:string}> = [
  {id:"quick",title:"Quick Estimate",note:"Fast preliminary cost for a homeowner or early decision.",badge:"Simple"},
  {id:"build",title:"Build Estimate",note:"Answer guided questions and enter dimensions for a fuller estimate.",badge:"Guided"},
  {id:"boq",title:"Upload BOQ",note:"Bring an existing priced or unpriced BOQ for review, pricing and materials.",badge:"Import"},
  {id:"drawing",title:"Upload Drawing",note:"AI-assisted interpretation first, with user review before quantities are accepted.",badge:"AI review"},
  {id:"measured",title:"Enter Quantities",note:"For QSs and contractors who already have measured quantities.",badge:"Professional"},
  {id:"studio",title:"BOQ Studio",note:"Create, edit, price and convert BOQs into project cost baselines.",badge:"Workspace"},
];

export default function EstimateTab(){
  const [selected,setSelected]=useState<EntryMode>("boq");
  const active=modes.find((item)=>item.id===selected)!;

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>CHARISMAK APP · ESTIMATE</Text>
        <Text style={styles.title}>What are you trying to estimate?</Text>
        <Text style={styles.subtitle}>Start with what you already have. Every route will feed the same project-cost engine.</Text>
      </View>

      <View style={styles.grid}>
        {modes.map((item)=><Pressable key={item.id} onPress={()=>setSelected(item.id)} style={[styles.card,selected===item.id&&styles.cardActive]}>
          <View style={styles.cardTop}><Text style={styles.cardTitle}>{item.title}</Text><Text style={styles.badge}>{item.badge}</Text></View>
          <Text style={styles.cardText}>{item.note}</Text>
        </Pressable>)}
      </View>

      <View style={styles.next}>
        <Text style={styles.nextEyebrow}>SELECTED ENTRY ROUTE</Text>
        <Text style={styles.nextTitle}>{active.title}</Text>
        <Text style={styles.nextText}>{active.note}</Text>
        <View style={styles.flow}>
          <Text style={styles.flowText}>Input</Text><Text style={styles.arrow}>→</Text>
          <Text style={styles.flowText}>Review</Text><Text style={styles.arrow}>→</Text>
          <Text style={styles.flowText}>Quantities</Text><Text style={styles.arrow}>→</Text>
          <Text style={styles.flowText}>BOQ</Text><Text style={styles.arrow}>→</Text>
          <Text style={styles.flowText}>Create Project</Text>
        </View>
        <Text style={styles.safety}>AI interprets. Deterministic rules calculate. The user confirms before an estimate becomes a project budget.</Text>
      </View>
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f4f7fa"},
  page:{padding:16,paddingBottom:100,gap:16},
  header:{backgroundColor:"#082945",borderRadius:20,padding:20,gap:7},
  eyebrow:{fontSize:10,fontWeight:"900",letterSpacing:1.4,color:"#9ec5df"},
  title:{fontSize:25,fontWeight:"900",color:"#fff"},
  subtitle:{fontSize:13,lineHeight:19,color:"#d7e5ef"},
  grid:{gap:10},
  card:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dbe5ec",borderRadius:16,padding:15,gap:7},
  cardActive:{borderColor:"#0b5f8f",borderWidth:2,backgroundColor:"#f7fbfe"},
  cardTop:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},
  cardTitle:{fontSize:16,fontWeight:"800",color:"#14354d",flex:1},
  cardText:{fontSize:12,lineHeight:18,color:"#617687"},
  badge:{fontSize:9,fontWeight:"800",color:"#0b5f8f",backgroundColor:"#e8f3f9",paddingHorizontal:8,paddingVertical:4,borderRadius:999},
  next:{backgroundColor:"#fff",borderRadius:18,padding:17,borderWidth:1,borderColor:"#dbe5ec",gap:8},
  nextEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#16825c"},
  nextTitle:{fontSize:19,fontWeight:"900",color:"#14354d"},
  nextText:{fontSize:12,lineHeight:18,color:"#617687"},
  flow:{flexDirection:"row",flexWrap:"wrap",alignItems:"center",gap:5,marginTop:5},
  flowText:{fontSize:10,fontWeight:"800",color:"#173f5a",backgroundColor:"#eef4f7",paddingHorizontal:8,paddingVertical:6,borderRadius:8},
  arrow:{color:"#81909d"},
  safety:{marginTop:6,fontSize:10,lineHeight:15,color:"#6a7f8f"},
});
