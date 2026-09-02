import { useState } from "react";
import { useRouter } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Material={name:string;unit:string;base:number;waste:number;total:number};
type Item={id:string;no:string;description:string;unit:string;quantity:number;rate:number;amount:number;materials?:Material[];needsReview?:boolean};
type Section={id:string;code:string;title:string;items:Item[]};

const sections:Section[]=[
  {id:"04",code:"04",title:"Blockwork & Masonry",items:[
    {id:"bw-001",no:"4.1",description:"225mm hollow sandcrete block wall in cement and sand mortar",unit:"m²",quantity:1820,rate:18500,amount:33670000,materials:[
      {name:"225mm hollow blocks",unit:"pcs",base:18200,waste:5,total:19110},
      {name:"Cement",unit:"bags",base:546,waste:5,total:573.3},
      {name:"Sharp sand",unit:"m³",base:27.3,waste:10,total:30.03},
    ]},
    {id:"bw-002",no:"4.2",description:"150mm hollow sandcrete block wall in cement and sand mortar",unit:"m²",quantity:640,rate:16200,amount:10368000,needsReview:true},
  ]},
  {id:"03",code:"03",title:"Concrete & Reinforcement",items:[
    {id:"conc-001",no:"3.1",description:"Reinforced concrete in foundations",unit:"m³",quantity:85,rate:145000,amount:12325000,materials:[
      {name:"Cement",unit:"bags",base:595,waste:5,total:624.75},
      {name:"Sharp sand",unit:"m³",base:42.5,waste:10,total:46.75},
      {name:"Granite",unit:"m³",base:85,waste:5,total:89.25},
    ]},
  ]},
];

const number=(value:number)=>new Intl.NumberFormat("en-NG",{maximumFractionDigits:3}).format(value);
const money=(value:number)=>`₦${new Intl.NumberFormat("en-NG",{maximumFractionDigits:0}).format(value)}`;

export default function BoqStudio(){
  const router=useRouter();
  const [open,setOpen]=useState<Record<string,boolean>>({"04":true,"03":true});
  const [selected,setSelected]=useState<string|null>("bw-001");

  return <SafeAreaView style={styles.safe} edges={["top"]}>
    <ScrollView contentContainerStyle={styles.page}>
      <View style={styles.topRow}><Pressable onPress={()=>router.back()}><Text style={styles.back}>← Estimate</Text></Pressable><Text style={styles.brand}>CHARISMAK APP</Text></View>
      <View style={styles.hero}><Text style={styles.eyebrow}>BOQ → MATERIAL TRACEABILITY</Text><Text style={styles.title}>Sectioned bill</Text><Text style={styles.subtitle}>Tap any blue quantity to see the materials behind that exact BOQ item.</Text></View>

      {sections.map((section)=><View key={section.id} style={styles.section}>
        <Pressable style={styles.sectionHead} onPress={()=>setOpen((current)=>({...current,[section.id]:!current[section.id]}))}>
          <View><Text style={styles.code}>{section.code}</Text><Text style={styles.sectionTitle}>{section.title}</Text></View>
          <Text style={styles.itemCount}>{section.items.length} items</Text>
        </Pressable>
        {open[section.id]&&section.items.map((item)=><View key={item.id} style={styles.itemWrap}>
          <View style={styles.itemTop}><Text style={styles.itemNo}>{item.no}</Text><Text style={styles.description}>{item.description}</Text></View>
          <View style={styles.metrics}>
            <View><Text style={styles.metricLabel}>UNIT</Text><Text style={styles.metricValue}>{item.unit}</Text></View>
            <View><Text style={styles.metricLabel}>QUANTITY</Text><Pressable onPress={()=>setSelected((current)=>current===item.id?null:item.id)} style={[styles.qtyButton,selected===item.id&&styles.qtyButtonActive]}><Text style={[styles.qtyText,selected===item.id&&styles.qtyTextActive]}>{number(item.quantity)}</Text></Pressable></View>
            <View><Text style={styles.metricLabel}>RATE</Text><Text style={styles.metricValue}>{money(item.rate)}</Text></View>
            <View><Text style={styles.metricLabel}>AMOUNT</Text><Text style={styles.amount}>{money(item.amount)}</Text></View>
          </View>
          {selected===item.id&&<View style={styles.materialPanel}>
            <Text style={styles.materialEyebrow}>MATERIALS FOR {number(item.quantity)} {item.unit}</Text>
            {item.needsReview?<Text style={styles.reviewText}>A reviewed material recipe is required before Charismak can calculate this item.</Text>:item.materials?.map((material)=><View key={material.name} style={styles.materialRow}>
              <View style={styles.materialNameWrap}><Text style={styles.materialName}>{material.name}</Text><Text style={styles.materialBase}>{number(material.base)} {material.unit} + {material.waste}% waste</Text></View>
              <Text style={styles.materialTotal}>{number(material.total)} {material.unit}</Text>
            </View>)}
          </View>}
        </View>)}
      </View>)}

      <View style={styles.rule}><Text style={styles.ruleTitle}>V1 rule</Text><Text style={styles.ruleText}>Imported BOQ headings remain sections. Material totals must always be traceable back to the measured BOQ quantity that produced them.</Text></View>
    </ScrollView>
  </SafeAreaView>;
}

