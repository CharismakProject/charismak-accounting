import { useMemo, useState } from "react";
import { Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useLocalSearchParams, useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { parseBoqLocally, type LocalBoqItem, type LocalBoqParseResult, type LocalBoqSection } from "../lib/boq-local-parser";
import { saveEstimateReviewSession } from "../lib/estimate-review-session";
import { buildBoqWorkingSummary } from "../lib/boq-working-summary";
import { extractPreliminaryPricingFromWorkbook } from "../lib/preliminaries-workbook";
import type { MobileEstimateDecision, MobilePreliminaryPricing, MobileWorkingRateSource } from "../lib/estimate-types";
import { loadWorkspace } from "../lib/workspace";

const MAX=12*1024*1024;
const money=(value:number|null|undefined)=>value==null?"—":`₦${Math.round(value).toLocaleString("en-NG")}`;
const qty=(value:number)=>value.toLocaleString("en-NG",{maximumFractionDigits:3});
const seedDecision=(item:LocalBoqItem):MobileEstimateDecision=>({costCode:item.reviewSuggestion?.costCode??"",recipeFamily:item.reviewSuggestion?.recipeFamily??"needs_review",supplyResponsibility:item.reviewSuggestion?.supplyResponsibility??"unknown",confirmed:false,edited:false});

export default function UploadBoq(){
  const router=useRouter();
  const {projectId,projectName}=useLocalSearchParams<{projectId?:string;projectName?:string}>();
  const [file,setFile]=useState<DocumentPicker.DocumentPickerAsset|null>(null);
  const [busy,setBusy]=useState(false);
  const [continuing,setContinuing]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<LocalBoqParseResult|null>(null);
  const [open,setOpen]=useState<Record<string,boolean>>({});
  const [showAll,setShowAll]=useState(false);
  const [rates,setRates]=useState<Record<string,string>>({});
  const [rateSources,setRateSources]=useState<Record<string,MobileWorkingRateSource>>({});
  const [preliminariesPricing,setPreliminariesPricing]=useState<Record<string,MobilePreliminaryPricing>>({});

  async function choose(){
    const picked=await DocumentPicker.getDocumentAsync({multiple:false,copyToCacheDirectory:true,type:["text/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]});
    if(picked.canceled)return;
    setFile(picked.assets[0]);setResult(null);setMessage("");setOpen({});setShowAll(false);setRates({});setRateSources({});setPreliminariesPricing({});
  }

  async function parse(){
    if(!file||busy)return;
    if((file.size||0)>MAX){Alert.alert("BOQ too large","This mobile preview accepts files up to 12 MB.");return;}
    setBusy(true);setResult(null);setMessage("Reading the source workbook on this phone…");
    try{
      const response=await fetch(file.uri);const buffer=await response.arrayBuffer();
      if(buffer.byteLength>MAX)throw new Error("This BOQ is over the 12 MB preview limit.");
      const parsed=parseBoqLocally(buffer,file.name);
      if(parsed.error&&!parsed.boq)throw new Error(parsed.error);
      if(!parsed.boq)throw new Error("No primary BOQ items were found in this workbook.");
      const items=parsed.boq.sections.flatMap(section=>section.items);
      const importedRates=Object.fromEntries(items.map(item=>[item.id,item.rate==null?"":String(item.rate)]));
      const importedSources=Object.fromEntries(items.map(item=>[item.id,item.rate==null?"manual":"imported"])) as Record<string,MobileWorkingRateSource>;
      const preliminary=extractPreliminaryPricingFromWorkbook(buffer,parsed.boq);
      setResult(parsed);setRates(importedRates);setRateSources(importedSources);setPreliminariesPricing(preliminary);
      const prelimCount=Object.keys(preliminary).length;
      setMessage(`Source BOQ preserved: ${parsed.boq.sections.length} section${parsed.boq.sections.length===1?"":"s"}, ${parsed.itemCount} primary item${parsed.itemCount===1?"":"s"}${prelimCount?`, including ${prelimCount} preliminary planning item${prelimCount===1?"":"s"}`:""}.`);
    }catch(error){Alert.alert("Could not read BOQ",error instanceof Error?error.message:"Please try another workbook.");setMessage("");}
    finally{setBusy(false);}
  }

  const working=useMemo(()=>result?.boq?buildBoqWorkingSummary({boq:result.boq,rates,rateSources,preliminariesPricing}):null,[result,rates,rateSources,preliminariesPricing]);
  const exceptionIds=useMemo(()=>new Set((working?.lines??[]).filter(line=>line.amount==null||line.sourceArithmeticMismatch||(line.kind==="preliminary"&&Math.abs(line.preliminary?.componentDifference??0)>.05)).map(line=>line.itemId)),[working]);
  const visibleWarnings=useMemo(()=>{
    if(!result?.boq)return [];
    const prefixes=result.boq.sections.flatMap(section=>section.items).filter(item=>Boolean(preliminariesPricing[item.id])).map(item=>item.description.slice(0,60).toLowerCase());
    return result.warnings.filter(warning=>{
      const message=warning.message.toLowerCase();
      const genericQuantityNote=/no numeric quantity.*quantity 1 is shown for review/.test(message);
      return !genericQuantityNote||!prefixes.some(prefix=>prefix.length>8&&message.includes(prefix));
    });
  },[result,preliminariesPricing]);

  function changeRate(id:string,value:string){setRates(current=>({...current,[id]:value}));setRateSources(current=>({...current,[id]:"manual"}));}

  async function continueWithBoq(){
    if(!result?.boq||continuing)return;
    setContinuing(true);
    try{
      const workspace=await loadWorkspace();
      const decisions=Object.fromEntries(result.boq.sections.flatMap(section=>section.items).map(item=>[item.id,seedDecision(item)]));
      await saveEstimateReviewSession({schemaVersion:1,savedAt:new Date().toISOString(),companyName:workspace.companyName,projectId:projectId||undefined,projectName:projectName||undefined,boq:result.boq,decisions,rates,rateSources,preliminariesPricing});
      if(projectId)router.replace({pathname:"/project-boq-summary",params:{projectId}});else router.replace("/estimate-summary");
    }catch(error){Alert.alert("Could not save BOQ review",error instanceof Error?error.message:"Please try again.");}
    finally{setContinuing(false);}
  }

  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.page} keyboardShouldPersistTaps="handled">
    <View style={s.hero}><Pressable onPress={()=>router.back()}><Text style={s.back}>← {projectId?"Project":"Estimate"}</Text></Pressable><Text style={s.eye}>UPLOAD BOQ</Text><Text style={s.title}>Keep the bill. Check real exceptions.</Text><Text style={s.sub}>Measured work stays Quantity × Rate. Preliminaries keep Fixed Charge and Time-Related Charge separately. Materials and procurement remain later layers.</Text></View>
    <Pressable style={s.drop} onPress={choose}><Text style={s.plus}>＋</Text><Text style={s.dropTitle}>{file?file.name:"Choose Excel BOQ"}</Text><Text style={s.dropCopy}>XLSX · XLS · CSV · up to 12 MB</Text></Pressable>
    <Pressable disabled={!file||busy} onPress={parse} style={[s.primary,(!file||busy)&&s.disabled]}><Text style={s.primaryText}>{busy?"Reading BOQ…":"Read BOQ"}</Text></Pressable>
    {!!message&&<View style={s.message}><Text style={s.messageText}>{message}</Text></View>}

    {result?.boq&&working&&<>
      <View style={s.summary}><Text style={s.summaryEye}>WORKING BOQ</Text><Text style={s.summaryTitle}>{result.boq.name}</Text><View style={s.metrics}><Metric label="Sections" value={String(result.boq.sections.length)}/><Metric label="Items" value={String(working.lines.length)}/><Metric label="Preliminaries" value={String(working.preliminaryItems)}/><Metric label="Exceptions" value={String(exceptionIds.size)} warn={exceptionIds.size>0}/></View><View style={s.totalRow}><View style={{flex:1}}><Text style={s.totalLabel}>PRICED / PLANNING TOTAL</Text><Text style={s.totalValue}>{money(working.pricedTotal)}</Text></View><View style={{flex:1,alignItems:"flex-end"}}><Text style={s.totalLabel}>WORKING TOTAL</Text><Text style={s.totalValue}>{money(working.workingTotal)}</Text></View></View>{working.derivedPreliminaryTotals>0&&<Text style={s.derivedNote}>{working.derivedPreliminaryTotals} preliminary total{working.derivedPreliminaryTotals===1?" is":"s are"} calculated from Fixed + Time-Related charges for planning only.</Text>}</View>

      <View style={s.rule}><Text style={s.ruleTitle}>Nothing here blocks import.</Text><Text style={s.ruleCopy}>{working.unpricedItems?`${working.unpricedItems} genuinely unpriced item${working.unpricedItems===1?" is":"s are"} retained. `:""}{working.arithmeticMismatchItems?`${working.arithmeticMismatchItems} measured-work arithmetic mismatch${working.arithmeticMismatchItems===1?" is":"es are"} flagged. `:""}A preliminary item with only Fixed or only Time-Related cost is valid and is not treated as missing.</Text></View>

      <Pressable disabled={continuing} onPress={continueWithBoq} style={[s.continue,continuing&&s.disabled]}><View style={{flex:1}}><Text style={s.continueEye}>CONTINUE</Text><Text style={s.continueTitle}>{projectId?"Keep this BOQ with the project review":"Continue with this BOQ"}</Text><Text style={s.continueCopy}>This does not create a Money transaction, purchase order or final contract value.</Text></View><Text style={s.arrow}>{continuing?"…":"›"}</Text></Pressable>

      <View style={s.reviewHead}><View style={{flex:1}}><Text style={s.reviewTitle}>Review only when needed</Text><Text style={s.reviewCopy}>{exceptionIds.size?`${exceptionIds.size} item${exceptionIds.size===1?" needs":"s need"} attention.`:"No pricing/arithmetic exceptions detected."}</Text></View><Pressable onPress={()=>setShowAll(v=>!v)} style={s.outline}><Text style={s.outlineText}>{showAll?"Exceptions only":"Show all items"}</Text></Pressable></View>

      {result.boq.sections.map(section=><SectionBlock key={section.id} section={section} isOpen={Boolean(open[section.id])} showAll={showAll} exceptionIds={exceptionIds} rates={rates} preliminariesPricing={preliminariesPricing} onToggle={()=>setOpen(current=>({...current,[section.id]:!current[section.id]}))} onRateChange={changeRate}/>) }

      {!!visibleWarnings.length&&<View style={s.notes}><Text style={s.notesTitle}>{visibleWarnings.length} parser note{visibleWarnings.length===1?"":"s"}</Text><Text style={s.notesCopy}>Only meaningful source/parser notes are shown here. Recognised preliminary items are not warned merely because they have no measured quantity.</Text>{visibleWarnings.slice(0,12).map((warning,index)=><Text key={`${warning.sheet}-${warning.row}-${index}`} style={s.noteLine}>{warning.sheet}{warning.row?` row ${warning.row}`:""}: {warning.message}</Text>)}</View>}
    </>}
  </ScrollView></SafeAreaView>;
}

function SectionBlock({section,isOpen,showAll,exceptionIds,rates,preliminariesPricing,onToggle,onRateChange}:{section:LocalBoqSection;isOpen:boolean;showAll:boolean;exceptionIds:Set<string>;rates:Record<string,string>;preliminariesPricing:Record<string,MobilePreliminaryPricing>;onToggle:()=>void;onRateChange:(id:string,value:string)=>void}){
  const exceptions=section.items.filter(item=>exceptionIds.has(item.id));
  const visible=showAll?section.items:exceptions;
  return <View style={s.section}>
    <Pressable style={s.sectionHead} onPress={onToggle}><View style={{flex:1}}><Text style={s.sectionCode}>{section.code||"SECTION"}</Text><Text style={s.sectionTitle}>{section.title}</Text><Text style={s.sectionMeta}>{section.items.length} item{section.items.length===1?"":"s"}{exceptions.length?` · ${exceptions.length} exception${exceptions.length===1?"":"s"}`:" · clear"}</Text></View><Text style={s.chev}>{isOpen?"⌃":"⌄"}</Text></Pressable>
    {isOpen&&visible.length===0&&<View style={s.clearBox}><Text style={s.clearText}>No pricing or arithmetic exception in this section.</Text></View>}
    {isOpen&&visible.map(item=><ItemRow key={item.id} item={item} rateText={rates[item.id]??""} preliminary={preliminariesPricing[item.id]} onRateChange={value=>onRateChange(item.id,value)}/>)}
  </View>;
}

function ItemRow({item,rateText,preliminary,onRateChange}:{item:LocalBoqItem;rateText:string;preliminary?:MobilePreliminaryPricing;onRateChange:(value:string)=>void}){
  if(preliminary){
    const diff=Math.abs(preliminary.componentDifference??0)>.05;
    return <View style={s.item}><View style={s.itemTop}><Text style={s.itemNo}>{item.itemNo||"—"}</Text><Text style={s.itemDesc}>{item.description}</Text></View><Text style={s.prelimBadge}>PRELIMINARY · {preliminary.behaviour.replaceAll("_"," ").toUpperCase()}</Text><View style={s.prelimGrid}><MoneyFact label="Fixed charge" value={preliminary.fixedCharge}/><MoneyFact label="Time-related" value={preliminary.timeRelatedCharge}/><MoneyFact label={preliminary.planningTotalSource==="source"?"Source total":"Planning total"} value={preliminary.planningTotal}/></View>{preliminary.planningTotalSource==="derived"&&<Text style={s.info}>Planning total = Fixed + Time-Related. The two source components remain separate.</Text>}{preliminary.planningTotal==null&&<Text style={s.warning}>No fixed, time-related or source total charge is entered for this preliminary item.</Text>}{diff&&<Text style={s.warning}>Source Total Charges differs from Fixed + Time-Related by {money(preliminary.componentDifference)}. Source values are preserved for review.</Text>}</View>;
  }
  const cleaned=rateText.replace(/[,₦$€£\s]/g,"");const rate=cleaned?Number(cleaned):null;const amount=rate!=null&&Number.isFinite(rate)?item.quantity*rate:null;const mismatch=item.rate!=null&&item.amount!=null&&Math.abs(item.quantity*item.rate-item.amount)>.05;
  return <View style={s.item}><View style={s.itemTop}><Text style={s.itemNo}>{item.itemNo||"—"}</Text><Text style={s.itemDesc}>{item.description}</Text></View><View style={s.itemFacts}><Text style={s.fact}>{qty(item.quantity)} {item.unit}</Text><Text style={s.fact}>Source rate {money(item.rate)}</Text><Text style={[s.fact,mismatch&&s.warnText]}>Source amount {money(item.amount)}</Text></View><View style={s.rateBox}><View style={{flex:1}}><Text style={s.label}>WORKING RATE</Text><TextInput value={rateText} onChangeText={onRateChange} keyboardType="decimal-pad" placeholder="Leave blank if genuinely unpriced" style={s.rateInput}/></View><View style={s.working}><Text style={s.label}>WORKING AMOUNT</Text><Text style={s.workingValue}>{money(amount)}</Text></View></View>{mismatch&&<Text style={s.warning}>Source amount does not equal Quantity × source Rate. The source values remain preserved.</Text>}</View>;
}

function MoneyFact({label,value}:{label:string;value:number|null}){return <View style={s.moneyFact}><Text style={s.label}>{label.toUpperCase()}</Text><Text style={s.moneyFactValue}>{money(value)}</Text></View>}
function Metric({label,value,warn}:{label:string;value:string;warn?:boolean}){return <View style={s.metric}><Text style={s.metricLabel}>{label}</Text><Text style={[s.metricValue,warn&&s.metricWarn]}>{value}</Text></View>}

const s=StyleSheet.create({safe:{flex:1,backgroundColor:"#f3f7fa"},page:{padding:16,paddingBottom:70,gap:13},hero:{backgroundColor:"#082945",borderRadius:21,padding:19,gap:7},back:{fontSize:13,fontWeight:"800",color:"#b9d4e5",fontFamily:"sans-serif"},eye:{fontSize:11,fontWeight:"900",letterSpacing:1.2,color:"#9ec5df",fontFamily:"sans-serif"},title:{fontSize:26,fontWeight:"900",color:"#fff",fontFamily:"sans-serif"},sub:{fontSize:14,lineHeight:21,color:"#d7e5ef",fontFamily:"sans-serif"},drop:{minHeight:150,borderWidth:1.5,borderStyle:"dashed",borderColor:"#9db8ca",borderRadius:19,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",padding:18},plus:{fontSize:36,color:"#0b668f",fontFamily:"sans-serif"},dropTitle:{fontSize:17,fontWeight:"900",color:"#173f5a",marginTop:4,textAlign:"center",fontFamily:"sans-serif"},dropCopy:{fontSize:13,color:"#788b99",marginTop:5,fontFamily:"sans-serif"},primary:{height:54,backgroundColor:"#0b668f",borderRadius:14,alignItems:"center",justifyContent:"center"},primaryText:{color:"#fff",fontWeight:"900",fontSize:15,fontFamily:"sans-serif"},disabled:{opacity:.45},message:{backgroundColor:"#edf8f3",borderRadius:13,padding:13},messageText:{fontSize:13,lineHeight:19,color:"#176247",fontWeight:"700",fontFamily:"sans-serif"},summary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:18,padding:15,gap:10},summaryEye:{fontSize:11,fontWeight:"900",letterSpacing:1,color:"#16825c",fontFamily:"sans-serif"},summaryTitle:{fontSize:20,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},metrics:{flexDirection:"row",flexWrap:"wrap",gap:8},metric:{minWidth:"22%",flexGrow:1,backgroundColor:"#f5f8fa",borderRadius:11,padding:10},metricLabel:{fontSize:11,color:"#738693",fontFamily:"sans-serif"},metricValue:{fontSize:19,fontWeight:"900",color:"#173f5a",marginTop:3,fontFamily:"sans-serif"},metricWarn:{color:"#9a6200"},totalRow:{borderTopWidth:1,borderTopColor:"#e6ecef",paddingTop:11,flexDirection:"row",justifyContent:"space-between",gap:12},totalLabel:{fontSize:10,fontWeight:"900",letterSpacing:.6,color:"#7b8d99",fontFamily:"sans-serif"},totalValue:{fontSize:18,fontWeight:"900",color:"#0a4f76",marginTop:3,fontFamily:"sans-serif"},derivedNote:{fontSize:12,lineHeight:18,color:"#6d7f8b",fontFamily:"sans-serif"},rule:{backgroundColor:"#fff8e8",borderRadius:15,padding:14,borderWidth:1,borderColor:"#ecd9a7"},ruleTitle:{fontSize:15,fontWeight:"900",color:"#59471d",fontFamily:"sans-serif"},ruleCopy:{fontSize:13,lineHeight:20,color:"#74694f",marginTop:4,fontFamily:"sans-serif"},continue:{backgroundColor:"#073f65",borderRadius:17,padding:15,flexDirection:"row",alignItems:"center",gap:10},continueEye:{fontSize:10,fontWeight:"900",letterSpacing:1,color:"#9ec5df",fontFamily:"sans-serif"},continueTitle:{fontSize:17,fontWeight:"900",color:"#fff",marginTop:2,fontFamily:"sans-serif"},continueCopy:{fontSize:12,lineHeight:18,color:"#d2e1ea",marginTop:3,fontFamily:"sans-serif"},arrow:{fontSize:30,color:"#fff",fontFamily:"sans-serif"},reviewHead:{flexDirection:"row",alignItems:"center",gap:10},reviewTitle:{fontSize:19,fontWeight:"900",color:"#173f5a",fontFamily:"sans-serif"},reviewCopy:{fontSize:13,lineHeight:19,color:"#718491",marginTop:3,fontFamily:"sans-serif"},outline:{borderWidth:1,borderColor:"#a9bfcc",backgroundColor:"#fff",borderRadius:11,paddingHorizontal:11,paddingVertical:9},outlineText:{fontSize:12,fontWeight:"900",color:"#0b5f91",fontFamily:"sans-serif"},section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{backgroundColor:"#eaf3f8",padding:14,flexDirection:"row",alignItems:"center"},sectionCode:{fontSize:11,fontWeight:"900",color:"#0b668f",fontFamily:"sans-serif"},sectionTitle:{fontSize:17,fontWeight:"900",color:"#173f5a",marginTop:2,fontFamily:"sans-serif"},sectionMeta:{fontSize:12,color:"#718493",marginTop:4,fontFamily:"sans-serif"},chev:{fontSize:18,color:"#718493",fontFamily:"sans-serif"},clearBox:{padding:14},clearText:{fontSize:13,color:"#607a6d",fontFamily:"sans-serif"},item:{padding:14,borderTopWidth:1,borderTopColor:"#edf1f4",gap:10},itemTop:{flexDirection:"row",gap:9},itemNo:{fontSize:12,fontWeight:"900",color:"#78909f",minWidth:30,fontFamily:"sans-serif"},itemDesc:{fontSize:14,lineHeight:20,fontWeight:"700",color:"#28495f",flex:1,fontFamily:"sans-serif"},itemFacts:{flexDirection:"row",gap:9,flexWrap:"wrap",justifyContent:"space-between"},fact:{fontSize:12,color:"#70828f",fontFamily:"sans-serif"},warnText:{color:"#8a5b00",fontWeight:"900"},rateBox:{flexDirection:"row",gap:12,alignItems:"flex-end",backgroundColor:"#f8fbfd",borderRadius:11,padding:10},label:{fontSize:10,fontWeight:"900",letterSpacing:.5,color:"#748795",fontFamily:"sans-serif"},rateInput:{marginTop:5,borderWidth:1,borderColor:"#cbd8e0",backgroundColor:"#fff",borderRadius:9,paddingHorizontal:10,paddingVertical:10,fontSize:15,color:"#173f5a",fontFamily:"sans-serif"},working:{alignItems:"flex-end",maxWidth:"38%"},workingValue:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:7,fontFamily:"sans-serif"},warning:{fontSize:12,lineHeight:18,color:"#775c18",backgroundColor:"#fff4ce",borderRadius:9,padding:9,fontFamily:"sans-serif"},info:{fontSize:12,lineHeight:18,color:"#456678",backgroundColor:"#eef6fa",borderRadius:9,padding:9,fontFamily:"sans-serif"},prelimBadge:{alignSelf:"flex-start",fontSize:10,fontWeight:"900",letterSpacing:.7,color:"#6a4f0f",backgroundColor:"#fff0bf",paddingHorizontal:8,paddingVertical:5,borderRadius:999,fontFamily:"sans-serif"},prelimGrid:{flexDirection:"row",gap:8,flexWrap:"wrap"},moneyFact:{minWidth:"30%",flexGrow:1,backgroundColor:"#f7f9fb",borderRadius:10,padding:10},moneyFactValue:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:4,fontFamily:"sans-serif"},notes:{backgroundColor:"#f8f5ed",borderRadius:15,padding:14,gap:7},notesTitle:{fontSize:15,fontWeight:"900",color:"#5d533a",fontFamily:"sans-serif"},notesCopy:{fontSize:12,lineHeight:18,color:"#746b57",fontFamily:"sans-serif"},noteLine:{fontSize:12,lineHeight:18,color:"#665d49",fontFamily:"sans-serif"}});