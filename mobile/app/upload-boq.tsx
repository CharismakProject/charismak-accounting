import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { parseBoqLocally, type LocalBoqItem, type LocalBoqSection, type LocalBoqParseResult } from "../lib/boq-local-parser";
import { calculateMobileMaterials, summarizeMobileMaterials, type MobileMaterialDecision } from "../lib/material-recipe-engine";
import { saveEstimateReviewSession } from "../lib/estimate-review-session";
import type { MobileEstimateDecision, MobileEstimateSupply, MobileWorkingRateSource } from "../lib/estimate-types";
import { loadWorkspace } from "../lib/workspace";

const MAX=12*1024*1024;
const COST_CODES:[[string,string],...[string,string][]]=[["01","Preliminaries"],["02","Substructure"],["03","Concrete & Reinforcement"],["04","Blockwork & Masonry"],["05","Structural Steel"],["06","Roofing"],["07","Doors"],["08","Windows & Glazing"],["09","Plastering & Screeding"],["10","Floor Finishes"],["11","Wall Finishes"],["12","Ceilings"],["13","Painting & Decoration"],["14","Joinery & Fixtures"],["15","Plumbing & Sanitary"],["16","Electrical"],["17","Mechanical & HVAC"],["18","External Works"],["19","Plant, Equipment & Specialist Works"],["20","Professional, Statutory & Other"]];
const RECIPES:[[string,string],...[string,string][]]=[["blockwork_225","225mm blockwork"],["blockwork_150","150mm blockwork"],["blockwork","Blockwork"],["concrete","Concrete"],["reinforcement","Reinforcement"],["formwork","Formwork"],["plastering","Plastering"],["screeding","Screeding"],["floor_tiling","Floor tiling"],["wall_tiling","Wall finish"],["painting","Painting"],["roofing","Roofing"],["ceiling","Ceiling"],["plumbing_installation","Plumbing installation"],["electrical_installation","Electrical installation"],["direct_supply","Direct supply item"],["external_works","External works"],["not_applicable","No material recipe"],["needs_review","Needs recipe review"]];
const SUPPLIES:[[MobileEstimateSupply,string],...[MobileEstimateSupply,string][]]=[["contractor","Contractor"],["client","Client supplied"],["specialist","Specialist / nominated"],["labour_only","Labour / installation only"],["unknown","Needs review"]];

const money=(value:number|null|undefined)=>value==null?"—":`₦${Math.round(value).toLocaleString("en-NG")}`;
const qty=(value:number)=>value.toLocaleString("en-NG",{maximumFractionDigits:3});
const parseRate=(value:string)=>{const cleaned=value.replace(/[,₦$€£\s]/g,"");if(!cleaned.trim())return null;const n=Number(cleaned);return Number.isFinite(n)&&n>=0?n:null;};
const startDecision=(item:LocalBoqItem):MobileEstimateDecision=>({costCode:item.reviewSuggestion?.costCode??"",recipeFamily:item.reviewSuggestion?.recipeFamily??"needs_review",supplyResponsibility:item.reviewSuggestion?.supplyResponsibility??"unknown",confirmed:false,edited:false});
const complete=(decision:MobileEstimateDecision)=>Boolean(decision.costCode)&&decision.recipeFamily!=="needs_review"&&decision.supplyResponsibility!=="unknown";