const styles=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f3f7fa"},page:{padding:14,paddingBottom:40,gap:12},
  topRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},back:{fontSize:12,fontWeight:"800",color:"#0b668f"},brand:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#718391"},
  hero:{backgroundColor:"#082945",borderRadius:18,padding:18,gap:5},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#9ec5df"},title:{fontSize:24,fontWeight:"900",color:"#fff"},subtitle:{fontSize:12,lineHeight:18,color:"#d7e5ef"},
  section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{padding:13,backgroundColor:"#eaf3f8",flexDirection:"row",justifyContent:"space-between",alignItems:"center"},code:{fontSize:9,fontWeight:"900",color:"#0b668f"},sectionTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:2},itemCount:{fontSize:10,color:"#708391"},
  itemWrap:{padding:12,borderTopWidth:1,borderTopColor:"#edf2f5",gap:10},itemTop:{flexDirection:"row",gap:8},itemNo:{fontSize:10,fontWeight:"900",color:"#78909f",minWidth:28},description:{fontSize:12,lineHeight:17,color:"#294c63",fontWeight:"700",flex:1},
  metrics:{flexDirection:"row",flexWrap:"wrap",gap:12,alignItems:"flex-end"},metricLabel:{fontSize:8,fontWeight:"900",color:"#80919e",letterSpacing:.7},metricValue:{fontSize:11,fontWeight:"700",color:"#526c7e",marginTop:4},amount:{fontSize:11,fontWeight:"900",color:"#173f5a",marginTop:4},qtyButton:{marginTop:3,borderWidth:1,borderColor:"#9cc9df",backgroundColor:"#edf8fd",borderRadius:8,paddingHorizontal:9,paddingVertical:6},qtyButtonActive:{backgroundColor:"#0b668f"},qtyText:{fontSize:11,fontWeight:"900",color:"#0b668f"},qtyTextActive:{color:"#fff"},
  materialPanel:{backgroundColor:"#f6fafc",borderRadius:12,padding:11,gap:7},materialEyebrow:{fontSize:9,fontWeight:"900",letterSpacing:.8,color:"#16825c"},reviewText:{fontSize:11,lineHeight:16,color:"#7b5c13"},materialRow:{backgroundColor:"#fff",borderWidth:1,borderColor:"#e0e8ed",borderRadius:9,padding:9,flexDirection:"row",justifyContent:"space-between",gap:8,alignItems:"center"},materialNameWrap:{flex:1},materialName:{fontSize:11,fontWeight:"800",color:"#284b62"},materialBase:{fontSize:9,color:"#718391",marginTop:2},materialTotal:{fontSize:11,fontWeight:"900",color:"#0b668f"},
  rule:{backgroundColor:"#fff8e8",borderWidth:1,borderColor:"#f0dfb7",borderRadius:14,padding:13},ruleTitle:{fontSize:9,fontWeight:"900",textTransform:"uppercase",color:"#7b5c13"},ruleText:{fontSize:11,lineHeight:17,color:"#6e644c",marginTop:4},
});
