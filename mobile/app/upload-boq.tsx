import { useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";

type Supply="contractor"|"client"|"specialist"|"labour_only"|"unknown";
type ReviewSuggestion={costCode:string|null;costCodeName:string|null;recipeFamily:string;recipeLabel:string;supplyResponsibility:Supply;confidence:"high"|"medium"|"low";requiresAttention:boolean;reasons:string[]};
type BoqItem={id:string;itemNo?:string;description:string;unit:string;quantity:number;rate?:number|null;amount?:number|null;materialBreakdown:{status:string;materials:any[];assumptions?:string[]};reviewSuggestion?:ReviewSuggestion};
type BoqSection={id:string;code?:string;title:string;items:BoqItem[]};
type Result={boq?:{id:string;name:string;currency:string;sections:BoqSection[]};itemCount?:number;recognizedSheets?:string[];skippedSheets?:string[];warnings?:Array<{sheet:string;row?:number;message:string}>;reviewSummary?:{clearItems:number;attentionItems:number;totalItems:number};error?:string};
type Decision={costCode:string;recipeFamily:string;supplyResponsibility:Supply;confirmed:boolean;edited:boolean};
const MAX=12*1024*1024;
const safe=(n:string)=>n.replace(/[^a-zA-Z0-9._-]/g,"_");
const money=(n:number|null|undefined)=>n==null?"—":`₦${Math.round(n).toLocaleString("en-NG")}`;
const qty=(n:number)=>n.toLocaleString("en-NG",{maximumFractionDigits:3});
const COST_CODES:[[string,string],...[string,string][]]=[["01","Preliminaries"],["02","Substructure"],["03","Concrete & Reinforcement"],["04","Blockwork & Masonry"],["05","Structural Steel"],["06","Roofing"],["07","Doors"],["08","Windows & Glazing"],["09","Plastering & Screeding"],["10","Floor Finishes"],["11","Wall Finishes"],["12","Ceilings"],["13","Painting & Decoration"],["14","Joinery & Fixtures"],["15","Plumbing & Sanitary"],["16","Electrical"],["17","Mechanical & HVAC"],["18","External Works"],["19","Plant, Equipment & Specialist Works"],["20","Professional, Statutory & Other"]];
const RECIPES:[[string,string],...[string,string][]]=[["blockwork_225","225mm blockwork"],["blockwork_150","150mm blockwork"],["blockwork","Blockwork"],["concrete","Concrete"],["reinforcement","Reinforcement"],["formwork","Formwork"],["plastering","Plastering"],["screeding","Screeding"],["floor_tiling","Floor tiling"],["wall_tiling","Wall finish"],["painting","Painting"],["roofing","Roofing"],["ceiling","Ceiling"],["plumbing_installation","Plumbing installation"],["electrical_installation","Electrical installation"],["direct_supply","Direct supply item"],["external_works","External works"],["not_applicable","No material recipe"],["needs_review","Needs recipe review"]];
const SUPPLIES:[[Supply,string],...[Supply,string][]]=[["contractor","Contractor"],["client","Client supplied"],["specialist","Specialist / nominated"],["labour_only","Labour / installation only"],["unknown","Needs review"]];
const startDecision=(item:BoqItem):Decision=>({costCode:item.reviewSuggestion?.costCode??"",recipeFamily:item.reviewSuggestion?.recipeFamily??"needs_review",supplyResponsibility:item.reviewSuggestion?.supplyResponsibility??"unknown",confirmed:false,edited:false});
const complete=(d:Decision)=>Boolean(d.costCode)&&d.recipeFamily!=="needs_review"&&d.supplyResponsibility!=="unknown";

export default function UploadBoq(){
  const router=useRouter();
  const [file,setFile]=useState<DocumentPicker.DocumentPickerAsset|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<Result|null>(null);
  const [open,setOpen]=useState<Record<string,boolean>>({});
  const [selected,setSelected]=useState<string|null>(null);
  const [decisions,setDecisions]=useState<Record<string,Decision>>({});
  const [editing,setEditing]=useState<BoqItem|null>(null);

  async function choose(){
    const r=await DocumentPicker.getDocumentAsync({multiple:false,copyToCacheDirectory:true,type:["text/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]});
    if(!r.canceled){setFile(r.assets[0]);setResult(null);setMessage("");setDecisions({});}
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
      setMessage("Detecting sections, quantities and review suggestions…");
      const {data,error}=await supabase.functions.invoke("parse-boq-workbook",{body:{bucket:"universal-intake",storagePath:path,fileName:file.name}});
      if(error)throw error;
      const parsed=data as Result;
      if(parsed.error&&!parsed.boq)throw new Error(parsed.error);
      setResult(parsed);
      setOpen(Object.fromEntries((parsed.boq?.sections??[]).map(section=>[section.id,true])));
      setDecisions(Object.fromEntries((parsed.boq?.sections??[]).flatMap(section=>section.items.map(item=>[item.id,startDecision(item)]))));
      setMessage(`${parsed.itemCount??0} BOQ item${parsed.itemCount===1?"":"s"} detected. Confirm the meaning before rates or materials become authoritative.`);
    }catch(e){Alert.alert("Could not read BOQ",e instanceof Error?e.message:"Please try another workbook.");setMessage("");}
    finally{if(path)await supabase.storage.from("universal-intake").remove([path]).catch(()=>undefined);setBusy(false);}
  }

  function confirmSection(section:BoqSection){setDecisions(current=>{const next={...current};for(const item of section.items){const d=next[item.id];if(d&&complete(d))next[item.id]={...d,confirmed:true};}return next;});}
  function confirmAll(){setDecisions(current=>Object.fromEntries(Object.entries(current).map(([id,d])=>[id,complete(d)?{...d,confirmed:true}:d])));}
  function updateEditing(patch:Partial<Decision>){if(!editing)return;setDecisions(current=>({...current,[editing.id]:{...(current[editing.id]??startDecision(editing)),...patch,edited:true,confirmed:false}}));}
  function saveEditing(){if(!editing)return;const d=decisions[editing.id];if(d&&complete(d)){setDecisions(current=>({...current,[editing.id]:{...current[editing.id],confirmed:true}}));setEditing(null);}else Alert.alert("Still needs review","Choose a cost group, a usable recipe state and supply responsibility before confirming this item.");}

  const total=Object.keys(decisions).length;
  const confirmed=Object.values(decisions).filter(d=>d.confirmed).length;
  const unresolved=Object.values(decisions).filter(d=>!complete(d)).length;

  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.page}>
    <View style={s.top}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Estimate</Text></Pressable><Text style={s.eyebrow}>CHARISMAK APP · UPLOAD BOQ</Text><Text style={s.title}>Upload the BOQ you already use</Text><Text style={s.sub}>Excel headings can vary. Charismak maps them, preserves sections and shows the result before it affects a project budget.</Text></View>
    <Pressable style={s.drop} onPress={choose}><Text style={s.plus}>＋</Text><Text style={s.dropTitle}>{file?file.name:"Choose Excel BOQ"}</Text><Text style={s.dropCopy}>XLSX · XLS · CSV · up to 12 MB</Text></Pressable>
    <Text style={s.examples}>Examples: S/N · Description · Qty · Unit · Rate · Amount; or Item No · Particulars · UOM · Quantity · Unit Price · Total Amount.</Text>
    <Pressable disabled={!file||busy} onPress={parse} style={[s.button,(!file||busy)&&{opacity:.45}]}><Text style={s.buttonText}>{busy?"Reading BOQ…":"Read BOQ"}</Text></Pressable>
    {!!message&&<View style={s.message}><Text style={s.messageText}>{message}</Text></View>}

    {result?.boq&&<>
      <View style={s.summary}><Text style={s.summaryEye}>BOQ REVIEW INTELLIGENCE</Text><Text style={s.summaryTitle}>{result.boq.name}</Text><Text style={s.summaryText}>{result.boq.sections.length} sections · {result.itemCount??0} items · {result.reviewSummary?.clearItems??0} clear suggestions · {result.reviewSummary?.attentionItems??0} need attention</Text><Text style={s.summaryNote}>{confirmed}/{total} confirmed · {unresolved} still need a decision. Suggestions do not post to Accounting.</Text><Pressable onPress={confirmAll} style={s.smallPrimary}><Text style={s.smallPrimaryText}>Confirm all ready suggestions</Text></Pressable></View>
      {result.boq.sections.map(section=>{
        const ready=section.items.filter(item=>complete(decisions[item.id]??startDecision(item))).length;
        const done=section.items.filter(item=>decisions[item.id]?.confirmed).length;
        return <View key={section.id} style={s.section}>
          <Pressable style={s.sectionHead} onPress={()=>setOpen(v=>({...v,[section.id]:!v[section.id]}))}><View style={{flex:1}}><Text style={s.sectionCode}>{section.code??"SECTION"}</Text><Text style={s.sectionTitle}>{section.title}</Text><Text style={s.sectionMini}>{done}/{section.items.length} confirmed · {section.items.length-ready} need attention</Text></View><Text style={s.sectionCount}>{open[section.id]?"⌃":"⌄"}</Text></Pressable>
          <Pressable onPress={()=>confirmSection(section)} style={s.sectionConfirm}><Text style={s.sectionConfirmText}>Confirm {ready} ready item{ready===1?"":"s"}</Text></Pressable>
          {open[section.id]&&section.items.map(item=>{const d=decisions[item.id]??startDecision(item);const suggestion=item.reviewSuggestion;return <View key={item.id} style={[s.item,!complete(d)&&s.itemAttention]}>
            <View style={s.itemTop}><Text style={s.itemNo}>{item.itemNo??"—"}</Text><Text style={s.itemDesc}>{item.description}</Text></View>
            <View style={s.itemMeta}><Text style={s.meta}>{item.unit}</Text><Pressable onPress={()=>setSelected(v=>v===item.id?null:item.id)} style={[s.qtyButton,selected===item.id&&s.qtyActive]}><Text style={[s.qtyText,selected===item.id&&{color:"#fff"}]}>{qty(item.quantity)}</Text></Pressable><Text style={s.meta}>{money(item.rate)}</Text><Text style={s.amount}>{money(item.amount)}</Text></View>
            <View style={s.reviewLine}><Text style={s.reviewText}>{d.costCode||"?"} · {COST_CODES.find(([code])=>code===d.costCode)?.[1]??"Cost group needed"}</Text><Text style={s.reviewText}>{RECIPES.find(([value])=>value===d.recipeFamily)?.[1]??d.recipeFamily}</Text><Text style={s.reviewText}>{SUPPLIES.find(([value])=>value===d.supplyResponsibility)?.[1]??"Supply needed"}</Text></View>
            <View style={s.reviewActions}><Text style={[s.confidence,suggestion?.confidence==="high"&&s.confidenceHigh,suggestion?.confidence==="medium"&&s.confidenceMid]}>{suggestion?.confidence??"low"} confidence</Text>{d.confirmed?<Text style={s.confirmed}>Confirmed</Text>:<Pressable onPress={()=>setEditing(item)} style={s.editButton}><Text style={s.editButtonText}>{complete(d)?"Review / confirm":"Resolve"}</Text></Pressable>}</View>
            {selected===item.id&&<View style={s.material}><Text style={s.materialEye}>MATERIALS FOR {qty(item.quantity)} {item.unit}</Text><Text style={s.materialText}>{item.materialBreakdown.status==="needs_review"?"The confirmed recipe family will feed the deterministic material calculator in the Materials phase.":"Material breakdown available."}</Text></View>}
          </View>})}
        </View>;
      })}
      {(result.warnings?.length??0)>0&&<View style={s.warning}><Text style={s.warningTitle}>{result.warnings!.length} import note{result.warnings!.length===1?"":"s"}</Text>{result.warnings!.slice(0,20).map((w,i)=><Text key={`${w.sheet}-${w.row}-${i}`} style={s.warningText}><Text style={{fontWeight:"900"}}>{w.sheet}{w.row?` row ${w.row}`:""}: </Text>{w.message}</Text>)}{result.warnings!.length>20&&<Text style={s.warningText}>+ {result.warnings!.length-20} more notes</Text>}</View>}
    </>}

    <Modal visible={Boolean(editing)} animationType="slide" transparent onRequestClose={()=>setEditing(null)}>
      <View style={s.modalBack}><View style={s.modalCard}><View style={s.modalHead}><View style={{flex:1}}><Text style={s.modalEye}>REVIEW BOQ ITEM</Text><Text numberOfLines={2} style={s.modalTitle}>{editing?.description}</Text></View><Pressable onPress={()=>setEditing(null)}><Text style={s.close}>×</Text></Pressable></View>{editing&&<ScrollView contentContainerStyle={s.modalScroll}>
        <Text style={s.groupLabel}>COST GROUP</Text><View style={s.chips}>{COST_CODES.map(([code,name])=><Pressable key={code} onPress={()=>updateEditing({costCode:code})} style={[s.chip,decisions[editing.id]?.costCode===code&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.costCode===code&&s.chipTextActive]}>{code} {name}</Text></Pressable>)}</View>
        <Text style={s.groupLabel}>MATERIAL RECIPE FAMILY</Text><View style={s.chips}>{RECIPES.map(([value,label])=><Pressable key={value} onPress={()=>updateEditing({recipeFamily:value})} style={[s.chip,decisions[editing.id]?.recipeFamily===value&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.recipeFamily===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
        <Text style={s.groupLabel}>WHO SUPPLIES IT?</Text><View style={s.chips}>{SUPPLIES.map(([value,label])=><Pressable key={value} onPress={()=>updateEditing({supplyResponsibility:value})} style={[s.chip,decisions[editing.id]?.supplyResponsibility===value&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.supplyResponsibility===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
        {(editing.reviewSuggestion?.reasons?.length??0)>0&&<View style={s.reasonBox}><Text style={s.groupLabel}>WHY CHARISMAK SUGGESTED THIS</Text>{editing.reviewSuggestion!.reasons.map(reason=><Text key={reason} style={s.reason}>• {reason}</Text>)}</View>}
        <Pressable onPress={saveEditing} style={s.button}><Text style={s.buttonText}>Confirm item</Text></Pressable>
      </ScrollView>}</View></View>
    </Modal>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f4f7fa"},page:{padding:16,paddingBottom:70,gap:12},top:{backgroundColor:"#082945",borderRadius:20,padding:19,gap:7},back:{fontSize:11,fontWeight:"800",color:"#b9d4e5"},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.2,color:"#9ec5df"},title:{fontSize:23,fontWeight:"900",color:"#fff"},sub:{fontSize:12,lineHeight:18,color:"#d7e5ef"},drop:{minHeight:145,borderWidth:1.5,borderStyle:"dashed",borderColor:"#9db8ca",borderRadius:18,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",padding:18},plus:{fontSize:34,color:"#0b668f"},dropTitle:{fontSize:16,fontWeight:"900",color:"#173f5a",marginTop:3,textAlign:"center"},dropCopy:{fontSize:10,color:"#788b99",marginTop:4},examples:{fontSize:10,lineHeight:15,color:"#687d8c",paddingHorizontal:3},button:{backgroundColor:"#0b668f",borderRadius:13,padding:13,alignItems:"center"},buttonText:{color:"#fff",fontWeight:"900",fontSize:12},message:{backgroundColor:"#edf8f3",borderRadius:12,padding:11},messageText:{fontSize:11,color:"#176247",fontWeight:"700"},summary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,padding:15,gap:4},summaryEye:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#16825c"},summaryTitle:{fontSize:17,fontWeight:"900",color:"#173f5a"},summaryText:{fontSize:10,color:"#667b8b"},summaryNote:{fontSize:10,lineHeight:15,color:"#738592",marginTop:4},smallPrimary:{alignSelf:"flex-start",marginTop:7,backgroundColor:"#0b668f",borderRadius:9,paddingVertical:8,paddingHorizontal:10},smallPrimaryText:{fontSize:9,fontWeight:"900",color:"#fff"},section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{backgroundColor:"#edf4f8",padding:13,flexDirection:"row",alignItems:"center",gap:8},sectionCode:{fontSize:8,fontWeight:"900",color:"#0b668f"},sectionTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:2},sectionMini:{fontSize:8,color:"#6f8290",marginTop:3},sectionCount:{fontSize:14,color:"#6f8290"},sectionConfirm:{margin:9,alignSelf:"flex-end",borderWidth:1,borderColor:"#9fc3d7",borderRadius:9,paddingHorizontal:9,paddingVertical:7},sectionConfirmText:{fontSize:8,fontWeight:"900",color:"#0b668f"},item:{padding:12,borderTopWidth:1,borderTopColor:"#edf1f4",gap:8},itemAttention:{backgroundColor:"#fffdf7"},itemTop:{flexDirection:"row",gap:8,alignItems:"flex-start"},itemNo:{fontSize:10,fontWeight:"900",color:"#68808f",minWidth:26},itemDesc:{fontSize:11,lineHeight:16,fontWeight:"700",color:"#28495f",flex:1},itemMeta:{flexDirection:"row",alignItems:"center",gap:7,justifyContent:"flex-end",flexWrap:"wrap"},meta:{fontSize:9,color:"#70828f"},amount:{fontSize:10,fontWeight:"900",color:"#173f5a"},qtyButton:{borderWidth:1,borderColor:"#9bc7df",backgroundColor:"#eef8fd",paddingHorizontal:9,paddingVertical:5,borderRadius:8},qtyActive:{backgroundColor:"#0b668f"},qtyText:{fontSize:10,fontWeight:"900",color:"#0b668f"},reviewLine:{backgroundColor:"#f7fafc",borderRadius:9,padding:8,gap:3},reviewText:{fontSize:9,color:"#536d7f"},reviewActions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},confidence:{fontSize:8,fontWeight:"900",color:"#986b17",backgroundColor:"#fff0c9",borderRadius:999,paddingHorizontal:7,paddingVertical:4,textTransform:"uppercase"},confidenceHigh:{color:"#176247",backgroundColor:"#e4f5ed"},confidenceMid:{color:"#0b668f",backgroundColor:"#e6f2f8"},confirmed:{fontSize:8,fontWeight:"900",color:"#176247",backgroundColor:"#e4f5ed",borderRadius:999,paddingHorizontal:8,paddingVertical:5},editButton:{backgroundColor:"#0b668f",borderRadius:8,paddingHorizontal:9,paddingVertical:6},editButtonText:{fontSize:8,fontWeight:"900",color:"#fff"},material:{backgroundColor:"#f7fbfd",borderRadius:10,padding:10,gap:4},materialEye:{fontSize:8,fontWeight:"900",color:"#16825c"},materialText:{fontSize:10,lineHeight:15,color:"#6a7d8b"},warning:{backgroundColor:"#fff9e8",borderRadius:15,padding:14,gap:7},warningTitle:{fontSize:12,fontWeight:"900",color:"#775c18"},warningText:{fontSize:9,lineHeight:14,color:"#75684e"},modalBack:{flex:1,backgroundColor:"rgba(4,24,38,.48)",justifyContent:"flex-end"},modalCard:{maxHeight:"92%",backgroundColor:"#f7f9fb",borderTopLeftRadius:22,borderTopRightRadius:22,overflow:"hidden"},modalHead:{backgroundColor:"#082945",padding:16,flexDirection:"row",gap:10,alignItems:"flex-start"},modalEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#9ec5df"},modalTitle:{fontSize:15,fontWeight:"900",color:"#fff",marginTop:4},close:{fontSize:28,lineHeight:28,color:"#fff"},modalScroll:{padding:15,paddingBottom:34,gap:10},groupLabel:{fontSize:8,fontWeight:"900",letterSpacing:.8,color:"#647b8b",marginTop:3},chips:{flexDirection:"row",flexWrap:"wrap",gap:6},chip:{borderWidth:1,borderColor:"#cfdae2",backgroundColor:"#fff",borderRadius:999,paddingHorizontal:9,paddingVertical:7},chipActive:{borderColor:"#0b668f",backgroundColor:"#0b668f"},chipText:{fontSize:8,color:"#536d7f",fontWeight:"700"},chipTextActive:{color:"#fff"},reasonBox:{backgroundColor:"#edf4f8",borderRadius:11,padding:10,gap:4},reason:{fontSize:9,lineHeight:14,color:"#5d7485"}});
