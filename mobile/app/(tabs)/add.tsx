import { router, useLocalSearchParams } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Card, ScreenTitle, baseStyles as b } from "../../components/ui";

const UNIVERSAL_INTAKE_ENABLED=process.env.EXPO_PUBLIC_UNIVERSAL_INTAKE_ENABLED==="true";

export default function Add(){
  const {projectId}=useLocalSearchParams<{projectId?:string}>();

  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <ScreenTitle eyebrow="ADD" title={projectId?"Add to this project":"Give Charismak your records"} subtitle="General document intelligence needs its reviewed backend tables before it can safely organise files into Accounting."/>

    {!UNIVERSAL_INTAKE_ENABLED&&<Card style={s.notice}>
      <Text style={s.noticeEye}>INTERNAL TEST · BACKEND GATE OFF</Text>
      <Text style={s.noticeTitle}>General file intake is not enabled yet</Text>
      <Text style={s.noticeCopy}>PDF, Word, receipt, statement and image intake will be enabled only after the document-intelligence backend is explicitly reviewed and migrated. This build will not pretend to process those files or write partial records.</Text>
    </Card>}

    <Pressable style={s.primary} onPress={()=>router.push("/upload-boq")}>
      <Text style={s.primaryTitle}>Upload a BOQ</Text>
      <Text style={s.primaryCopy}>XLSX · XLS · CSV · section detection · review · rates · materials</Text>
      <Text style={s.chevron}>›</Text>
    </Pressable>

    <Card>
      <Text style={s.cardTitle}>Why this is separated</Text>
      <Text style={s.cardCopy}>BOQ parsing already has a bounded preview path. Universal records require source-document, intake and review tables that are not present in the current live Accounting schema. Those migrations remain intentionally unapplied during V0.1 phone testing.</Text>
    </Card>

    <View style={s.statusRow}><Text style={s.statusLabel}>BOQ upload</Text><Text style={s.ready}>READY TO TEST</Text></View>
    <View style={s.statusRow}><Text style={s.statusLabel}>PDF / receipt / statement organiser</Text><Text style={s.gated}>GATED</Text></View>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({notice:{backgroundColor:"#fff8e8",borderColor:"#ecd9a7"},noticeEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#866416"},noticeTitle:{fontSize:16,fontWeight:"900",color:"#4e411f",marginTop:4},noticeCopy:{fontSize:11,lineHeight:17,color:"#6e644b",marginTop:6},primary:{position:"relative",backgroundColor:"#073f65",borderRadius:18,padding:17,paddingRight:42},primaryTitle:{fontSize:17,fontWeight:"900",color:"#fff"},primaryCopy:{fontSize:10,lineHeight:15,color:"#c8dce9",marginTop:5},chevron:{position:"absolute",right:17,top:23,fontSize:28,color:"#d8e7f0"},cardTitle:{fontSize:14,fontWeight:"900",color:"#173b55"},cardCopy:{fontSize:10,lineHeight:16,color:"#708391",marginTop:5},statusRow:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",paddingVertical:11,borderBottomWidth:1,borderBottomColor:"#dfe7ec"},statusLabel:{fontSize:11,fontWeight:"700",color:"#405e72",flex:1},ready:{fontSize:8,fontWeight:"900",color:"#087450"},gated:{fontSize:8,fontWeight:"900",color:"#866416"}});
