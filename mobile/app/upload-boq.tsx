import { useMemo, useState } from "react";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../lib/supabase";
import { loadWorkspace } from "../lib/workspace";
import { calculateMobileMaterials, summarizeMobileMaterials, type MobileMaterialDecision } from "../lib/material-recipe-engine";
import { saveEstimateReviewSession } from "../lib/estimate-review-session";

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
const parseRate=(value:string)=>{const cleaned=value.replace(/[,₦$€£\s]/g,"");if(!cleaned.trim())return null;const n=Number(cleaned);return Number.isFinite(n)&&n>=0?n:null;};
const COST_CODES:[[string,string],...[string,string][]]=[["01","Preliminaries"],["02","Substructure"],["03","Concrete & Reinforcement"],["04","Blockwork & Masonry"],["05","Structural Steel"],["06","Roofing"],["07","Doors"],["08","Windows & Glazing"],["09","Plastering & Screeding"],["10","Floor Finishes"],["11","Wall Finishes"],["12","Ceilings"],["13","Painting & Decoration"],["14","Joinery & Fixtures"],["15","Plumbing & Sanitary"],["16","Electrical"],["17","Mechanical & HVAC"],["18","External Works"],["19","Plant, Equipment & Specialist Works"],["20","Professional, Statutory & Other"]];
const RECIPES:[[string,string],...[string,string][]]=[["blockwork_225","225mm blockwork"],["blockwork_150","150mm blockwork"],["blockwork","Blockwork"],["concrete","Concrete"],["reinforcement","Reinforcement"],["formwork","Formwork"],["plastering","Plastering"],["screeding","Screeding"],["floor_tiling","Floor tiling"],["wall_tiling","Wall finish"],["painting","Painting"],["roofing","Roofing"],["ceiling","Ceiling"],["plumbing_installation","Plumbing installation"],["electrical_installation","Electrical installation"],["direct_supply","Direct supply item"],["external_works","External works"],["not_applicable","No material recipe"],["needs_review","Needs recipe review"]];
const SUPPLIES:[[Supply,string],...[Supply,string][]]=[["contractor","Contractor"],["client","Client supplied"],["specialist","Specialist / nominated"],["labour_only","Labour / installation only"],["unknown","Needs review"]];
const CALCULABLE=new Set(["blockwork_225","blockwork_150","blockwork","plastering","screeding","floor_tiling","wall_tiling","reinforcement","direct_supply","not_applicable"]);
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
  const [rates,setRates]=useState<Record<string,string>>({});
  const [editing,setEditing]=useState<BoqItem|null>(null);
  const [materialsReady,setMaterialsReady]=useState(false);
  const [selectedMaterial,setSelectedMaterial]=useState<string|null>(null);
  const [continuing,setContinuing]=useState(false);

  async function choose(){
    const r=await DocumentPicker.getDocumentAsync({multiple:false,copyToCacheDirectory:true,type:["text/csv","application/vnd.ms-excel","application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"]});
    if(!r.canceled){setFile(r.assets[0]);setResult(null);setMessage("");setDecisions({});setRates({});setMaterialsReady(false);setSelectedMaterial(null);}
  }

  async function parse(){
    if(!file||busy)return;
    if((file.size||0)>MAX){Alert.alert("BOQ too large","This preview accepts files up to 12 MB.");return;}
    setBusy(true);setResult(null);setMaterialsReady(false);setSelectedMaterial(null);setMessage("Reading workbook…");
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
      setRates(Object.fromEntries((parsed.boq?.sections??[]).flatMap(section=>section.items.map(item=>[item.id,item.rate==null?"":String(item.rate)]))));
      setMessage(`${parsed.itemCount??0} BOQ item${parsed.itemCount===1?"":"s"} detected. Confirm meaning and rates, then calculate materials from the reviewed quantities.`);
    }catch(e){Alert.alert("Could not read BOQ",e instanceof Error?e.message:"Please try another workbook.");setMessage("");}
    finally{if(path)await supabase.storage.from("universal-intake").remove([path]).catch(()=>undefined);setBusy(false);}
  }

  function invalidateMaterials(){setMaterialsReady(false);setSelectedMaterial(null);}
  function confirmSection(section:BoqSection){invalidateMaterials();setDecisions(current=>{const next={...current};for(const item of section.items){const d=next[item.id];if(d&&complete(d))next[item.id]={...d,confirmed:true};}return next;});}
  function confirmAll(){invalidateMaterials();setDecisions(current=>Object.fromEntries(Object.entries(current).map(([id,d])=>[id,complete(d)?{...d,confirmed:true}:d])));}
  function updateEditing(patch:Partial<Decision>){if(!editing)return;invalidateMaterials();setDecisions(current=>({...current,[editing.id]:{...(current[editing.id]??startDecision(editing)),...patch,edited:true,confirmed:false}}));}
  function saveEditing(){if(!editing)return;const d=decisions[editing.id];if(d&&complete(d)){invalidateMaterials();setDecisions(current=>({...current,[editing.id]:{...current[editing.id],confirmed:true}}));setEditing(null);}else Alert.alert("Still needs review","Choose a cost group, a usable recipe state and supply responsibility before confirming this item.");}

  const allItems=result?.boq?.sections.flatMap(section=>section.items)??[];
  const total=Object.keys(decisions).length;
  const confirmed=Object.values(decisions).filter(d=>d.confirmed).length;
  const unresolved=Object.values(decisions).filter(d=>!complete(d)).length;
  const unpriced=allItems.filter(item=>parseRate(rates[item.id]??"")===null).length;
  const workingTotal=allItems.reduce((sum,item)=>{const rate=parseRate(rates[item.id]??"");return sum+(rate===null?0:item.quantity*rate);},0);
  const mobileDecisions=useMemo<Record<string,MobileMaterialDecision>>(()=>Object.fromEntries(Object.entries(decisions).map(([id,d])=>[id,{recipeFamily:d.recipeFamily,supplyResponsibility:d.supplyResponsibility,confirmed:d.confirmed}])),[decisions]);
  const materialSummary=useMemo(()=>materialsReady?summarizeMobileMaterials(allItems,mobileDecisions):[],[materialsReady,allItems,mobileDecisions]);
  const calculableConfirmed=allItems.filter(item=>{const d=decisions[item.id];return d?.confirmed&&CALCULABLE.has(d.recipeFamily);}).length;

  function calculateMaterials(){
    if(!confirmed){Alert.alert("Confirm BOQ items first","Confirm at least one reviewed BOQ item before calculating materials.");return;}
    setMaterialsReady(true);setSelectedMaterial(null);
  }

  function itemMaterials(item:BoqItem){
    if(!materialsReady)return null;
    return calculateMobileMaterials(item,mobileDecisions[item.id]??{recipeFamily:"needs_review",supplyResponsibility:"unknown",confirmed:false});
  }

  async function continueToSummary(){
    if(!result?.boq||!materialsReady||continuing)return;
    setContinuing(true);
    try{
      const workspace=await loadWorkspace();
      await saveEstimateReviewSession({schemaVersion:1,savedAt:new Date().toISOString(),companyName:workspace.companyName,boq:result.boq,decisions,rates});
      router.push("/estimate-summary");
    }catch(e){Alert.alert("Could not prepare estimate summary",e instanceof Error?e.message:"Please try again.");}
    finally{setContinuing(false);}
  }

  return <SafeAreaView style={s.safe} edges={["top"]}><ScrollView contentContainerStyle={s.page}>
    <View style={s.top}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Estimate</Text></Pressable><Text style={s.eyebrow}>CHARISMAK APP · UPLOAD BOQ</Text><Text style={s.title}>Upload the BOQ you already use</Text><Text style={s.sub}>Charismak preserves your BOQ sections, reviews meaning and rates, then calculates traceable materials from confirmed quantities.</Text></View>
    <Pressable style={s.drop} onPress={choose}><Text style={s.plus}>＋</Text><Text style={s.dropTitle}>{file?file.name:"Choose Excel BOQ"}</Text><Text style={s.dropCopy}>XLSX · XLS · CSV · up to 12 MB</Text></Pressable>
    <Text style={s.examples}>Examples: S/N · Description · Qty · Unit · Rate · Amount; or Item No · Particulars · UOM · Quantity · Unit Price · Total Amount.</Text>
    <Pressable disabled={!file||busy} onPress={parse} style={[s.button,(!file||busy)&&{opacity:.45}]}><Text style={s.buttonText}>{busy?"Reading BOQ…":"Read BOQ"}</Text></Pressable>
    {!!message&&<View style={s.message}><Text style={s.messageText}>{message}</Text></View>}

    {result?.boq&&<>
      <View style={s.summary}><Text style={s.summaryEye}>BOQ REVIEW INTELLIGENCE</Text><Text style={s.summaryTitle}>{result.boq.name}</Text><Text style={s.summaryText}>{result.boq.sections.length} sections · {result.itemCount??0} items · {result.reviewSummary?.clearItems??0} clear suggestions · {result.reviewSummary?.attentionItems??0} need attention</Text><Text style={s.summaryNote}>{confirmed}/{total} confirmed · {unresolved} still need a decision. Suggestions do not post to Accounting.</Text><Pressable onPress={confirmAll} style={s.smallPrimary}><Text style={s.smallPrimaryText}>Confirm all ready suggestions</Text></Pressable></View>
      <View style={s.rateSummary}><View style={{flex:1}}><Text style={s.rateEye}>RATE ENGINE V1</Text><Text style={s.rateTitle}>Working direct total</Text><Text style={s.rateNote}>Imported rates stay selected until you change them. Unpriced items remain unpriced.</Text></View><View style={{alignItems:"flex-end"}}><Text style={s.rateTotal}>{money(workingTotal)}</Text><Text style={[s.rateCount,unpriced?{color:"#8b6512"}:{color:"#176247"}]}>{unpriced?`${unpriced} unpriced`:"All items priced"}</Text></View></View>

      <View style={s.materialSummaryCard}>
        <View style={{flex:1}}><Text style={s.materialSummaryEye}>BOQ → MATERIALS V1</Text><Text style={s.materialSummaryTitle}>Traceable material schedule</Text><Text style={s.materialSummaryNote}>{confirmed}/{total} items confirmed · {calculableConfirmed} confirmed items have V1-calculable recipes. Specification-dependent items stay flagged instead of being guessed.</Text></View>
        <Pressable onPress={calculateMaterials} disabled={!confirmed} style={[s.materialButton,!confirmed&&{opacity:.45}]}><Text style={s.materialButtonText}>{materialsReady?"Recalculate materials":"Calculate materials"}</Text></Pressable>
      </View>

      {materialsReady&&<View style={s.materialListCard}>
        <Text style={s.materialSummaryEye}>MATERIAL SUMMARY</Text><Text style={s.materialListTitle}>Tap a material total to see its BOQ sources</Text>
        {materialSummary.length?materialSummary.map(row=>{const openMaterial=selectedMaterial===row.key;return <View key={row.key} style={s.materialSummaryRow}>
          <Pressable onPress={()=>setSelectedMaterial(openMaterial?null:row.key)} style={s.materialSummaryPress}><View style={{flex:1}}><Text style={s.materialSummaryName}>{row.material}</Text><Text style={s.materialSummaryCount}>{row.sources.length} BOQ source item{row.sources.length===1?"":"s"}</Text></View><Text style={s.materialSummaryQty}>{qty(row.quantity)} {row.unit}</Text></Pressable>
          {openMaterial&&<View style={s.materialSources}>{row.sources.map(source=>{const section=result.boq?.sections.find(sec=>sec.items.some(i=>i.id===source.itemId));return <View key={`${row.key}-${source.itemId}`} style={s.materialSourceRow}><Text style={s.materialSourceText}><Text style={{fontWeight:"900"}}>{section?.title??"BOQ"}: </Text>{source.description}</Text><Text style={s.materialSourceQty}>{qty(source.quantity)} {row.unit}</Text></View>;})}</View>}
        </View>}):<Text style={s.materialEmpty}>No contractor material totals are available yet. Confirm a supported contractor-supplied recipe.</Text>}
      </View>}

      {materialsReady&&<View style={s.nextCard}><View style={{flex:1}}><Text style={s.nextEye}>NEXT · ESTIMATE SUMMARY</Text><Text style={s.nextTitle}>Commercial summary, PDF/Excel and Project review</Text><Text style={s.nextText}>Your reviewed BOQ, cost-code decisions and working rates will be saved locally on this device for the next screen. Unpriced or unresolved lines remain visible—they are not hidden.</Text></View><Pressable onPress={continueToSummary} disabled={continuing} style={[s.nextButton,continuing&&{opacity:.5}]}><Text style={s.nextButtonText}>{continuing?"Preparing…":"Continue"}</Text></Pressable></View>}

      {result.boq.sections.map(section=>{
        const ready=section.items.filter(item=>complete(decisions[item.id]??startDecision(item))).length;
        const done=section.items.filter(item=>decisions[item.id]?.confirmed).length;
        return <View key={section.id} style={s.section}>
          <Pressable style={s.sectionHead} onPress={()=>setOpen(v=>({...v,[section.id]:!v[section.id]}))}><View style={{flex:1}}><Text style={s.sectionCode}>{section.code??"SECTION"}</Text><Text style={s.sectionTitle}>{section.title}</Text><Text style={s.sectionMini}>{done}/{section.items.length} confirmed · {section.items.length-ready} need attention</Text></View><Text style={s.sectionCount}>{open[section.id]?"⌃":"⌄"}</Text></Pressable>
          <Pressable onPress={()=>confirmSection(section)} style={s.sectionConfirm}><Text style={s.sectionConfirmText}>Confirm {ready} ready item{ready===1?"":"s"}</Text></Pressable>
          {open[section.id]&&section.items.map(item=>{const d=decisions[item.id]??startDecision(item);const suggestion=item.reviewSuggestion;const workingRate=parseRate(rates[item.id]??"");const workingAmount=workingRate===null?null:item.quantity*workingRate;const breakdown=itemMaterials(item);return <View key={item.id} style={[s.item,!complete(d)&&s.itemAttention]}>
            <View style={s.itemTop}><Text style={s.itemNo}>{item.itemNo??"—"}</Text><Text style={s.itemDesc}>{item.description}</Text></View>
            <View style={s.itemMeta}><Text style={s.meta}>{qty(item.quantity)} {item.unit}</Text><Text style={s.meta}>Imported {money(item.rate)}</Text></View>
            <View style={s.rateRow}><View style={{flex:1}}><Text style={s.rateInputLabel}>WORKING RATE</Text><TextInput value={rates[item.id]??""} onChangeText={value=>setRates(current=>({...current,[item.id]:value}))} keyboardType="decimal-pad" placeholder="Enter rate" placeholderTextColor="#9aa8b2" style={s.rateInput}/></View><View style={{alignItems:"flex-end"}}><Text style={s.rateInputLabel}>WORKING AMOUNT</Text><Text style={s.rateAmount}>{money(workingAmount)}</Text><Text style={s.rateSource}>{item.rate!=null&&String(item.rate)===(rates[item.id]??"")?"Imported rate":"Manual working rate"}</Text></View></View>
            <View style={s.reviewLine}><Text style={s.reviewText}>{d.costCode||"?"} · {COST_CODES.find(([code])=>code===d.costCode)?.[1]??"Cost group needed"}</Text><Text style={s.reviewText}>{RECIPES.find(([value])=>value===d.recipeFamily)?.[1]??d.recipeFamily}</Text><Text style={s.reviewText}>{SUPPLIES.find(([value])=>value===d.supplyResponsibility)?.[1]??"Supply needed"}</Text></View>
            <View style={s.reviewActions}><Text style={[s.confidence,suggestion?.confidence==="high"&&s.confidenceHigh,suggestion?.confidence==="medium"&&s.confidenceMid]}>{suggestion?.confidence??"low"} confidence</Text>{d.confirmed?<Text style={s.confirmed}>Confirmed</Text>:<Pressable onPress={()=>setEditing(item)} style={s.editButton}><Text style={s.editButtonText}>{complete(d)?"Review / confirm":"Resolve"}</Text></Pressable>}</View>
            <Pressable onPress={()=>setSelected(v=>v===item.id?null:item.id)} style={s.materialToggle}><Text style={s.materialToggleText}>{selected===item.id?"Hide material drilldown":"View materials for this quantity"}</Text></Pressable>
            {selected===item.id&&<View style={s.material}><Text style={s.materialEye}>MATERIALS FOR {qty(item.quantity)} {item.unit}</Text>{!materialsReady?<Text style={s.materialText}>Confirm this item and tap Calculate materials above to generate the reviewed material breakdown.</Text>:breakdown?.status==="available"?<><Text style={s.materialRecipe}>{breakdown.recipeName}</Text>{breakdown.materials.map((m,index)=><View key={`${item.id}-${m.material}-${index}`} style={s.materialComponent}><View style={{flex:1}}><Text style={s.materialComponentName}>{m.material}</Text><Text style={s.materialComponentBase}>{qty(m.baseQuantity)} {m.unit}{m.wastePercent?` + ${m.wastePercent}% waste`:""}</Text></View><Text style={s.materialComponentTotal}>{qty(m.totalQuantity)} {m.unit}</Text></View>)}{breakdown.assumptions.length>0&&<View style={s.assumptionBox}><Text style={s.assumptionTitle}>ASSUMPTIONS</Text>{breakdown.assumptions.map(a=><Text key={a} style={s.assumptionText}>• {a}</Text>)}</View>}</>:breakdown?.status==="not_applicable"?<Text style={s.materialText}>{breakdown.assumptions[0]??"No contractor material breakdown is required for this item."}</Text>:<Text style={s.materialText}>{breakdown?.assumptions[0]??"This recipe still needs specification parameters before reliable quantities can be calculated."}</Text>}</View>}
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

const s=StyleSheet.create({
  safe:{flex:1,backgroundColor:"#f4f7fa"},page:{padding:16,paddingBottom:70,gap:12},top:{backgroundColor:"#082945",borderRadius:20,padding:19,gap:7},back:{fontSize:11,fontWeight:"800",color:"#b9d4e5"},eyebrow:{fontSize:9,fontWeight:"900",letterSpacing:1.2,color:"#9ec5df"},title:{fontSize:23,fontWeight:"900",color:"#fff"},sub:{fontSize:12,lineHeight:18,color:"#d7e5ef"},drop:{minHeight:145,borderWidth:1.5,borderStyle:"dashed",borderColor:"#9db8ca",borderRadius:18,backgroundColor:"#fff",alignItems:"center",justifyContent:"center",padding:18},plus:{fontSize:34,color:"#0b668f"},dropTitle:{fontSize:16,fontWeight:"900",color:"#173f5a",marginTop:3,textAlign:"center"},dropCopy:{fontSize:10,color:"#788b99",marginTop:4},examples:{fontSize:10,lineHeight:15,color:"#687d8c",paddingHorizontal:3},button:{backgroundColor:"#0b668f",borderRadius:13,padding:13,alignItems:"center"},buttonText:{color:"#fff",fontWeight:"900",fontSize:12},message:{backgroundColor:"#edf8f3",borderRadius:12,padding:11},messageText:{fontSize:11,color:"#176247",fontWeight:"700"},summary:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,padding:15,gap:4},summaryEye:{fontSize:9,fontWeight:"900",letterSpacing:1.1,color:"#16825c"},summaryTitle:{fontSize:17,fontWeight:"900",color:"#173f5a"},summaryText:{fontSize:10,color:"#667b8b"},summaryNote:{fontSize:10,lineHeight:15,color:"#738592",marginTop:4},smallPrimary:{alignSelf:"flex-start",marginTop:7,backgroundColor:"#0b668f",borderRadius:9,paddingVertical:8,paddingHorizontal:10},smallPrimaryText:{fontSize:9,fontWeight:"900",color:"#fff"},
  rateSummary:{backgroundColor:"#eef5f9",borderWidth:1,borderColor:"#d6e4ec",borderRadius:16,padding:14,flexDirection:"row",gap:12,alignItems:"center"},rateEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#0b668f"},rateTitle:{fontSize:15,fontWeight:"900",color:"#173f5a",marginTop:3},rateNote:{fontSize:9,lineHeight:14,color:"#687d8c",marginTop:3},rateTotal:{fontSize:17,fontWeight:"900",color:"#173f5a"},rateCount:{fontSize:8,fontWeight:"900",marginTop:3},
  materialSummaryCard:{backgroundColor:"#eef8f3",borderWidth:1,borderColor:"#d5e9df",borderRadius:16,padding:14,gap:10},materialSummaryEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#16825c"},materialSummaryTitle:{fontSize:15,fontWeight:"900",color:"#173f5a",marginTop:3},materialSummaryNote:{fontSize:9,lineHeight:14,color:"#687d8c",marginTop:3},materialButton:{alignSelf:"flex-start",backgroundColor:"#16825c",borderRadius:9,paddingHorizontal:11,paddingVertical:8},materialButtonText:{fontSize:9,fontWeight:"900",color:"#fff"},materialListCard:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,padding:14,gap:8},materialListTitle:{fontSize:13,fontWeight:"900",color:"#173f5a",marginBottom:2},materialSummaryRow:{borderWidth:1,borderColor:"#e0e8ec",borderRadius:10,overflow:"hidden"},materialSummaryPress:{padding:10,flexDirection:"row",alignItems:"center",gap:10},materialSummaryName:{fontSize:11,fontWeight:"900",color:"#28495f"},materialSummaryCount:{fontSize:8,color:"#758895",marginTop:2},materialSummaryQty:{fontSize:11,fontWeight:"900",color:"#16825c"},materialSources:{backgroundColor:"#f9fcfa",borderTopWidth:1,borderTopColor:"#e4ece8",padding:8,gap:4},materialSourceRow:{flexDirection:"row",gap:8,justifyContent:"space-between",borderTopWidth:1,borderTopColor:"#edf1ef",paddingVertical:6},materialSourceText:{fontSize:8,lineHeight:13,color:"#607687",flex:1},materialSourceQty:{fontSize:8,fontWeight:"900",color:"#0b668f"},materialEmpty:{fontSize:9,lineHeight:14,color:"#775c18",backgroundColor:"#fff8e8",borderRadius:9,padding:10},
  nextCard:{backgroundColor:"#082945",borderRadius:16,padding:14,gap:10},nextEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#9ec5df"},nextTitle:{fontSize:15,fontWeight:"900",color:"#fff",marginTop:3},nextText:{fontSize:9,lineHeight:14,color:"#d7e5ef",marginTop:3},nextButton:{alignSelf:"flex-start",backgroundColor:"#fff",borderRadius:9,paddingHorizontal:12,paddingVertical:9},nextButtonText:{fontSize:9,fontWeight:"900",color:"#0b668f"},
  section:{backgroundColor:"#fff",borderWidth:1,borderColor:"#dce6ec",borderRadius:16,overflow:"hidden"},sectionHead:{backgroundColor:"#edf4f8",padding:13,flexDirection:"row",alignItems:"center",gap:8},sectionCode:{fontSize:8,fontWeight:"900",color:"#0b668f"},sectionTitle:{fontSize:14,fontWeight:"900",color:"#173f5a",marginTop:2},sectionMini:{fontSize:8,color:"#6f8290",marginTop:3},sectionCount:{fontSize:14,color:"#6f8290"},sectionConfirm:{margin:9,alignSelf:"flex-end",borderWidth:1,borderColor:"#9fc3d7",borderRadius:9,paddingHorizontal:9,paddingVertical:7},sectionConfirmText:{fontSize:8,fontWeight:"900",color:"#0b668f"},item:{padding:12,borderTopWidth:1,borderTopColor:"#edf1f4",gap:8},itemAttention:{backgroundColor:"#fffdf7"},itemTop:{flexDirection:"row",gap:8,alignItems:"flex-start"},itemNo:{fontSize:10,fontWeight:"900",color:"#68808f",minWidth:26},itemDesc:{fontSize:11,lineHeight:16,fontWeight:"700",color:"#28495f",flex:1},itemMeta:{flexDirection:"row",alignItems:"center",gap:8,justifyContent:"space-between",flexWrap:"wrap"},meta:{fontSize:9,color:"#70828f"},rateRow:{flexDirection:"row",gap:10,alignItems:"flex-end",justifyContent:"space-between",backgroundColor:"#f8fbfd",borderRadius:10,padding:9},rateInputLabel:{fontSize:7,fontWeight:"900",letterSpacing:.7,color:"#748795"},rateInput:{marginTop:4,borderWidth:1,borderColor:"#cbd8e0",backgroundColor:"#fff",borderRadius:8,paddingHorizontal:9,paddingVertical:7,fontSize:11,color:"#173f5a",minWidth:110},rateAmount:{fontSize:12,fontWeight:"900",color:"#173f5a",marginTop:5},rateSource:{fontSize:7,color:"#7e8e99",marginTop:2},reviewLine:{backgroundColor:"#f7fafc",borderRadius:9,padding:8,gap:3},reviewText:{fontSize:9,color:"#536d7f"},reviewActions:{flexDirection:"row",alignItems:"center",justifyContent:"space-between",gap:8},confidence:{fontSize:8,fontWeight:"900",color:"#986b17",backgroundColor:"#fff0c9",borderRadius:999,paddingHorizontal:7,paddingVertical:4,textTransform:"uppercase"},confidenceHigh:{color:"#176247",backgroundColor:"#e4f5ed"},confidenceMid:{color:"#0b668f",backgroundColor:"#e6f2f8"},confirmed:{fontSize:8,fontWeight:"900",color:"#176247",backgroundColor:"#e4f5ed",borderRadius:999,paddingHorizontal:8,paddingVertical:5},editButton:{backgroundColor:"#0b668f",borderRadius:8,paddingHorizontal:9,paddingVertical:6},editButtonText:{fontSize:8,fontWeight:"900",color:"#fff"},materialToggle:{alignSelf:"flex-start"},materialToggleText:{fontSize:8,fontWeight:"900",color:"#0b668f"},material:{backgroundColor:"#f7fbfd",borderRadius:10,padding:10,gap:6},materialEye:{fontSize:8,fontWeight:"900",color:"#16825c"},materialText:{fontSize:10,lineHeight:15,color:"#6a7d8b"},materialRecipe:{fontSize:11,fontWeight:"900",color:"#173f5a"},materialComponent:{flexDirection:"row",alignItems:"center",gap:8,borderTopWidth:1,borderTopColor:"#e4ebef",paddingTop:6},materialComponentName:{fontSize:9,fontWeight:"900",color:"#35566b"},materialComponentBase:{fontSize:8,color:"#788a96",marginTop:2},materialComponentTotal:{fontSize:9,fontWeight:"900",color:"#0b668f"},assumptionBox:{backgroundColor:"#eef5f8",borderRadius:8,padding:8,gap:2},assumptionTitle:{fontSize:7,fontWeight:"900",letterSpacing:.6,color:"#607788"},assumptionText:{fontSize:8,lineHeight:12,color:"#687d8c"},
  warning:{backgroundColor:"#fff9e8",borderRadius:15,padding:14,gap:7},warningTitle:{fontSize:12,fontWeight:"900",color:"#775c18"},warningText:{fontSize:9,lineHeight:14,color:"#75684e"},modalBack:{flex:1,backgroundColor:"rgba(4,24,38,.48)",justifyContent:"flex-end"},modalCard:{maxHeight:"92%",backgroundColor:"#f7f9fb",borderTopLeftRadius:22,borderTopRightRadius:22,overflow:"hidden"},modalHead:{backgroundColor:"#082945",padding:16,flexDirection:"row",gap:10,alignItems:"flex-start"},modalEye:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#9ec5df"},modalTitle:{fontSize:15,fontWeight:"900",color:"#fff",marginTop:4},close:{fontSize:28,lineHeight:28,color:"#fff"},modalScroll:{padding:15,paddingBottom:34,gap:10},groupLabel:{fontSize:8,fontWeight:"900",letterSpacing:.8,color:"#647b8b",marginTop:3},chips:{flexDirection:"row",flexWrap:"wrap",gap:6},chip:{borderWidth:1,borderColor:"#cfdae2",backgroundColor:"#fff",borderRadius:999,paddingHorizontal:9,paddingVertical:7},chipActive:{borderColor:"#0b668f",backgroundColor:"#0b668f"},chipText:{fontSize:8,color:"#536d7f",fontWeight:"700"},chipTextActive:{color:"#fff"},reasonBox:{backgroundColor:"#edf4f8",borderRadius:11,padding:10,gap:4},reason:{fontSize:9,lineHeight:14,color:"#5d7485"}
});
