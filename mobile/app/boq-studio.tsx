import { useEffect, useState } from "react";
import { useRouter } from "expo-router";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { loadEstimateReviewSession } from "../lib/estimate-review-session";
import { calculateMobileMaterials } from "../lib/material-recipe-engine";
import type { MobileEstimateReviewSession } from "../lib/estimate-types";

const number=(value:number)=>new Intl.NumberFormat("en-NG",{maximumFractionDigits:3}).format(value);
const money=(value:number)=>`₦${new Intl.NumberFormat("en-NG",{maximumFractionDigits:0}).format(value)}`;
const parseRate=(raw:string|undefined,fallback:number|null|undefined)=>{
  if(raw==null||!raw.trim())return fallback??null;
  const value=Number(raw.replace(/[,₦$€£\s]/g,""));
  return Number.isFinite(value)&&value>=0?value:(fallback??null);
};

export default function BoqStudio(){
  const router=useRouter();
  const [session,setSession]=useState<MobileEstimateReviewSession|null>(null);
  const [loading,setLoading]=useState(true);
  const [open,setOpen]=useState<Record<string,boolean>>({});
  const [selected,setSelected]=useState<string|null>(null);

  useEffect(()=>{
    loadEstimateReviewSession().then(current=>{
      setSession(current);
      if(current)setOpen(Object.fromEntries(current.boq.sections.map(section=>[section.id,true])));
      setLoading(false);
    }).catch(()=>setLoading(false));
  },[]);

  if(loading)return <SafeAreaView style={styles.safe}><View style={styles.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;

  if(!session)return <SafeAreaView style={styles.safe} edges={["top"]}><ScrollView contentContainerStyle={styles.page}>
    <View style={styles.topRow}><Pressable onPress={()=>router.back()}><Text style={styles.back}>← Estimate</Text></Pressable><Text style={styles.brand}>CHARISMAK APP</Text></View>
    <View style={styles.hero}><Text style={styles.eyebrow}>BOQ → MATERIAL TRACEABILITY</Text><Text style={styles.title}>No reviewed BOQ yet</Text><Text style={styles.subtitle}>BOQ Studio only shows your successfully imported and reviewed bill. Demo quantities are not used in the live app.</Text></View>
    <View style={styles.empty}><Text style={styles.emptyTitle}>Upload a BOQ first</Text><Text style={styles.emptyCopy}>Choose an Excel, XLS or CSV BOQ, review the detected sections and items, then return here to trace quantities into materials.</Text><Pressable style={styles.emptyButton} onPress={()=>router.push("/upload-boq")}><Text style={styles.emptyButtonText}>Upload BOQ</Text></Pressable></View>
  </ScrollView></SafeAreaView>;

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.topRow}><Pressable onPress={()=>router.back()}><Text style={styles.back}>← Estimate</Text></Pressable><Text style={styles.brand}>CHARISMAK APP</Text></View>
      <View style={styles.hero}><Text style={styles.eyebrow}>BOQ → MATERIAL TRACEABILITY</Text><Text style={styles.title}>Sectioned bill</Text><Text style={styles.fileName}>{session.boq.name}</Text><Text style={styles.subtitle}>Tap any blue quantity to see the reviewed materials behind that exact imported BOQ item.</Text></View>

      {session.boq.sections.map(section=><View key={section.id} style={styles.section}>
        <Pressable style={styles.sectionHead} onPress={()=>setOpen(current=>({...current,[section.id]:!current[section.id]}))}>
          <View><Text style={styles.code}>{section.code||"SECTION"}</Text><Text style={styles.sectionTitle}>{section.title}</Text></View>
          <Text style={styles.itemCount}>{section.items.length} item{section.items.length===1?"":"s"}</Text>
        </Pressable>
        {open[section.id]&&section.items.map(item=>{
          const decision=session.decisions[item.id];
          const breakdown=calculateMobileMaterials(item,decision?{recipeFamily:decision.recipeFamily,supplyResponsibility:decision.supplyResponsibility,confirmed:decision.confirmed}:{recipeFamily:"needs_review",supplyResponsibility:"unknown",confirmed:false});
          const rate=parseRate(session.rates[item.id],item.rate);
          const amount=rate==null?(item.amount??null):item.quantity*rate;
          return <View key={item.id} style={styles.itemWrap}>
            <View style={styles.itemTop}><Text style={styles.itemNo}>{item.itemNo||"—"}</Text><Text style={styles.description}>{item.description}</Text></View>
            <View style={styles.metrics}>
              <View><Text style={styles.metricLabel}>UNIT</Text><Text style={styles.metricValue}>{item.unit||"—"}</Text></View>
              <View><Text style={styles.metricLabel}>QUANTITY</Text><Pressable onPress={()=>setSelected(current=>current===item.id?null:item.id)} style={[styles.qtyButton,selected===item.id&&styles.qtyButtonActive]}><Text style={[styles.qtyText,selected===item.id&&styles.qtyTextActive]}>{number(item.quantity)}</Text></Pressable></View>
              <View><Text style={styles.metricLabel}>RATE</Text><Text style={styles.metricValue}>{rate==null?"—":money(rate)}</Text></View>
              <View><Text style={styles.metricLabel}>AMOUNT</Text><Text style={styles.amount}>{amount==null?"—":money(amount)}</Text></View>
            </View>
            {selected===item.id&&<View style={styles.materialPanel}>
              <Text style={styles.materialEyebrow}>MATERIALS FOR {number(item.quantity)} {item.unit}</Text>
              {breakdown.status==="available"?breakdown.materials.map(material=><View key={`${material.material}-${material.unit}`} style={styles.materialRow}>
                <View style={styles.materialNameWrap}><Text style={styles.materialName}>{material.material}</Text><Text style={styles.materialBase}>{number(material.baseQuantity)} {material.unit}{material.wastePercent?` + ${material.wastePercent}% waste`:""}</Text></View>
                <Text style={styles.materialTotal}>{number(material.totalQuantity)} {material.unit}</Text>
              </View>):<Text style={styles.reviewText}>{breakdown.assumptions[0]||"A reviewed material recipe is required before Charismak can calculate this item."}</Text>}
            </View>}
          </View>;
        })}
      </View>)}

      <View style={styles.rule}><Text style={styles.ruleTitle}>V1 rule</Text><Text style={styles.ruleText}>Imported BOQ headings remain sections. Material totals must always be traceable back to the measured BOQ quantity that produced them.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f3f7fa"},page:{padding:14,paddingBottom:40,gap:12},center:{flex:1,alignItems:"center",justifyContent:"center"},
  topRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},back:{fontSize:12,fontWeight:"800",color:"#0b668f"},brand:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#718391"},
  hero:{backgroundColor:"#082945",borderRadius:18,padding:18,gap:5},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#9ec5df"},title:{fontSize:24,fontWeight:"900",color:"#fff"},fileName:{fontSize:10,fontWeight:"800",color:"#9ec5df"},subtitle:{fontSize:12,lineHeight:18,color:"#d7e5ef"},
  empty:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,padding:18,gap:8},emptyTitle:{fontSize:17,fontWeight:"900",color:"#173f5a"},emptyCopy:{fontSize:11,lineHeight:17,color:"#657b8b"},emptyButton:{height:46,borderRadius:13,backgroundColor:"#073f65",alignItems:"center",justifyContent:"center",marginTop:5},emptyButtonText:{color:"#fff",fontSize:12,fontWeight:"900"},
  section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{padding:13,backgroundColor:"#eaf3f8",flexDirection:"row",justifyContent:"space-between",alignItems:"center"},code:{fontSize:9,fontWeight:"900",color:"#0b668f"},sectionTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:2},itemCount:{fontSize:10,color:"#708391"},
  itemWrap:{padding:12,borderTopWidth:1,borderTopColor:"#edf2f5",gap:10},itemTop:{flexDirection:"row",gap:8},itemNo:{fontSize:10,fontWeight:"900",color:"#78909f",minWidth:28},description:{fontSize:12,lineHeight:17,color:"#294c63",fontWeight:"700",flex:1},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:12,alignItems:"flex-end"},metricLabel:{fontSize:8,fontWeight:"900",color:"#80919e",letterSpacing:.7},metricValue:{fontSize:11,fontWeight:"700",color:"#526c7e",marginTop:4},amount:{fontSize:11,fontWeight:"900",color:"#173f5a",marginTop:4},qtyButton:{marginTop:3,borderWidth:1,borderColor:"#9cc9df",backgroundColor:"#edf8fd",borderRadius:8,paddingHorizontal:9,paddingVertical:6},qtyButtonActive:{backgroundColor:"#0b668f"},qtyText:{fontSize:11,fontWeight:"900",color:"#0b668f"},qtyTextActive:{color:"#fff"},
  materialPanel:{backgroundColor:"#f6fafc",borderRadius:12,padding:11,gap:7},materialEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:.8,color:"#16825c"},reviewText:{fontSize:11,lineHeight:16,color:"#7b5c13"},materialRow:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e0e8ed",borderRadius:9,padding:9,flexDirection:"row",justifyContent:"space-between",gap:8,alignItems:"center"},materialNameWrap:{flex:1},materialName:{fontSize:11,fontWeight:"800",color:"#284b62"},materialBase:{fontSize:9,color:"#718391",marginTop:2},materialTotal:{fontSize:11,fontWeight:"900",color:"#0b668f"},
  rule:{backgroundColor:"#fff8e8",borderWidth:1,borderColor:"#f0dfb7",borderRadius:14,padding:13},ruleTitle:{fontSize:9,fontWeight:"900",textTransform:"uppercase",color:"#7b5c13"},ruleText:{fontSize:11,lineHeight:17,color:"#6e644c",marginTop:4},
});
