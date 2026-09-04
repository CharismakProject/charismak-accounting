import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
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
  const {projectId,projectName}=useLocalSearchParams<{projectId?:string;projectName?:string}>();
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
  const [showAll,setShowAll]=useState(false);

  async function choose(){
    const picked=await DocumentPicker.getDocumentAsync({multiple:false,copyToCacheDirectory:true,type:["text/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]});
    if(picked.canceled)return;
    setFile(picked.assets[0]);setResult(null);setMessage("");setOpen({});setDecisions({});setRates({});setRateSources({});setMaterialsReady(false);setSelected(null);setShowAll(false);
  }

  async function parse(){
    if(!file||busy)return;
    if((file.size||0)>MAX){Alert.alert("BOQ too large","This preview accepts files up to 12 MB.");return;}
    setBusy(true);setResult(null);setMaterialsReady(false);setSelected(null);setShowAll(false);setMessage("Reading workbook locally on this phone…");
    try{
      const response=await fetch(file.uri);const buffer=await response.arrayBuffer();
      if(buffer.byteLength>MAX)throw new Error("This BOQ is over the 12 MB preview limit.");
      setMessage("Separating priced BOQ items from calculation/material rows…");
      const parsed=parseBoqLocally(buffer,file.name);
      if(parsed.error&&!parsed.boq)throw new Error(parsed.error);
      setResult(parsed);
      const sections=parsed.boq?.sections??[];
      setOpen(Object.fromEntries(sections.map(section=>[section.id,section.items.some(item=>item.reviewSuggestion?.requiresAttention||item.rate==null||(item.rate!=null&&item.amount!=null&&Math.abs(item.quantity*item.rate-item.amount)>.05))])));
      setDecisions(Object.fromEntries(sections.flatMap(section=>section.items.map(item=>[item.id,startDecision(item)]))));
      setRates(Object.fromEntries(sections.flatMap(section=>section.items.map(item=>[item.id,item.rate==null?"":String(item.rate)]))));
      setRateSources(Object.fromEntries(sections.flatMap(section=>section.items.map(item=>[item.id,item.rate==null?"manual":"imported"]))));
      setMessage(`${parsed.itemCount} primary BOQ item${parsed.itemCount===1?"":"s"} detected. Calculation/material take-off rows and final summary rows are excluded from the review list.`);
    }catch(error){Alert.alert("Could not read BOQ",error instanceof Error?error.message:"Please try another workbook.");setMessage("");}
    finally{setBusy(false);}
  }

  const allItems=result?.boq?.sections.flatMap(section=>section.items)??[];
  const total=allItems.length;
  const confirmed=Object.values(decisions).filter(d=>d.confirmed).length;
  const unresolved=Object.values(decisions).filter(d=>!complete(d)).length;
  const unpriced=allItems.filter(item=>parseRate(rates[item.id]??"")===null).length;
  const mismatch=(item:LocalBoqItem)=>{const rate=parseRate(rates[item.id]??"");return rateSources[item.id]==="imported"&&rate!=null&&item.amount!=null&&Math.abs(item.quantity*rate-item.amount)>.05;};
  const mismatchCount=allItems.filter(mismatch).length;
  const workingTotal=allItems.reduce((sum,item)=>{const rate=parseRate(rates[item.id]??"");return sum+(rate==null?0:item.quantity*rate);},0);
  const needsAttention=(item:LocalBoqItem)=>{const d=decisions[item.id]??startDecision(item);return !complete(d)||parseRate(rates[item.id]??"")===null||mismatch(item)||Boolean(item.reviewSuggestion?.requiresAttention);};
  const attentionCount=allItems.filter(needsAttention).length;
  const clearReady=allItems.filter(item=>!item.reviewSuggestion?.requiresAttention&&complete(decisions[item.id]??startDecision(item))).length;
  const mobileDecisions=useMemo<Record<string,MobileMaterialDecision>>(()=>Object.fromEntries(Object.entries(decisions).map(([id,d])=>[id,{recipeFamily:d.recipeFamily,supplyResponsibility:d.supplyResponsibility,confirmed:d.confirmed}])),[decisions]);
  const materialSummary=useMemo(()=>materialsReady?summarizeMobileMaterials(allItems,mobileDecisions):[],[materialsReady,allItems,mobileDecisions]);
  const visibleSections=useMemo(()=>{const sections=result?.boq?.sections??[];return showAll?sections:sections.filter(section=>section.items.some(needsAttention));},[result,showAll,decisions,rates,rateSources]);

  function confirmAllReady(){setMaterialsReady(false);setDecisions(current=>{const next={...current};for(const item of allItems){const d=next[item.id]??startDecision(item);if(!item.reviewSuggestion?.requiresAttention&&complete(d))next[item.id]={...d,confirmed:true};}return next;});}
  function confirmSection(section:LocalBoqSection){setMaterialsReady(false);setDecisions(current=>{const next={...current};for(const item of section.items){const d=next[item.id];if(d&&complete(d))next[item.id]={...d,confirmed:true};}return next;});}
  function updateEditing(patch:Partial<MobileEstimateDecision>){if(!editing)return;setMaterialsReady(false);setDecisions(current=>({...current,[editing.id]:{...(current[editing.id]??startDecision(editing)),...patch,edited:true,confirmed:false}}));}
  function saveEditing(){if(!editing)return;const decision=decisions[editing.id];if(!decision||!complete(decision)){Alert.alert("Still needs review","Choose a cost group, usable recipe state and supply responsibility first.");return;}setDecisions(current=>({...current,[editing.id]:{...current[editing.id],confirmed:true}}));setEditing(null);}
  function changeRate(id:string,value:string){setMaterialsReady(false);setRates(current=>({...current,[id]:value}));setRateSources(current=>({...current,[id]:"manual"}));}

  async function continueToSummary(){
    if(!result?.boq||!materialsReady||continuing)return;
    setContinuing(true);
    try{
      const workspace=await loadWorkspace();
      await saveEstimateReviewSession({schemaVersion:1,savedAt:new Date().toISOString(),companyName:workspace.companyName,projectId,projectName,boq:result.boq,decisions,rates,rateSources});
      if(projectId)router.push({pathname:"/project-boq-summary",params:{projectId}});else router.push("/estimate-summary");
    }catch(error){Alert.alert("Could not prepare estimate summary",error instanceof Error?error.message:"Please try again.");}
    finally{setContinuing(false);}
  }

  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.page}>
    <View style={s.hero}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Estimate</Text></Pressable><Text style={s.eye}>CHARISMAK APP · UPLOAD BOQ</Text><Text style={s.title}>Upload the BOQ you already use</Text><Text style={s.sub}>{projectId?`For ${projectName||"this project"}. `:""}Charismak keeps the measured/priced work lines, ignores embedded material-calculation rows and shows only the exceptions that actually need your decision.</Text></View>

    <Pressable style={s.drop} onPress={choose}><Text style={s.plus}>＋</Text><Text style={s.dropTitle}>{file?file.name:"Choose Excel BOQ"}</Text><Text style={s.dropCopy}>XLSX · XLS · CSV · up to 12 MB</Text></Pressable>
    <Text style={s.privacy}>LOCAL PREVIEW · The workbook is analysed on this phone.</Text>
    <Pressable disabled={!file||busy} onPress={parse} style={[s.primary,(!file||busy)&&s.disabled]}><Text style={s.primaryText}>{busy?"Reading BOQ…":"Read BOQ"}</Text></Pressable>
    {!!message&&<View style={s.message}><Text style={s.messageText}>{message}</Text></View>}

    {result?.boq&&<>
      <View style={s.summary}><Text style={s.greenEye}>SMART REVIEW</Text><Text style={s.summaryTitle}>{result.boq.name}</Text><Text style={s.summaryText}>{result.boq.sections.length} sections · {total} primary items</Text><Text style={s.summaryStrong}>{result.reviewSummary.clearItems} clear suggestions can be accepted together · {attentionCount} currently need attention</Text><Text style={s.summaryText}>{confirmed}/{total} confirmed · {unresolved} classification exceptions · {unpriced} unpriced · {mismatchCount} arithmetic mismatch{mismatchCount===1?"":"es"}</Text><View style={s.summaryActions}><Pressable disabled={!clearReady} onPress={confirmAllReady} style={[s.smallButton,!clearReady&&s.disabled]}><Text style={s.smallButtonText}>{clearReady?`Accept ${clearReady} clear suggestions`:"Clear suggestions accepted"}</Text></Pressable><Pressable onPress={()=>setShowAll(v=>!v)} style={s.outlineButton}><Text style={s.outlineButtonText}>{showAll?"Show exceptions only":`Show all ${total} items`}</Text></Pressable></View></View>

      <View style={s.rateCard}><View style={{flex:1}}><Text style={s.eyeBlue}>RATE ENGINE</Text><Text style={s.rateTitle}>Working direct total</Text><Text style={s.rateNote}>Imported amounts stay visible. Only missing rates or arithmetic differences need manual attention.</Text></View><Text style={s.total}>{money(workingTotal)}</Text></View>

      <View style={s.materialCard}><Text style={s.greenEye}>BOQ → MATERIALS</Text><Text style={s.materialTitle}>Traceable material schedule</Text><Text style={s.materialNote}>Accepted items use deterministic recipes. Items that still need a specification remain flagged instead of being guessed.</Text><Pressable disabled={!confirmed} onPress={()=>setMaterialsReady(true)} style={[s.materialButton,!confirmed&&s.disabled]}><Text style={s.primaryText}>{materialsReady?"Recalculate materials":"Calculate materials"}</Text></Pressable></View>

      {materialsReady&&<View style={s.materialList}><Text style={s.materialTitle}>Material summary</Text>{materialSummary.length?materialSummary.map(row=><View key={row.key} style={s.materialRow}><View style={{flex:1}}><Text style={s.materialName}>{row.material}</Text><Text style={s.materialSource}>{row.sources.length} BOQ source item{row.sources.length===1?"":"s"}</Text></View><Text style={s.materialQty}>{qty(row.quantity)} {row.unit}</Text></View>):<Text style={s.empty}>No contractor material totals are available yet. Accept supported contractor-supplied items first.</Text>}</View>}

      {materialsReady&&<Pressable disabled={continuing} onPress={continueToSummary} style={[s.next,continuing&&s.disabled]}><View style={{flex:1}}><Text style={s.nextEye}>NEXT</Text><Text style={s.nextTitle}>{projectId?"Reviewed BOQ summary":"Estimate summary & Project review"}</Text><Text style={s.nextCopy}>Unresolved and unpriced lines stay visible; nothing is silently filled.</Text></View><Text style={s.nextArrow}>{continuing?"…":"›"}</Text></Pressable>}

      {!showAll&&attentionCount===0&&<View style={s.allClear}><Text style={s.allClearTitle}>No review exceptions remain</Text><Text style={s.allClearCopy}>Use “Show all items” only if you want to inspect the full bill. You do not need to open every line.</Text></View>}

      {visibleSections.map(section=>{const ready=section.items.filter(item=>complete(decisions[item.id]??startDecision(item))).length;const done=section.items.filter(item=>decisions[item.id]?.confirmed).length;const sectionAttention=section.items.filter(needsAttention).length;const items=showAll?section.items:section.items.filter(needsAttention);return <View key={section.id} style={s.section}>
        <Pressable style={s.sectionHead} onPress={()=>setOpen(current=>({...current,[section.id]:!current[section.id]}))}><View style={{flex:1}}><Text style={s.sectionCode}>{section.code??"SECTION"}</Text><Text style={s.sectionTitle}>{section.title}</Text><Text style={s.sectionMeta}>{done}/{section.items.length} confirmed · {sectionAttention} need attention</Text></View><Text style={s.chev}>{open[section.id]?"⌃":"⌄"}</Text></Pressable>
        <Pressable onPress={()=>confirmSection(section)} style={s.sectionConfirm}><Text style={s.sectionConfirmText}>Confirm ready items in section ({ready})</Text></Pressable>
        {open[section.id]&&items.map(item=>{const decision=decisions[item.id]??startDecision(item);const rate=parseRate(rates[item.id]??"");const workingAmount=rate==null?null:item.quantity*rate;const badMath=mismatch(item);const breakdown=materialsReady?calculateMobileMaterials(item,mobileDecisions[item.id]??{recipeFamily:"needs_review",supplyResponsibility:"unknown",confirmed:false}):null;return <View key={item.id} style={[s.item,needsAttention(item)&&s.attention]}>
          <View style={s.itemTop}><Text style={s.itemNo}>{item.itemNo??"—"}</Text><Text style={s.itemDesc}>{item.description}</Text></View>
          <View style={s.measureRow}><Text style={s.measure}>{qty(item.quantity)} {item.unit}</Text><Text style={s.measure}>Source rate {money(item.rate)}</Text><Text style={[s.measure,badMath&&s.warnText]}>Source amount {money(item.amount)}</Text></View>
          <View style={s.rateRow}><View style={{flex:1}}><Text style={s.label}>WORKING RATE</Text><TextInput value={rates[item.id]??""} onChangeText={value=>changeRate(item.id,value)} keyboardType="decimal-pad" placeholder="Enter rate" style={s.rateInput}/></View><View style={{alignItems:"flex-end"}}><Text style={s.label}>WORKING AMOUNT</Text><Text style={s.workingAmount}>{money(workingAmount)}</Text><Text style={s.rateSource}>{rateSources[item.id]==="manual"?"Manual":"Imported"}</Text></View></View>
          {badMath&&<View style={s.warning}><Text style={s.warningTitle}>SOURCE ARITHMETIC MISMATCH</Text><Text style={s.warningCopy}>Imported Amount does not equal Quantity × imported Rate. Review the rate before Project staging.</Text></View>}
          <View style={s.tags}><Text style={s.tag}>{decision.costCode||"?"} {COST_CODES.find(([code])=>code===decision.costCode)?.[1]??"Cost group needed"}</Text><Text style={s.tag}>{RECIPES.find(([value])=>value===decision.recipeFamily)?.[1]??decision.recipeFamily}</Text><Text style={s.tag}>{SUPPLIES.find(([value])=>value===decision.supplyResponsibility)?.[1]??"Supply needed"}</Text></View>
          <View style={s.actions}><Text style={[s.confidence,item.reviewSuggestion?.confidence==="high"&&s.confidenceHigh]}>{item.reviewSuggestion?.confidence??"low"} confidence</Text>{decision.confirmed?<Text style={s.confirmed}>Confirmed</Text>:<Pressable onPress={()=>setEditing(item)} style={s.reviewButton}><Text style={s.reviewButtonText}>{complete(decision)?"Review / confirm":"Resolve"}</Text></Pressable>}</View>
          <Pressable onPress={()=>setSelected(current=>current===item.id?null:item.id)}><Text style={s.drill}>{selected===item.id?"Hide material trace":"View materials for this quantity"}</Text></Pressable>
          {selected===item.id&&<View style={s.drillBox}>{!materialsReady?<Text style={s.empty}>Confirm the item and calculate materials above first.</Text>:breakdown?.status==="available"?<><Text style={s.materialName}>{breakdown.recipeName}</Text>{breakdown.materials.map((material,index)=><View key={`${item.id}-${index}`} style={s.materialRow}><View style={{flex:1}}><Text style={s.materialName}>{material.material}</Text><Text style={s.materialSource}>{qty(material.baseQuantity)} {material.unit}{material.wastePercent?` + ${material.wastePercent}% waste`:""}</Text></View><Text style={s.materialQty}>{qty(material.totalQuantity)} {material.unit}</Text></View>)}</>:<Text style={s.empty}>{breakdown?.assumptions[0]??"This recipe still needs review."}</Text>}</View>}
        </View>})}
      </View>})}

      {!!result.warnings.length&&<View style={s.warningList}><Text style={s.warningTitle}>{result.warnings.length} import note{result.warnings.length===1?"":"s"}</Text>{result.warnings.slice(0,20).map((warning,index)=><Text key={`${warning.sheet}-${warning.row}-${index}`} style={s.warningCopy}><Text style={{fontWeight:"900"}}>{warning.sheet}{warning.row?` row ${warning.row}`:""}: </Text>{warning.message}</Text>)}</View>}
    </>}

    <Modal visible={Boolean(editing)} animationType="slide" transparent onRequestClose={()=>setEditing(null)}><View style={s.modalBack}><View style={s.modal}><View style={s.modalHead}><View style={{flex:1}}><Text style={s.nextEye}>REVIEW EXCEPTION</Text><Text numberOfLines={3} style={s.modalTitle}>{editing?.description}</Text></View><Pressable onPress={()=>setEditing(null)}><Text style={s.close}>×</Text></Pressable></View>{editing&&<ScrollView contentContainerStyle={s.modalBody}>
      <Text style={s.group}>COST GROUP</Text><View style={s.chips}>{COST_CODES.map(([code,name])=><Pressable key={code} onPress={()=>updateEditing({costCode:code})} style={[s.chip,decisions[editing.id]?.costCode===code&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.costCode===code&&s.chipTextActive]}>{code} {name}</Text></Pressable>)}</View>
      <Text style={s.group}>MATERIAL RECIPE</Text><View style={s.chips}>{RECIPES.map(([value,label])=><Pressable key={value} onPress={()=>updateEditing({recipeFamily:value})} style={[s.chip,decisions[editing.id]?.recipeFamily===value&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.recipeFamily===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
      <Text style={s.group}>WHO SUPPLIES IT?</Text><View style={s.chips}>{SUPPLIES.map(([value,label])=><Pressable key={value} onPress={()=>updateEditing({supplyResponsibility:value})} style={[s.chip,decisions[editing.id]?.supplyResponsibility===value&&s.chipActive]}><Text style={[s.chipText,decisions[editing.id]?.supplyResponsibility===value&&s.chipTextActive]}>{label}</Text></Pressable>)}</View>
      {!!editing.reviewSuggestion?.reasons.length&&<View style={s.reason}>{editing.reviewSuggestion.reasons.map(reason=><Text key={reason} style={s.reasonText}>• {reason}</Text>)}</View>}
      <Pressable onPress={saveEditing} style={s.primary}><Text style={s.primaryText}>Confirm exception</Text></Pressable>
    </ScrollView>}</View></View></Modal>
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f3f7fa"},page:{padding:16,paddingBottom:76,gap:13},hero:{backgroundColor:"#082945",borderRadius:20,padding:19,gap:7},back:{fontSize:13,fontWeight:"800",color:"#b9d4e5",fontFamily:"sans-serif"},eye:{fontSize:11,fontWeight:"900",letterSpacing:1.1,color:"#9ec5df",fontFamily:"sans-serif"},title:{fontSize:25,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},sub:{fontSize:13,lineHeight:19,color:"#d7e5ef",fontFamily:"sans-serif"},drop:{minHeight:145,borderWidth:1.5,borderStyle:"dashed",borderColor:"#9db8ca",borderRadius:18,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",padding:18},plus:{fontSize:34,color:"#0b668f"},dropTitle:{fontSize:17,fontWeight:"900",color:"#173f5a",marginTop:3,textAlign:"center",fontFamily:"sans-serif"},dropCopy:{fontSize:11,color:"#788b99",marginTop:4,fontFamily:"sans-serif"},privacy:{fontSize:10,fontWeight:"900",letterSpacing:.5,color:"#16825c",textAlign:"center",fontFamily:"sans-serif"},primary:{backgroundColor:"#0b668f",borderRadius:13,padding:14,alignItems:"center"},primaryText:{color:"#fff",fontWeight:"900",fontSize:13,fontFamily:"sans-serif"},disabled:{opacity:.45},message:{backgroundColor:"#edf8f3",borderRadius:12,padding:12},messageText:{fontSize:12,lineHeight:17,color:"#176247",fontWeight:"700",fontFamily:"sans-serif"},summary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,padding:15,gap:6},greenEye:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#16825c",fontFamily:"sans-serif"},summaryTitle:{fontSize:19,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},summaryText:{fontSize:11,lineHeight:16,color:"#667b8b",fontFamily:"sans-serif"},summaryStrong:{fontSize:12,lineHeight:17,color:"#173f5a",fontWeight:"800",fontFamily:"sans-serif"},summaryActions:{flexDirection:"row",flexWrap:"wrap",gap:8,marginTop:4},smallButton:{backgroundColor:"#0b668f",borderRadius:10,paddingHorizontal:12,paddingVertical:10},smallButtonText:{fontSize:10,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},outlineButton:{borderWidth:1,borderColor:"#a9c1cf",borderRadius:10,paddingHorizontal:12,paddingVertical:10,backgroundColor:"#fff"},outlineButtonText:{fontSize:10,fontWeight:"900",color:"#0b668f",fontFamily:"sans-serif"},rateCard:{backgroundColor:"#eef5f9",borderRadius:16,padding:15,flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:12},eyeBlue:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#0b668f",fontFamily:"sans-serif"},rateTitle:{fontSize:16,fontWeight:"900",color:"#173f5a",marginTop:3,fontFamily:"sans-serif"},rateNote:{fontSize:10,lineHeight:15,color:"#687d8c",marginTop:3,maxWidth:240,fontFamily:"sans-serif"},total:{fontSize:18,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},materialCard:{backgroundColor:"#eef8f3",borderRadius:16,padding:15,gap:6},materialTitle:{fontSize:16,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},materialNote:{fontSize:11,lineHeight:16,color:"#687d8c",fontFamily:"sans-serif"},materialButton:{alignSelf:"flex-start",backgroundColor:"#16825c",borderRadius:10,paddingHorizontal:12,paddingVertical:10,marginTop:5},materialList:{backgroundColor:"#fff",borderRadius:16,padding:15,gap:6},materialRow:{flexDirection:"row",alignItems:"center",gap:8,borderTopWidth:1,borderTopColor:"#e4ebef",paddingVertical:9},materialName:{fontSize:12,fontWeight:"900",color:"#35566b",fontFamily:"sans-serif"},materialSource:{fontSize:10,color:"#788a96",marginTop:2,fontFamily:"sans-serif"},materialQty:{fontSize:12,fontWeight:"900",color:"#0b668f",fontFamily:"sans-serif"},empty:{fontSize:11,lineHeight:16,color:"#6a7d8b",fontFamily:"sans-serif"},next:{backgroundColor:"#082945",borderRadius:16,padding:15,flexDirection:"row",alignItems:"center",gap:10},nextEye:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#9ec5df",fontFamily:"sans-serif"},nextTitle:{fontSize:16,fontWeight:"900",color:"#fff",marginTop:2,fontFamily:"sans-serif"},nextCopy:{fontSize:10,lineHeight:15,color:"#d7e5ef",marginTop:3,fontFamily:"sans-serif"},nextArrow:{fontSize:28,color:"#fff"},allClear:{backgroundColor:"#e8f6ef",borderRadius:15,padding:14},allClearTitle:{fontSize:14,fontWeight:"900",color:"#176247",fontFamily:"sans-serif"},allClearCopy:{fontSize:11,lineHeight:16,color:"#486e60",marginTop:4,fontFamily:"sans-serif"},section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{backgroundColor:"#eaf3f8",padding:14,flexDirection:"row",alignItems:"center"},sectionCode:{fontSize:10,fontWeight:"900",color:"#0b668f",fontFamily:"sans-serif"},sectionTitle:{fontSize:16,fontWeight:"900",color:"#173f5a",marginTop:2,fontFamily:"sans-serif"},sectionMeta:{fontSize:10,color:"#718493",marginTop:3,fontFamily:"sans-serif"},chev:{fontSize:17,color:"#718493"},sectionConfirm:{alignSelf:"flex-end",margin:9,borderWidth:1,borderColor:"#9fc3d7",borderRadius:9,paddingHorizontal:10,paddingVertical:8},sectionConfirmText:{fontSize:10,fontWeight:"900",color:"#0b668f",fontFamily:"sans-serif"},item:{padding:13,borderTopWidth:1,borderTopColor:"#edf1f4",gap:9},attention:{backgroundColor:"#fffdf7"},itemTop:{flexDirection:"row",gap:8},itemNo:{fontSize:11,fontWeight:"900",color:"#78909f",minWidth:26,fontFamily:"sans-serif"},itemDesc:{fontSize:12,lineHeight:18,fontWeight:"700",color:"#28495f",flex:1,fontFamily:"sans-serif"},measureRow:{flexDirection:"row",gap:8,flexWrap:"wrap",justifyContent:"space-between"},measure:{fontSize:10,color:"#70828f",fontFamily:"sans-serif"},warnText:{color:"#8a5b00",fontWeight:"900"},rateRow:{flexDirection:"row",gap:10,alignItems:"flex-end",backgroundColor:"#f8fbfd",borderRadius:10,padding:10},label:{fontSize:9,fontWeight:"900",letterSpacing:.6,color:"#748795",fontFamily:"sans-serif"},rateInput:{marginTop:4,borderWidth:1,borderColor:"#cbd8e0",backgroundColor:"#fff",borderRadius:8,paddingHorizontal:10,paddingVertical:9,fontSize:12,color:"#173f5a",minWidth:110,fontFamily:"sans-serif"},workingAmount:{fontSize:13,fontWeight:"900",color:"#173f5a",marginTop:5,fontFamily:"sans-serif"},rateSource:{fontSize:9,color:"#7e8e99",marginTop:2,fontFamily:"sans-serif"},warning:{backgroundColor:"#fff4ce",borderRadius:9,padding:10,gap:3},warningTitle:{fontSize:10,fontWeight:"900",color:"#8a5b00",fontFamily:"sans-serif"},warningCopy:{fontSize:10,lineHeight:15,color:"#775c18",fontFamily:"sans-serif"},tags:{backgroundColor:"#f7fafc",borderRadius:9,padding:9,gap:4},tag:{fontSize:10,color:"#536d7f",fontFamily:"sans-serif"},actions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between"},confidence:{fontSize:9,fontWeight:"900",textTransform:"uppercase",color:"#986b17",backgroundColor:"#fff0c9",borderRadius:999,paddingHorizontal:8,paddingVertical:5,fontFamily:"sans-serif"},confidenceHigh:{color:"#176247",backgroundColor:"#e4f5ed"},confirmed:{fontSize:10,fontWeight:"900",color:"#176247",fontFamily:"sans-serif"},reviewButton:{backgroundColor:"#0b668f",borderRadius:8,paddingHorizontal:10,paddingVertical:8},reviewButtonText:{fontSize:10,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},drill:{fontSize:10,fontWeight:"900",color:"#0b668f",fontFamily:"sans-serif"},drillBox:{backgroundColor:"#f7fbfd",borderRadius:10,padding:11,gap:5},warningList:{backgroundColor:"#fff9e8",borderRadius:15,padding:14,gap:6},modalBack:{flex:1,backgroundColor:"rgba(4,24,38,.48)",justifyContent:"flex-end"},modal:{maxHeight:"92%",backgroundColor:"#f7f9fb",borderTopLeftRadius:22,borderTopRightRadius:22,overflow:"hidden"},modalHead:{backgroundColor:"#082945",padding:17,flexDirection:"row",gap:10},modalTitle:{fontSize:16,fontWeight:"900",color:"#fff",marginTop:4,fontFamily:"sans-serif"},close:{fontSize:28,color:"#fff"},modalBody:{padding:16,paddingBottom:36,gap:11},group:{fontSize:10,fontWeight:"900",letterSpacing:.8,color:"#647b8b",fontFamily:"sans-serif"},chips:{flexDirection:"row",flexWrap:"wrap",gap:7},chip:{borderWidth:1,borderColor:"#cfdae2",backgroundColor:"#fff",borderRadius:999,paddingHorizontal:10,paddingVertical:9},chipActive:{borderColor:"#0b668f",backgroundColor:"#0b668f"},chipText:{fontSize:10,color:"#536d7f",fontWeight:"700",fontFamily:"sans-serif"},chipTextActive:{color:"#fff"},reason:{backgroundColor:"#edf4f8",borderRadius:11,padding:11,gap:4},reasonText:{fontSize:11,lineHeight:16,color:"#5d7485",fontFamily:"sans-serif"}
});
