import { useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";

type BoqItem={id:string;itemNo?:string;description:string;unit:string;quantity:number;rate?:number|null;amount?:number|null;materialBreakdown:{status:string;materials:any[];assumptions?:string[]}};
type BoqSection={id:string;code?:string;title:string;items:BoqItem[]};
type Result={boq?:{id:string;name:string;currency:string;sections:BoqSection[]};itemCount?:number;recognizedSheets?:string[];skippedSheets?:string[];warnings?:Array<{sheet:string;row?:number;message:string}>;error?:string};
const MAX=12*1024*1024;
const safe=(n:string)=>n.replace(/[^a-zA-Z0-9._-]/g,"_");
const money=(n:number|null|undefined)=>n==null?"—":`₦${Math.round(n).toLocaleString("en-NG")}`;
const qty=(n:number)=>n.toLocaleString("en-NG",{maximumFractionDigits:3});

export default function UploadBoq(){
  const router=useRouter();
  const [file,setFile]=useState<DocumentPicker.DocumentPickerAsset|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [open,setOpen]=useState<Record<string,boolean>>({});
  const [selected,setSelected]=useState<string|null>(null);

  async function choose(){
    const r=await DocumentPicker.getDocumentAsync({multiple:false,copyToCacheDirectory:true,type:["text/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]});
    if(!r.canceled){setFile(r.assets[0]);setResult(null);setMessage("");}
  }

  async function parse(){
    if(!file||busy)return;
    if((file.size||0)>MAX){Alert.alert("BOQ too large","This preview accepts files up to 12 MB.");return;}
    setBusy(true);setResult(null);setMessage("Reading workbook…");
    let path="";
    try{
      const workspace=await loadWorkspace();
      const response=await fetch(file.uri);const ab=await response.arrayBuffer();
      if(ab.byteLength>MAX)throw new Error("This BOQ is over the 12 MB preview limit.");
      path=`${workspace.membership.company_id}/boq-preview/mobile/${Date.now()}-${safe(file.name)}`;
      setMessage("Uploading a temporary copy for BOQ analysis…");
      const {error:uploadError}=await supabase.storage.from("universal-intake").upload(path,ab,{contentType:file.mimeType||undefined,upsert:false});
      if(uploadError)throw uploadError;
      setMessage("Detecting sheets, headings, sections and quantities…");
      const {data,error}=await supabase.functions.invoke("parse-boq-workbook",{body:{bucket:"universal-intake",storagePath:path,fileName:file.name}});
      if(error)throw error;
      const parsed=data as Result;
      if(parsed.error&&!parsed.boq)throw new Error(parsed.error);
      setResult(parsed);
      setOpen(Object.fromEntries((parsed.boq?.sections??[]).map(s=>[s.id,true])));
      setMessage(`${parsed.itemCount??0} BOQ item${parsed.itemCount===1?"":"s"} detected. Review before saving.`);
    }catch(e){Alert.alert("Could not read BOQ",e instanceof Error?e.message:"Please try another workbook.");setMessage("");}
    finally{if(path)await supabase.storage.from("universal-intake").remove([path]).catch(()=>undefined);setBusy(false);}
  }

  const selectedItem=result?.boq?.sections.flatMap(s=>s.items).find(i=>i.id===selected)??null;

  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.page}>
    <View style={s.top}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Estimate</Text></Pressable><Text style={s.eyebrow}>CHARISMAK APP · UPLOAD BOQ</Text><Text style={s.title}>Upload the BOQ you already use</Text><Text style={s.sub}>Excel headings can vary. Charismak maps them, preserves sections and shows the result before it affects a project budget.</Text></View>
    <Pressable style={s.drop} onPress={choose}><Text style={s.plus}>＋</Text><Text style={s.dropTitle}>{file?file.name:"Choose Excel BOQ"}</Text><Text style={s.dropCopy}>XLSX · XLS · CSV · up to 12 MB</Text></Pressable>
    <Text style={s.examples}>Examples: S/N · Description · Qty · Unit · Rate · Amount; or Item No · Particulars · UOM · Quantity · Unit Price · Total Amount.</Text>
    <Pressable disabled={!file||busy} onPress={parse} style={[s.button,(!file||busy)&&{opacity:.45}]}><Text style={s.buttonText}>{busy?"Reading BOQ…":"Read BOQ"}</Text></Pressable>
    {!!message&&<View style={s.message}><Text style={s.messageText}>{message}</Text></View>}

    {result?.boq&&<>
      <View style={s.summary}><Text style={s.summaryEye}>IMPORT REVIEW</Text><Text style={s.summaryTitle}>{result.boq.name}</Text><Text style={s.summaryText}>{result.boq.sections.length} sections · {result.itemCount??0} items · {result.recognizedSheets?.length??0} recognized sheet(s)</Text><Text style={s.summaryNote}>Imported materials remain “needs review” until the Materials phase confirms a work recipe for each quantity.</Text></View>
      {result.boq.sections.map(section=><View key={section.id} style={s.section}>
        <Pressable style={s.sectionHead} onPress={()=>setOpen(v=>({...v,[section.id]:!v[section.id]}))}><View style={{flex:1}}><Text style={s.sectionCode}>{section.code??"SECTION"}</Text><Text style={s.sectionTitle}>{section.title}</Text></View><Text style={s.sectionCount}>{section.items.length} items {open[section.id]?"⌃":"⌄"}</Text></Pressable>
        {open[section.id]&&section.items.map(item=><View key={item.id} style={s.item}>
          <View style={s.itemTop}><Text style={s.itemNo}>{item.itemNo??"—"}</Text><Text style={s.itemDesc}>{item.description}</Text></View>
          <View style={s.itemMeta}><Text style={s.meta}>{item.unit}</Text><Pressable onPress={()=>setSelected(v=>v===item.id?null:item.id)} style={[s.qtyButton,selected===item.id&&s.qtyActive]}><Text style={[s.qtyText,selected===item.id&&{color:"#fff"}]}>{qty(item.quantity)}</Text></Pressable><Text style={s.meta}>{money(item.rate)}</Text><Text style={s.amount}>{money(item.amount)}</Text></View>
          {selected===item.id&&<View style={s.material}><Text style={s.materialEye}>MATERIALS FOR {qty(item.quantity)} {item.unit}</Text><Text style={s.materialText}>{item.materialBreakdown.status==="needs_review"?"A reviewed work recipe is needed before Charismak calculates materials for this imported quantity.":"Material breakdown available."}</Text></View>}
        </View>)}
      </View>)}
      {(result.warnings?.length??0)>0&&<View style={s.warning}><Text style={s.warningTitle}>{result.warnings!.length} import note{result.warnings!.length===1?"":"s"}</Text>{result.warnings!.slice(0,20).map((w,i)=><Text key={`${w.sheet}-${w.row}-${i}`} style={s.warningText}><Text style={{fontWeight:"900"}}>{w.sheet}{w.row?` row ${w.row}`:""}: </Text>{w.message}</Text>)}{result.warnings!.length>20&&<Text style={s.warningText}>+ {result.warnings!.length-20} more notes</Text>}</View>}
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f4f7fa"},page:{padding:16,paddingBottom:70,gap:12},top:{backgroundColor:"#082945",borderRadius:20,padding:19,gap:7},back:{fontSize:11,fontWeight:"800",color:"#b9d4e5"},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.2,color:"#9ec5df"},title:{fontSize:23,fontWeight:"900",color:"#fff"},sub:{fontSize:12,lineHeight:18,color:"#d7e5ef"},drop:{minHeight:145,borderWidth:1.5,borderStyle:"dashed",borderColor:"#9db8ca",borderRadius:18,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",padding:18},plus:{fontSize:34,color:"#0b668f"},dropTitle:{fontSize:16,fontWeight:"900",color:"#173f5a",marginTop:3,textAlign:"center"},dropCopy:{fontSize:10,color:"#788b99",marginTop:4},examples:{fontSize:10,lineHeight:15,color:"#687d8c",paddingHorizontal:3},button:{backgroundColor:"#0b668f",borderRadius:13,padding:13,alignItems:"center"},buttonText:{color:"#fff",fontWeight:"900",fontSize:12},message:{backgroundColor:"#edf8f3",borderRadius:12,padding:11},messageText:{fontSize:11,color:"#176247",fontWeight:"700"},summary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,padding:15,gap:4},summaryEye:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#16825c"},summaryTitle:{fontSize:17,fontWeight:"900",color:"#173f5a"},summaryText:{fontSize:10,color:"#667b8b"},summaryNote:{fontSize:10,lineHeight:15,color:"#738592",marginTop:4},section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{backgroundColor:"#edf4f8",padding:13,flexDirection:"row",alignItems:"center",gap:8},sectionCode:{fontSize:8,fontWeight:"900",color:"#0b668f"},sectionTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:2},sectionCount:{fontSize:9,color:"#6f8290"},item:{padding:12,borderTopWidth:1,borderTopColor:"#edf1f4",gap:8},itemTop:{flexDirection:"row",gap:8,alignItems:"flex-start"},itemNo:{fontSize:10,fontWeight:"900",color:"#68808f",minWidth:26},itemDesc:{fontSize:11,lineHeight:16,fontWeight:"700",color:"#28495f",flex:1},itemMeta:{flexDirection:"row",alignItems:"center",gap:7,justifyContent:"flex-end",flexWrap:"wrap"},meta:{fontSize:9,color:"#70828f"},amount:{fontSize:10,fontWeight:"900",color:"#173f5a"},qtyButton:{borderWidth:1,borderColor:"#9bc7df",backgroundColor:"#eef8fd",paddingHorizontal:9,paddingVertical:5,borderRadius:8},qtyActive:{backgroundColor:"#0b668f"},qtyText:{fontSize:10,fontWeight:"900",color:"#0b668f"},material:{backgroundColor:"#f7fbfd",borderRadius:10,padding:10,gap:4},materialEye:{fontSize:8,fontWeight:"900",color:"#16825c"},materialText:{fontSize:10,lineHeight:15,color:"#6a7d8b"},warning:{backgroundColor:"#fff9e8",borderRadius:15,padding:14,gap:7},warningTitle:{fontSize:12,fontWeight:"900",color:"#775c18"},warningText:{fontSize:9,lineHeight:14,color:"#75684e"}});