export default function UploadBoq(){
  const router=useRouter();
  const [file,setFile]=useState<DocumentPicker.DocumentPickerAsset|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<LocalBoqParseResult|null>(null);
  const [open,setOpen]=useState<Record<string,boolean>>({});
  const [editing,setEditing]=useState<LocalBoqItem|null>(null);
  const [selected,setSelected]=useState<string|null>(null);
  const [decisions,setDecisions]=useState<Record<string,MobileEstimateDecision>>({});
  const [rates,setRates]=useState<Record<string,string>>({});
  const [rateSources,setRateSources]=useState<Record<string,MobileWorkingRateSource>>({});
  const [materialsReady,setMaterialsReady]=useState(false);
  const [continuing,setContinuing]=useState(false);

  async function choose(){
    const picked=await DocumentPicker.getDocumentAsync({multiple:false,copyToCacheDirectory:true,type:["text/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]});
    if(picked.canceled)return;
    setFile(picked.assets[0]);setResult(null);setMessage("");setOpen({});setDecisions({});setRates({});setRateSources({});setMaterialsReady(false);setSelected(null);
  }

  async function parse(){
    if(!file||busy)return;
    if((file.size||0)>MAX){Alert.alert("BOQ too large","This preview accepts files up to 12 MB.");return;}
    setBusy(true);setResult(null);setMaterialsReady(false);setSelected(null);setMessage("Reading workbook locally on this phone…");
    try{
      const response=await fetch(file.uri);const buffer=await response.arrayBuffer();
      if(buffer.byteLength>MAX)throw new Error("This BOQ is over the 12 MB preview limit.");
      setMessage("Detecting sections, quantities and review suggestions…");
      const parsed=parseBoqLocally(buffer,file.name);
      if(parsed.error&&!parsed.boq)throw new Error(parsed.error);
      setResult(parsed);
      const sections=parsed.boq?.sections??[];
      setOpen(Object.fromEntries(sections.map(section=>[section.id,true])));
      setDecisions(Object.fromEntries(sections.flatMap(section=>section.items.map(item=>[item.id,startDecision(item)]))));
      setRates(Object.fromEntries(sections.flatMap(section=>section.items.map(item=>[item.id,item.rate==null?"":String(item.rate)]))));
      setRateSources(Object.fromEntries(sections.flatMap(section=>section.items.map(item=>[item.id,item.rate==null?"manual":"imported"]))));
      setMessage(`${parsed.itemCount} BOQ item${parsed.itemCount===1?"":"s"} detected locally. Review meaning, rates and supply responsibility before calculating materials.`);
    }catch(error){Alert.alert("Could not read BOQ",error instanceof Error?error.message:"Please try another workbook.");setMessage("");}
    finally{setBusy(false);}
  }

  const allItems=result?.boq?.sections.flatMap(section=>section.items)??[];
  const total=allItems.length;
  const confirmed=Object.values(decisions).filter(d=>d.confirmed).length;
  const unresolved=Object.values(decisions).filter(d=>!complete(d)).length;
  const unpriced=allItems.filter(item=>parseRate(rates[item.id]??"")===null).length;
  const mismatchCount=allItems.filter(item=>{const rate=parseRate(rates[item.id]??"");return rateSources[item.id]==="imported"&&rate!=null&&item.amount!=null&&Math.abs(item.quantity*rate-item.amount)>.05;}).length;
  const workingTotal=allItems.reduce((sum,item)=>{const rate=parseRate(rates[item.id]??"");return sum+(rate==null?0:item.quantity*rate);},0);
  const mobileDecisions=useMemo<Record<string,MobileMaterialDecision>>(()=>Object.fromEntries(Object.entries(decisions).map(([id,d])=>[id,{recipeFamily:d.recipeFamily,supplyResponsibility:d.supplyResponsibility,confirmed:d.confirmed}])),[decisions]);
  const materialSummary=useMemo(()=>materialsReady?summarizeMobileMaterials(allItems,mobileDecisions):[],[materialsReady,allItems,mobileDecisions]);

  function confirmAllReady(){setMaterialsReady(false);setDecisions(current=>Object.fromEntries(Object.entries(current).map(([id,d])=>[id,complete(d)?{...d,confirmed:true}:d])));}
  function confirmSection(section:LocalBoqSection){setMaterialsReady(false);setDecisions(current=>{const next={...current};for(const item of section.items){const d=next[item.id];if(d&&complete(d))next[item.id]={...d,confirmed:true};}return next;});}
  function updateEditing(patch:Partial<MobileEstimateDecision>){if(!editing)return;setMaterialsReady(false);setDecisions(current=>({...current,[editing.id]:{...(current[editing.id]??startDecision(editing)),...patch,edited:true,confirmed:false}}));}
  function saveEditing(){if(!editing)return;const decision=decisions[editing.id];if(!decision||!complete(decision)){Alert.alert("Still needs review","Choose a cost group, usable recipe state and supply responsibility first.");return;}setDecisions(current=>({...current,[editing.id]:{...current[editing.id],confirmed:true}}));setEditing(null);}
  function changeRate(id:string,value:string){setRates(current=>({...current,[id]:value}));setRateSources(current=>({...current,[id]:"manual"}));}

  async function continueToSummary(){
    if(!result?.boq||!materialsReady||continuing)return;
    setContinuing(true);
    try{
      const workspace=await loadWorkspace();
      await saveEstimateReviewSession({schemaVersion:1,savedAt:new Date().toISOString(),companyName:workspace.companyName,boq:result.boq,decisions,rates,rateSources});
      router.push("/estimate-summary");
    }catch(error){Alert.alert("Could not prepare estimate summary",error instanceof Error?error.message:"Please try again.");}
    finally{setContinuing(false);}
  }

  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.page}>
    <View style={s.hero}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Estimate</Text></Pressable><Text style={s.eye}>CHARISMAK APP · UPLOAD BOQ</Text><Text style={s.title}>Upload the BOQ you already use</Text><Text style={s.sub}>Excel analysis now runs locally on your phone. Charismak preserves source sections, quantities, rates and arithmetic warnings before anything becomes a Project.</Text></View>

    <Pressable style={s.drop} onPress={choose}><Text style={s.plus}>＋</Text><Text style={s.dropTitle}>{file?file.name:"Choose Excel BOQ"}</Text><Text style={s.dropCopy}>XLSX · XLS · CSV · up to 12 MB</Text></Pressable>
    <Text style={s.privacy}>LOCAL PREVIEW · The selected workbook does not need the missing cloud parser to be analysed.</Text>
    <Pressable disabled={!file||busy} onPress={parse} style={[s.primary,(!file||busy)&&s.disabled]}><Text style={s.primaryText}>{busy?"Reading BOQ…":"Read BOQ"}</Text></Pressable>
    {!!message&&<View style={s.message}><Text style={s.messageText}>{message}</Text></View>}

    {result?.boq&&<>
      <View style={s.summary}><Text style={s.greenEye}>BOQ REVIEW INTELLIGENCE</Text><Text style={s.summaryTitle}>{result.boq.name}</Text><Text style={s.summaryText}>{result.boq.sections.length} sections · {total} items · {result.reviewSummary.clearItems} clear suggestions · {result.reviewSummary.attentionItems} need attention</Text><Text style={s.summaryText}>{confirmed}/{total} confirmed · {unresolved} unresolved · {unpriced} unpriced · {mismatchCount} source arithmetic mismatch{mismatchCount===1?"":"es"}</Text><Pressable onPress={confirmAllReady} style={s.smallButton}><Text style={s.smallButtonText}>Confirm all ready suggestions</Text></Pressable></View>

      <View style={s.rateCard}><View><Text style={s.eyeBlue}>RATE ENGINE V1</Text><Text style={s.rateTitle}>Working direct total</Text><Text style={s.rateNote}>Imported Amount remains visible. Working Amount is Quantity × Working Rate. Editing a rate is always explicit.</Text></View><Text style={s.total}>{money(workingTotal)}</Text></View>

      <View style={s.materialCard}><Text style={s.greenEye}>BOQ → MATERIALS</Text><Text style={s.materialTitle}>Traceable material schedule</Text><Text style={s.materialNote}>Only confirmed items with supported recipes contribute to material totals. Unsupported specification-dependent items remain flagged.</Text><Pressable disabled={!confirmed} onPress={()=>setMaterialsReady(true)} style={[s.materialButton,!confirmed&&s.disabled]}><Text style={s.primaryText}>{materialsReady?"Recalculate materials":"Calculate materials"}</Text></Pressable></View>

      {materialsReady&&<View style={s.materialList}><Text style={s.materialTitle}>Material summary</Text>{materialSummary.length?materialSummary.map(row=><View key={row.key} style={s.materialRow}><View style={{flex:1}}><Text style={s.materialName}>{row.material}</Text><Text style={s.materialSource}>{row.sources.length} BOQ source item{row.sources.length===1?"":"s"}</Text></View><Text style={s.materialQty}>{qty(row.quantity)} {row.unit}</Text></View>):<Text style={s.empty}>No contractor material totals are available yet. Confirm supported contractor-supplied items first.</Text>}</View>}

      {materialsReady&&<Pressable disabled={continuing} onPress={continueToSummary} style={[s.next,continuing&&s.disabled]}><View style={{flex:1}}><Text style={s.nextEye}>NEXT</Text><Text style={s.nextTitle}>Estimate summary & Project review</Text><Text style={s.nextCopy}>Unresolved and unpriced lines stay visible; they are not silently filled.</Text></View><Text style={s.nextArrow}>{continuing?"…":"›"}</Text></Pressable>}

      {result.boq.sections.map(section=>{const ready=section.items.filter(item=>complete(decisions[item.id]??startDecision(item))).length;const done=section.items.filter(item=>decisions[item.id]?.confirmed).length;return <View key={section.id} style={s.section}>
        <Pressable style={s.sectionHead} onPress={()=>setOpen(current=>({...current,[section.id]:!current[section.id]}))}><View style={{flex:1}}><Text style={s.sectionCode}>{section.code??"SECTION"}</Text><Text style={s.sectionTitle}>{section.title}</Text><Text style={s.sectionMeta}>{done}/{section.items.length} confirmed · {section.items.length-ready} need attention</Text></View><Text style={s.chev}>{open[section.id]?"⌃":"⌄"}</Text></Pressable>
        <Pressable onPress={()=>confirmSection(section)} style={s.sectionConfirm}><Text style={s.sectionConfirmText}>Confirm {ready} ready item{ready===1?"":"s"}</Text></Pressable>
        {open[section.id]&&section.items.map(item=>{const decision=decisions[item.id]??startDecision(item);const rate=parseRate(rates[item.id]??"");const workingAmount=rate==null?null:item.quantity*rate;const mismatch=rateSources[item.id]==="imported"&&rate!=null&&item.amount!=null&&Math.abs(workingAmount!-item.amount)>.05;const breakdown=materialsReady?calculateMobileMaterials(item,mobileDecisions[item.id]??{recipeFamily:"needs_review",supplyResponsibility:"unknown",confirmed:false}):null;return <View key={item.id} style={[s.item,(!complete(decision)||mismatch)&&s.attention]}>
          <View style={s.itemTop}><Text style={s.itemNo}>{item.itemNo??"—"}</Text><Text style={s.itemDesc}>{item.description}</Text></View>
          <View style={s.measureRow}><Text style={s.measure}>{qty(item.quantity)} {item.unit}</Text><Text style={s.measure}>Source rate {money(item.rate)}</Text><Text style={[s.measure,mismatch&&s.warnText]}>Source amount {money(item.amount)}</Text></View>
          <View style={s.rateRow}><View style={{flex:1}}><Text style={s.label}>WORKING RATE</Text><TextInput value={rates[item.id]??""} onChangeText={value=>changeRate(item.id,value)} keyboardType="decimal-pad" placeholder="Enter rate" style={s.rateInput}/></View><View style={{alignItems:"flex-end"}}><Text style={s.label}>WORKING AMOUNT</Text><Text style={s.workingAmount}>{money(workingAmount)}</Text><Text style={s.rateSource}>{rateSources[item.id]==="manual"?"Manual":"Imported"}</Text></View></View>
          {mismatch&&<View style={s.warning}><Text style={s.warningTitle}>SOURCE ARITHMETIC MISMATCH</Text><Text style={s.warningCopy}>The imported amount does not equal Quantity × imported Rate. Review the working rate deliberately before Project staging.</Text></View>}
          <View style={s.tags}><Text style={s.tag}>{decision.costCode||"?"} {COST_CODES.find(([code])=>code===decision.costCode)?.[1]??"Cost group needed"}</Text><Text style={s.tag}>{RECIPES.find(([value])=>value===decision.recipeFamily)?.[1]??decision.recipeFamily}</Text><Text style={s.tag}>{SUPPLIES.find(([value])=>value===decision.supplyResponsibility)?.[1]??"Supply needed"}</Text></View>
          <View style={s.actions}><Text style={[s.confidence,item.reviewSuggestion?.confidence==="high"&&s.confidenceHigh]}>{item.reviewSuggestion?.confidence??"low"} confidence</Text>{decision.confirmed?<Text style={s.confirmed}>Confirmed</Text>:<Pressable onPress={()=>setEditing(item)} style={s.reviewButton}><Text style={s.reviewButtonText}>{complete(decision)?"Review / confirm":"Resolve"}</Text></Pressable>}</View>
          <Pressable onPress={()=>setSelected(current=>current===item.id?null:item.id)}><Text style={s.drill}>{selected===item.id?"Hide material trace":"View materials for this quantity"}</Text></Pressable>
          {selected===item.id&&<View style={s.drillBox}>{!materialsReady?<Text style={s.empty}>Confirm the item and calculate materials above first.</Text>:breakdown?.status==="available"?<><Text style={s.materialName}>{breakdown.recipeName}</Text>{breakdown.materials.map((material,index)=><View key={`${item.id}-${index}`} style={s.materialRow}><View style={{flex:1}}><Text style={s.materialName}>{material.material}</Text><Text style={s.materialSource}>{qty(material.baseQuantity)} {material.unit}{material.wastePercent?` + ${material.wastePercent}% waste`:""}</Text></View><Text style={s.materialQty}>{qty(material.totalQuantity)} {material.unit}</Text></View>)}</>:<Text style={s.empty}>{breakdown?.assumptions[0]??"This recipe still needs review."}</Text>}</View>}
        </View>})}
      </View>})}

      {!!result.warnings.length&&<View style={s.warningList}><Text style={s.warningTitle}>{result.warnings.length} import note{result.warnings.length===1?"":"s"}</Text>{result.warnings.slice(0,20).map((warning,index)=><Text key={`${warning.sheet}-${warning.row}-${index}`} style={s.warningCopy}><Text style={{fontWeight:"900"}}>{warning.sheet}{warning.row?` row ${warning.row}`:""}: </Text>{warning.message}</Text>)}</View>}
    </>}

    <Modal visible={Boolean(editing)} animationType="slide" transparent onRequestClose={()=>setEditing(null)}><View style={s.modalBack}><View style={s.modal}><View style={s.modalHead}><View style={{flex:1}}><Text style={s.nextEye}>REVIEW BOQ ITEM</Text><Text numberOfLines={3} style={s.modalTitle}>{editing?.description}</Text></View><Pressable onPress={()=>setEditing(null)}><Text style={s.close}>×</Text></Pressable></View>{editing&&<ScrollView contentContainerStyle={s.modalBody}>
      <Text style={s.group}>COST GROUP</Text><View style={s.chips}>{COST_CODES.map(([code,name])=><Pressable key={code} onPress={()=>updateEditing({costCode:code})} style={[s.chip,decisions[editing.id]?.costCode===code&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.costCode===code&&s.chipTextActive]}>{code} {name}</Text></Pressable>)}</View>
      <Text style={s.group}>MATERIAL RECIPE</Text><View style={s.chips}>{RECIPES.map(([value,label])=><Pressable key={value} onPress={()=>updateEditing({recipeFamily:value})} style={[s.chip,decisions[editing.id]?.recipeFamily===value&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.recipeFamily===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
      <Text style={s.group}>WHO SUPPLIES IT?</Text><View style={s.chips}>{SUPPLIES.map(([value,label])=><Pressable key={value} onPress={()=>updateEditing({supplyResponsibility:value})} style={[s.chip,decisions[editing.id]?.supplyResponsibility===value&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.supplyResponsibility===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
      {!!editing.reviewSuggestion?.reasons.length&&<View style={s.reason}>{editing.reviewSuggestion.reasons.map(reason=><Text key={reason} style={s.reasonText}>• {reason}</Text>)}</View>}
      <Pressable onPress={saveEditing} style={s.primary}><Text style={s.primaryText}>Confirm item</Text></Pressable>
    </ScrollView>}</View></View></Modal>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f3f7fa"},page:{padding:15,paddingBottom:70,gap:12},hero:{backgroundColor:"#082945",borderRadius:20,padding:18,gap:6},back:{fontSize:11,fontWeight:"800",color:"#b9d4e5"},eye:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#9ec5df"},title:{fontSize:23,fontWeight:"900",color:"#fff"},sub:{fontSize:11,lineHeight:17,color:"#d7e5ef"},drop:{minHeight:145,borderWidth:1.5,borderStyle:"dashed",borderColor:"#9db8ca",borderRadius:18,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",padding:18},plus:{fontSize:34,color:"#0b668f"},dropTitle:{fontSize:15,fontWeight:"900",color:"#173f5a",marginTop:3,textAlign:"center"},dropCopy:{fontSize:9,color:"#788b99",marginTop:4},privacy:{fontSize:8,fontWeight:"900",letterSpacing:.5,color:"#16825c",textAlign:"center"},primary:{backgroundColor:"#0b668f",borderRadius:13,padding:13,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"900",fontSize:11},disabled:{opacity:.45},message:{backgroundColor:"#edf8f3",borderRadius:12,padding:11},messageText:{fontSize:10,color:"#176247",fontWeight:"700"},summary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,padding:14,gap:5},greenEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#16825c"},summaryTitle:{fontSize:17,fontWeight:"900",color:"#173f5a"},summaryText:{fontSize:9,lineHeight:14,color:"#667b8b"},smallButton:{alignSelf:"flex-start",backgroundColor:"#0b668f",borderRadius:9,paddingHorizontal:10,paddingVertical:8,marginTop:4},smallButtonText:{fontSize:8,fontWeight:"900",color:"#fff"},rateCard:{backgroundColor:"#eef5f9",borderRadius:16,padding:14,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},eyeBlue:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#0b668f"},rateTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:3},rateNote:{fontSize:8,lineHeight:13,color:"#687d8c",marginTop:3,maxWidth:230},total:{fontSize:16,fontWeight:"900",color:"#173f5a"},materialCard:{backgroundColor:"#eef8f3",borderRadius:16,padding:14,gap:5},materialTitle:{fontSize:14,fontWeight:"900",color:"#173f5a"},materialNote:{fontSize:9,lineHeight:14,color:"#687d8c"},materialButton:{alignSelf:"flex-start",backgroundColor:"#16825c",borderRadius:9,paddingHorizontal:11,paddingVertical:8,marginTop:5},materialList:{backgroundColor:"#fff",borderRadius:16,padding:14,gap:6},materialRow:{flexDirection:"row",alignItems:"center",gap:8,borderTopWidth:1,borderTopColor:"#e4ebef",paddingVertical:8},materialName:{fontSize:10,fontWeight:"900",color:"#35566b"},materialSource:{fontSize:8,color:"#788a96",marginTop:2},materialQty:{fontSize:10,fontWeight:"900",color:"#0b668f"},empty:{fontSize:9,lineHeight:14,color:"#6a7d8b"},next:{backgroundColor:"#082945",borderRadius:16,padding:14,flexDirection:"row",alignItems:"center",gap:10},nextEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#9ec5df"},nextTitle:{fontSize:14,fontWeight:"900",color:"#fff",marginTop:2},nextCopy:{fontSize:8,lineHeight:13,color:"#d7e5ef",marginTop:3},nextArrow:{fontSize:28,color:"#fff"},section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{backgroundColor:"#eaf3f8",padding:13,flexDirection:"row",alignItems:"center"},sectionCode:{fontSize:8,fontWeight:"900",color:"#0b668f"},sectionTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:2},sectionMeta:{fontSize:8,color:"#718493",marginTop:3},chev:{fontSize:15,color:"#718493"},sectionConfirm:{alignSelf:"flex-end",margin:8,borderWidth:1,borderColor:"#9fc3d7",borderRadius:8,paddingHorizontal:9,paddingVertical:6},sectionConfirmText:{fontSize:8,fontWeight:"900",color:"#0b668f"},item:{padding:12,borderTopWidth:1,borderTopColor:"#edf1f4",gap:8},attention:{backgroundColor:"#fffdf7"},itemTop:{flexDirection:"row",gap:8},itemNo:{fontSize:9,fontWeight:"900",color:"#78909f",minWidth:25},itemDesc:{fontSize:10,lineHeight:15,fontWeight:"700",color:"#28495f",flex:1},measureRow:{flexDirection:"row",gap:8,flexWrap:"wrap",justifyContent:"space-between"},measure:{fontSize:8,color:"#70828f"},warnText:{color:"#8a5b00",fontWeight:"900"},rateRow:{flexDirection:"row",gap:10,alignItems:"flex-end",backgroundColor:"#f8fbfd",borderRadius:10,padding:9},label:{fontSize:7,fontWeight:"900",letterSpacing:.6,color:"#748795"},rateInput:{marginTop:4,borderWidth:1,borderColor:"#cbd8e0",backgroundColor:"#fff",borderRadius:8,paddingHorizontal:9,paddingVertical:7,fontSize:10,color:"#173f5a",minWidth:105},workingAmount:{fontSize:11,fontWeight:"900",color:"#173f5a",marginTop:5},rateSource:{fontSize:7,color:"#7e8e99",marginTop:2},warning:{backgroundColor:"#fff4ce",borderRadius:9,padding:9,gap:3},warningTitle:{fontSize:8,fontWeight:"900",color:"#8a5b00"},warningCopy:{fontSize:8,lineHeight:13,color:"#775c18"},tags:{backgroundColor:"#f7fafc",borderRadius:9,padding:8,gap:3},tag:{fontSize:8,color:"#536d7f"},actions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},confidence:{fontSize:7,fontWeight:"900",textTransform:"uppercase",color:"#986b17",backgroundColor:"#fff0c9",borderRadius:999,paddingHorizontal:7,paddingVertical:4},confidenceHigh:{color:"#176247",backgroundColor:"#e4f5ed"},confirmed:{fontSize:8,fontWeight:"900",color:"#176247"},reviewButton:{backgroundColor:"#0b668f",borderRadius:8,paddingHorizontal:9,paddingVertical:6},reviewButtonText:{fontSize:8,fontWeight:"900",color:"#fff"},drill:{fontSize:8,fontWeight:"900",color:"#0b668f"},drillBox:{backgroundColor:"#f7fbfd",borderRadius:10,padding:10,gap:5},warningList:{backgroundColor:"#fff9e8",borderRadius:15,padding:13,gap:6},modalBack:{flex:1,backgroundColor:"rgba(4,24,38,.48)",justifyContent:"flex-end"},modal:{maxHeight:"92%",backgroundColor:"#f7f9fb",borderTopLeftRadius:22,borderTopRightRadius:22,overflow:"hidden"},modalHead:{backgroundColor:"#082945",padding:16,flexDirection:"row",gap:10},modalTitle:{fontSize:14,fontWeight:"900",color:"#fff",marginTop:4},close:{fontSize:28,color:"#fff"},modalBody:{padding:15,paddingBottom:34,gap:10},group:{fontSize:8,fontWeight:"900",letterSpacing:.8,color:"#647b8b"},chips:{flexDirection:"row",flexWrap:"wrap",gap:6},chip:{borderWidth:1,borderColor:"#cfdae2",backgroundColor:"#fff",borderRadius:999,paddingHorizontal:9,paddingVertical:7},chipActive:{borderColor:"#0b668f",backgroundColor:"#0b668f"},chipText:{fontSize:8,color:"#536d7f",fontWeight:"700"},chipTextActive:{color:"#fff"},reason:{backgroundColor:"#edf4f8",borderRadius:11,padding:10,gap:4},reasonText:{fontSize:9,lineHeight:14,color:"#5d7485"}
});
