import { useCallback, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import * as DocumentPicker from "expo-document-picker";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { assessMobileFieldEvidence, prepareMobileFieldProgressLines, type MobileFieldProgressWorkItem } from "../../lib/field-progress-review";
import { Card, ScreenTitle, baseStyles as b } from "../../components/ui";

type Entry={progress:string;completed:string;note:string};
type Evidence=DocumentPicker.DocumentPickerAsset;
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const safe=(name:string)=>name.replace(/[^a-zA-Z0-9._-]/g,"_");
const pretty=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function ProjectFieldProgress(){
  const {id}=useLocalSearchParams<{id:string}>();
  const enabled=process.env.EXPO_PUBLIC_PROJECT_COST_BRIDGE_ENABLED==="true"&&process.env.EXPO_PUBLIC_PROJECT_PROGRESS_VALUATION_ENABLED==="true"&&process.env.EXPO_PUBLIC_PROJECT_PROGRESS_FIELD_REVIEW_ENABLED==="true";
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [projectName,setProjectName]=useState("Project");
  const [userId,setUserId]=useState("");
  const [role,setRole]=useState("");
  const [message,setMessage]=useState<string|null>(null);
  const [workItems,setWorkItems]=useState<MobileFieldProgressWorkItem[]>([]);
  const [entries,setEntries]=useState<Record<string,Entry>>({});
  const [files,setFiles]=useState<Evidence[]>([]);
  const [summary,setSummary]=useState("");
  const [reportDate,setReportDate]=useState(localDate());
  const [history,setHistory]=useState<any[]>([]);

  const load=useCallback(async()=>{
    if(!id)return;
    setLoading(true);setMessage(null);
    const {data:{user}}=await supabase.auth.getUser();
    if(!user){setMessage("Sign in again to submit a field report.");setLoading(false);return;}
    setUserId(user.id);
    const {data:project,error:projectError}=await supabase.from("projects").select("id,name,company_id").eq("id",id).maybeSingle();
    if(projectError||!project){setMessage("Project not available.");setLoading(false);return;}
    setProjectName(project.name);
    const {data:member}=await supabase.from("company_members").select("role,status").eq("company_id",project.company_id).eq("user_id",user.id).eq("status","active").maybeSingle();
    const currentRole=String(member?.role??"");setRole(currentRole);
    if(!enabled){setMessage("PM Field Progress is built but not activated for this deployment. Its reviewed database draft and private evidence bucket remain unapplied.");setLoading(false);return;}
    if(currentRole!=="pm"){setMessage(currentRole==="md"?"MD reviews submitted field reports before they become authoritative progress. Use Progress Valuation for the current approved position.":"Field Progress submission is available only to an assigned Project Manager.");setLoading(false);return;}
    const [{data:rows,error},{data:reports}]=await Promise.all([
      supabase.rpc("get_project_progress_work_items_v1" as never,{target_project_id:id} as never),
      supabase.from("project_progress_field_submissions").select("id,submission_version,report_date,status,submitted_at,review_notes").eq("project_id",id).eq("submitted_by",user.id).order("submitted_at",{ascending:false}).limit(8),
    ]);
    if(error){setMessage(error.message);setLoading(false);return;}
    const safeItems:MobileFieldProgressWorkItem[]=(rows??[]).map((row:any)=>({budgetLineId:row.budget_line_id,sourceLineId:row.source_line_id,costCode:row.cost_code,description:row.description,unit:row.unit??null,approvedQuantity:row.approved_quantity==null?null:Number(row.approved_quantity),priorProgressPercent:Number(row.prior_progress_percent??0),priorCompletedQuantity:row.prior_completed_quantity==null?null:Number(row.prior_completed_quantity)}));
    setWorkItems(safeItems);
    setEntries(Object.fromEntries(safeItems.map(item=>[item.budgetLineId,{progress:String(item.priorProgressPercent),completed:item.priorCompletedQuantity==null?"":String(item.priorCompletedQuantity),note:""}])));
    setHistory(reports??[]);setLoading(false);
  },[id,enabled]);
  useFocusEffect(useCallback(()=>{load()},[load]));

  const rawLines=workItems.map(item=>{const entry=entries[item.budgetLineId]??{progress:String(item.priorProgressPercent),completed:"",note:""};return{budgetLineId:item.budgetLineId,reportedProgressPercent:Number(entry.progress||0),reportedCompletedQuantity:entry.completed.trim()?Number(entry.completed):null,lineNote:entry.note||null};});
  const validation=useMemo(()=>{try{return{lines:prepareMobileFieldProgressLines(workItems,rawLines),error:null as string|null};}catch(error){return{lines:[],error:error instanceof Error?error.message:"Review the field progress entries."};}},[workItems,entries]);
  const evidence=useMemo(()=>assessMobileFieldEvidence(files.map(file=>({name:file.name,mimeType:file.mimeType??null,size:file.size??0}))),[files]);
  const disabled=busy||!!validation.error||evidence.warnings.length>0||summary.trim().length<3||!reportDate||!userId;

  async function chooseEvidence(){
    const picked=await DocumentPicker.getDocumentAsync({multiple:true,copyToCacheDirectory:true,type:["image/jpeg","image/png","image/webp","application/pdf"]});
    if(picked.canceled)return;
    const next=picked.assets.slice(0,8);
    setFiles(next);
    if(picked.assets.length>8)Alert.alert("Evidence limit","Only the first 8 files were selected. One field report can contain at most 8 evidence files.");
  }

  async function submit(){
    if(!id||disabled)return;
    const token=crypto.randomUUID();const uploaded:string[]=[];
    setBusy(true);setMessage(null);
    try{
      for(const file of files){
        const response=await fetch(file.uri);const bytes=await response.arrayBuffer();
        const path=`${id}/${userId}/${token}/${Date.now()}-${safe(file.name)}`;
        const {error}=await supabase.storage.from("project-progress-evidence").upload(path,bytes,{contentType:file.mimeType??undefined,upsert:false});
        if(error)throw error;uploaded.push(path);
      }
      const fieldLines=validation.lines.map(line=>({budget_line_id:line.budgetLineId,reported_progress_percent:line.effectiveProgressPercent,reported_completed_quantity:line.reportedCompletedQuantity,line_note:line.lineNote??null}));
      const {error}=await supabase.rpc("submit_project_field_progress_v1" as never,{target_project_id:id,report_date_value:reportDate,site_summary_value:summary.trim(),field_lines:fieldLines,evidence_token_value:token} as never);
      if(error)throw error;
      setFiles([]);setSummary("");Alert.alert("Submitted for MD review","Authoritative project progress has not changed. MD approval is required.");await load();
    }catch(error){
      if(uploaded.length){try{await supabase.storage.from("project-progress-evidence").remove(uploaded);}catch{/* storage policy keeps unlinked evidence removable by uploader */}}
      Alert.alert("Could not submit field progress",error instanceof Error?error.message:"Please review the field report and try again.");
    }finally{setBusy(false);}
  }

  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <View style={s.backRow}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Project</Text></Pressable><Text style={s.status}>{role==="pm"?"PM FIELD REPORT":"FIELD PROGRESS"}</Text></View>
    <ScreenTitle eyebrow="FIELD PROGRESS" title={projectName} subtitle="Report what is physically complete on site. MD approval is required before it becomes authoritative Progress Valuation."/>
    {message&&<Card><Text style={s.note}>{message}</Text>{role==="md"&&<Pressable style={s.outline} onPress={()=>router.push(`/project-progress/${id}` as never)}><Text style={s.outlineText}>Open Progress Valuation</Text></Pressable>}</Card>}
    {enabled&&role==="pm"&&<>
      <View style={s.privacy}><Text style={s.privacyTitle}>NON-FINANCIAL PM VIEW</Text><Text style={s.privacyText}>This screen contains approved quantities and prior approved progress only. Internal rates, budget amounts, earned work, profit, forecast and Money records are not loaded here.</Text></View>
      <Card><Text style={s.inputLabel}>REPORT DATE</Text><TextInput value={reportDate} onChangeText={setReportDate} placeholder="YYYY-MM-DD" maxLength={10} style={s.input}/><Text style={s.note}>Use today or the actual date of the site inspection/report.</Text></Card>
      {workItems.map(item=>{const entry=entries[item.budgetLineId]??{progress:String(item.priorProgressPercent),completed:"",note:""};return <Card key={item.budgetLineId}>
        <Text style={s.itemTitle}>{item.costCode} · {item.description}</Text><Text style={s.itemMeta}>Approved quantity {item.approvedQuantity==null?"—":`${item.approvedQuantity} ${item.unit??""}`} · last approved {item.priorProgressPercent}%</Text>
        <View style={s.entryRow}><View style={{flex:1}}><Text style={s.inputLabel}>PROGRESS %</Text><TextInput keyboardType="decimal-pad" value={entry.progress} onChangeText={value=>setEntries(current=>({...current,[item.budgetLineId]:{...current[item.budgetLineId],progress:value,completed:""}}))} style={s.input}/></View>{item.approvedQuantity!=null&&item.approvedQuantity>0&&<View style={{flex:1}}><Text style={s.inputLabel}>COMPLETED {String(item.unit??"QTY").toUpperCase()}</Text><TextInput keyboardType="decimal-pad" value={entry.completed} placeholder="Optional" onChangeText={value=>setEntries(current=>({...current,[item.budgetLineId]:{...current[item.budgetLineId],completed:value}}))} style={s.input}/></View>}</View>
        <Text style={[s.inputLabel,{marginTop:8}]}>SITE NOTE</Text><TextInput value={entry.note} onChangeText={value=>setEntries(current=>({...current,[item.budgetLineId]:{...current[item.budgetLineId],note:value}}))} maxLength={1000} placeholder="Optional note for this work item" style={s.input}/>
      </Card>})}
      {validation.error&&<View style={s.warn}><Text style={s.warnText}>{validation.error}</Text></View>}
      <Card><Text style={s.inputLabel}>OVERALL SITE SUMMARY</Text><TextInput multiline value={summary} onChangeText={setSummary} maxLength={3000} placeholder="Work completed, areas inspected, constraints or current site position" style={[s.input,s.textarea]}/></Card>
      <Card><View style={s.fileHead}><View style={{flex:1}}><Text style={s.inputLabel}>SITE EVIDENCE</Text><Text style={s.note}>1–8 JPG, PNG, WebP or PDF files · maximum 10 MB each.</Text></View><Pressable style={s.outline} onPress={chooseEvidence}><Text style={s.outlineText}>Choose files</Text></Pressable></View>{files.map(file=><View key={`${file.name}-${file.size}`} style={s.fileRow}><Text numberOfLines={1} style={s.fileName}>{file.name}</Text><Text style={s.fileSize}>{((file.size??0)/1024/1024).toFixed(1)} MB</Text></View>)}{evidence.warnings.map(warning=><Text key={warning} style={s.warningLine}>• {warning}</Text>)}</Card>
      <Pressable disabled={disabled} onPress={submit} style={[s.button,disabled&&{opacity:.45}]}><Text style={s.buttonText}>{busy?"Submitting…":"Submit for MD Review"}</Text></Pressable>
      <Text style={s.footer}>Submitting creates a reviewable site report only. It does not update Money, the BOQ baseline or authoritative project progress.</Text>
      <Card><Text style={s.historyTitle}>MY FIELD REPORTS</Text>{history.length?history.map(report=><View key={report.id} style={s.historyRow}><View style={{flex:1}}><Text style={s.itemTitle}>Report V{report.submission_version} · {report.report_date}</Text><Text style={s.itemMeta}>{new Date(report.submitted_at).toLocaleString("en-NG")}</Text>{report.review_notes&&<Text style={s.reviewNote}>MD note: {report.review_notes}</Text>}</View><Text style={s.historyStatus}>{pretty(report.status)}</Text></View>):<Text style={s.note}>No field reports submitted yet.</Text>}</Card>
    </>}
  </ScrollView></SafeAreaView>;
}

const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},backRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},back:{fontSize:11,fontWeight:"800",color:"#0b5c8b"},status:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#16825c"},privacy:{backgroundColor:"#eaf5fb",borderRadius:14,padding:12,borderWidth:1,borderColor:"#cee3ee"},privacyTitle:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#0b668f"},privacyText:{fontSize:9,lineHeight:14,color:"#567182",marginTop:4},inputLabel:{fontSize:7,fontWeight:"900",letterSpacing:.7,color:"#718391",marginBottom:4},input:{borderWidth:1,borderColor:"#d4e0e7",borderRadius:9,paddingHorizontal:10,paddingVertical:9,fontSize:10,color:"#173f5a",backgroundColor:"#fff"},textarea:{minHeight:86,textAlignVertical:"top"},note:{fontSize:9,lineHeight:14,color:"#718391",marginTop:5},itemTitle:{fontSize:10,fontWeight:"900",color:"#29475c"},itemMeta:{fontSize:8,lineHeight:12,color:"#84909a",marginTop:3},entryRow:{flexDirection:"row",gap:8,marginTop:10},warn:{backgroundColor:"#fff4ce",borderRadius:10,padding:10},warnText:{fontSize:9,lineHeight:14,color:"#775c18"},warningLine:{fontSize:8,lineHeight:13,color:"#8b6512",marginTop:4},fileHead:{flexDirection:"row",gap:10,alignItems:"center"},outline:{borderWidth:1,borderColor:"#9fc3d7",borderRadius:9,paddingHorizontal:10,paddingVertical:8,alignSelf:"flex-start"},outlineText:{fontSize:8,fontWeight:"900",color:"#0b668f"},fileRow:{flexDirection:"row",justifyContent:"space-between",gap:8,borderTopWidth:1,borderTopColor:"#edf1f4",paddingTop:7,marginTop:7},fileName:{flex:1,fontSize:8,color:"#526d7d"},fileSize:{fontSize:8,fontWeight:"800",color:"#718391"},button:{backgroundColor:"#0b668f",borderRadius:12,padding:13,alignItems:"center"},buttonText:{fontSize:10,fontWeight:"900",color:"#fff"},footer:{fontSize:8,lineHeight:13,color:"#718391",textAlign:"center",paddingHorizontal:8},historyTitle:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#0b668f",marginBottom:3},historyRow:{flexDirection:"row",gap:8,alignItems:"flex-start",borderTopWidth:1,borderTopColor:"#edf1f4",paddingTop:8,marginTop:8},historyStatus:{fontSize:7,fontWeight:"900",color:"#16825c"},reviewNote:{fontSize:8,lineHeight:12,color:"#526d7d",marginTop:4}});
