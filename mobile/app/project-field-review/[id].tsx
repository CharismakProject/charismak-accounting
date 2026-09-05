import { useCallback, useState } from "react";
import { ActivityIndicator, Alert, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { router, useFocusEffect, useLocalSearchParams } from "expo-router";
import { SafeAreaView } from "react-native-safe-area-context";
import { supabase } from "../../lib/supabase";
import { buildMobileProgressPosition, type MobileProgressActual, type MobileProgressBudgetLine, type MobileProgressLine } from "../../lib/progress-valuation";
import { Card, ScreenTitle, baseStyles as b } from "../../components/ui";

type Evidence={id:string;fileName:string;url:string|null};
type ReviewCard={submission:any;lines:any[];evidence:Evidence[];position:ReturnType<typeof buildMobileProgressPosition>|null;error:string|null};
const money=(value:number|null,currency="NGN")=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);
const pretty=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default function ProjectFieldReview(){
  const {id}=useLocalSearchParams<{id:string}>();
  const enabled=process.env.EXPO_PUBLIC_PROJECT_COST_BRIDGE_ENABLED==="true"&&process.env.EXPO_PUBLIC_PROJECT_PROGRESS_VALUATION_ENABLED==="true"&&process.env.EXPO_PUBLIC_PROJECT_PROGRESS_FIELD_REVIEW_ENABLED==="true";
  const [loading,setLoading]=useState(true);const [busy,setBusy]=useState<string|null>(null);const [name,setName]=useState("Project");const [currency,setCurrency]=useState("NGN");const [message,setMessage]=useState<string|null>(null);const [cards,setCards]=useState<ReviewCard[]>([]);const [notes,setNotes]=useState<Record<string,string>>({});const [history,setHistory]=useState<any[]>([]);

  const load=useCallback(async()=>{
    if(!id)return;setLoading(true);setMessage(null);
    const {data:{user}}=await supabase.auth.getUser();if(!user){setMessage("Sign in again to review field progress.");setLoading(false);return;}
    const {data:project,error:projectError}=await supabase.from("projects").select("id,name,company_id").eq("id",id).maybeSingle();if(projectError||!project){setMessage("Project not available.");setLoading(false);return;}setName(project.name);
    const {data:member}=await supabase.from("company_members").select("role,status").eq("company_id",project.company_id).eq("user_id",user.id).eq("status","active").maybeSingle();if(String(member?.role??"")!=="md"){setMessage("Only the MD can review and approve PM field progress reports.");setLoading(false);return;}
    if(!enabled){setMessage("PM Field Progress review is built but not activated for this deployment. No field-review database objects are queried while the feature gate is off.");setLoading(false);return;}
    const [{data:submissions,error:submissionError},{data:budget,error:budgetError}]=await Promise.all([
      supabase.from("project_progress_field_submissions").select("id,budget_id,submission_version,report_date,status,site_summary,submitted_at,review_notes").eq("project_id",id).order("submitted_at",{ascending:false}).limit(20),
      supabase.from("project_cost_budgets").select("id,currency_code").eq("project_id",id).eq("status","approved").maybeSingle(),
    ]);
    if(submissionError){setMessage(submissionError.message);setLoading(false);return;}setHistory(submissions??[]);
    const pending=(submissions??[]).filter((submission:any)=>submission.status==="submitted");
    if(!pending.length){setCards([]);setLoading(false);return;}
    if(budgetError||!budget){setMessage("An approved Project Budget Baseline is required before a field report can be reviewed financially.");setLoading(false);return;}setCurrency(budget.currency_code||"NGN");
    const [{data:budgetRows,error:lineError},{data:actualRows,error:actualError}]=await Promise.all([
      supabase.from("project_cost_budget_lines").select("id,source_line_id,cost_code,description,unit,quantity,amount").eq("budget_id",budget.id),
      supabase.from("transactions").select("id,cost_code,amount").eq("project_id",id).eq("kind","expense").eq("status","posted"),
    ]);
    if(lineError||actualError){setMessage("The approved budget or posted actual-cost set could not be read. No partial MD review is shown.");setLoading(false);return;}
    const budgetLines:MobileProgressBudgetLine[]=(budgetRows??[]).map((row:any)=>({budgetLineId:row.id,sourceLineId:row.source_line_id??null,costCode:row.cost_code,description:row.description,unit:row.unit??null,quantity:row.quantity==null?null:Number(row.quantity),amount:Number(row.amount)}));
    const actuals:MobileProgressActual[]=(actualRows??[]).map((row:any)=>({transactionId:row.id,costCode:row.cost_code??null,amount:Number(row.amount)}));
    const next:ReviewCard[]=[];
    for(const submission of pending as any[]){
      const [{data:fieldLines,error:fieldError},{data:evidenceRows,error:evidenceError}]=await Promise.all([
        supabase.from("project_progress_field_submission_lines").select("budget_line_id,reported_progress_percent,reported_completed_quantity,line_note,cost_code,description,unit,budget_quantity").eq("submission_id",submission.id),
        supabase.from("project_progress_field_evidence").select("id,file_name,storage_path").eq("submission_id",submission.id),
      ]);
      let position:ReturnType<typeof buildMobileProgressPosition>|null=null;let error:string|null=null;
      if(fieldError||evidenceError)error="This report could not be read completely and cannot be approved.";
      else try{const valuationLines:MobileProgressLine[]=(fieldLines??[]).map((row:any)=>({budgetLineId:row.budget_line_id,progressPercent:Number(row.reported_progress_percent),completedQuantity:row.reported_completed_quantity==null?null:Number(row.reported_completed_quantity)}));position=buildMobileProgressPosition({budgetLines,valuationLines,actuals});}catch(e){error=e instanceof Error?e.message:"This report cannot be valued against the current approved budget.";}
      const evidence:Evidence[]=[];for(const row of evidenceRows??[]){const {data:signed}=await supabase.storage.from("project-progress-evidence").createSignedUrl((row as any).storage_path,3600);evidence.push({id:(row as any).id,fileName:(row as any).file_name,url:signed?.signedUrl??null});}
      next.push({submission,lines:fieldLines??[],evidence,position,error});
    }
    setCards(next);setLoading(false);
  },[id,enabled]);
  useFocusEffect(useCallback(()=>{load()},[load]));

  async function review(submissionId:string,decision:"approve"|"changes_requested"|"decline"){
    const note=(notes[submissionId]??"").trim();if(decision!=="approve"&&note.length<3){Alert.alert("Add MD review note","A short note is required when requesting changes or declining.");return;}
    try{setBusy(submissionId);const {error}=await supabase.rpc("review_project_field_progress_v1" as never,{target_submission_id:submissionId,decision_value:decision,review_notes_value:note||null} as never);if(error)throw error;Alert.alert(decision==="approve"?"Progress approved":decision==="changes_requested"?"Changes requested":"Field report declined",decision==="approve"?"The PM report has been promoted to a new authoritative Progress Valuation version.":"Authoritative project progress was not changed.");setNotes(current=>({...current,[submissionId]:""}));await load();}catch(error){Alert.alert("Could not review field report",error instanceof Error?error.message:"Please try again.");}finally{setBusy(null);}
  }

  if(loading)return <SafeAreaView style={b.screen}><View style={s.center}><ActivityIndicator size="large" color="#073f65"/></View></SafeAreaView>;
  return <SafeAreaView style={b.screen} edges={["top"]}><ScrollView contentContainerStyle={b.content}>
    <View style={s.backRow}><Pressable onPress={()=>router.back()}><Text style={s.back}>← Project</Text></Pressable><Text style={s.status}>MD REVIEW</Text></View><ScreenTitle eyebrow="FIELD PROGRESS REVIEW" title={name} subtitle={`${cards.length} PM report${cards.length===1?"":"s"} awaiting review. Approval is the only field-review action that changes authoritative progress.`}/>
    {message&&<Card><Text style={s.note}>{message}</Text></Card>}
    {!message&&cards.length===0&&<Card><Text style={s.note}>No PM field report is awaiting MD review.</Text></Card>}
    {cards.map(card=><Card key={card.submission.id}>
      <Text style={s.eyebrow}>PM REPORT V{card.submission.submission_version} · {card.submission.report_date}</Text><Text style={s.title}>{card.submission.site_summary}</Text><Text style={s.note}>Submitted {new Date(card.submission.submitted_at).toLocaleString("en-NG")}</Text>
      {card.position&&<View style={s.metrics}><Metric label="Proposed progress" value={`${card.position.physicalProgressPercent}%`}/><Metric label="Proposed earned work" value={money(card.position.earnedValue,currency)}/><Metric label="Actual spend" value={money(card.position.actualCost,currency)}/><Metric label="Cost-position variance" value={money(card.position.variance,currency)}/></View>}
      {card.error&&<View style={s.warn}><Text style={s.warnText}>{card.error}</Text></View>}
      <View style={s.lines}>{card.lines.map((line:any)=><View key={line.budget_line_id} style={s.line}><View style={{flex:1}}><Text style={s.lineTitle}>{line.cost_code} · {line.description}</Text><Text style={s.lineMeta}>Approved {line.budget_quantity??"—"} {line.unit??""} · completed {line.reported_completed_quantity??"—"}</Text>{line.line_note&&<Text style={s.lineNote}>{line.line_note}</Text>}</View><Text style={s.progress}>{Number(line.reported_progress_percent)}%</Text></View>)}</View>
      <Text style={[s.eyebrow,{marginTop:10}]}>SITE EVIDENCE · {card.evidence.length}</Text>{card.evidence.map(item=><Pressable key={item.id} disabled={!item.url} onPress={()=>item.url&&Linking.openURL(item.url)} style={s.evidence}><Text numberOfLines={1} style={s.evidenceText}>{item.fileName}</Text><Text style={s.evidenceOpen}>{item.url?"Open":"Unavailable"}</Text></Pressable>)}
      <Text style={[s.eyebrow,{marginTop:10}]}>MD REVIEW NOTE</Text><TextInput multiline value={notes[card.submission.id]??""} onChangeText={value=>setNotes(current=>({...current,[card.submission.id]:value}))} maxLength={3000} placeholder="Required for changes/decline; optional on approval" style={s.input}/>
      <View style={s.actions}><Pressable disabled={busy===card.submission.id||!!card.error} onPress={()=>review(card.submission.id,"approve")} style={[s.approve,(busy===card.submission.id||!!card.error)&&{opacity:.45}]}><Text style={s.approveText}>{busy===card.submission.id?"Working…":"Approve Progress"}</Text></Pressable><Pressable disabled={busy===card.submission.id} onPress={()=>review(card.submission.id,"changes_requested")} style={s.outline}><Text style={s.outlineText}>Request Changes</Text></Pressable><Pressable disabled={busy===card.submission.id} onPress={()=>review(card.submission.id,"decline")} style={s.decline}><Text style={s.declineText}>Decline</Text></Pressable></View>
    </Card>)}
    <Card><Text style={s.eyebrow}>REVIEW HISTORY</Text>{history.length?history.map(report=><View key={report.id} style={s.history}><View style={{flex:1}}><Text style={s.lineTitle}>V{report.submission_version} · {report.report_date}</Text>{report.review_notes&&<Text style={s.lineNote}>{report.review_notes}</Text>}</View><Text style={s.historyStatus}>{pretty(report.status)}</Text></View>):<Text style={s.note}>No field reports yet.</Text>}</Card>
  </ScrollView></SafeAreaView>;
}
function Metric({label,value}:{label:string;value:string}){return <View style={s.metric}><Text style={s.metricLabel}>{label.toUpperCase()}</Text><Text style={s.metricValue}>{value}</Text></View>}
const s=StyleSheet.create({center:{flex:1,alignItems:"center",justifyContent:"center"},backRow:{flexDirection:"row",justifyContent:"space-between",alignItems:"center"},back:{fontSize:11,fontWeight:"800",color:"#0b5c8b"},status:{fontSize:8,fontWeight:"900",letterSpacing:1,color:"#16825c"},eyebrow:{fontSize:8,fontWeight:"900",letterSpacing:.8,color:"#0b668f"},title:{fontSize:14,fontWeight:"900",lineHeight:19,color:"#173f5a",marginTop:5},note:{fontSize:9,lineHeight:14,color:"#718391",marginTop:5},metrics:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:12},metric:{minWidth:"47%",flexGrow:1,borderWidth:1,borderColor:"#dce6ec",borderRadius:10,padding:9},metricLabel:{fontSize:6,fontWeight:"900",color:"#718391"},metricValue:{fontSize:11,fontWeight:"900",color:"#173f5a",marginTop:3},warn:{backgroundColor:"#fff4ce",borderRadius:9,padding:9,marginTop:9},warnText:{fontSize:8,lineHeight:13,color:"#775c18"},lines:{marginTop:10},line:{flexDirection:"row",gap:8,alignItems:"flex-start",borderTopWidth:1,borderTopColor:"#edf1f4",paddingVertical:8},lineTitle:{fontSize:9,fontWeight:"900",color:"#29475c"},lineMeta:{fontSize:7,color:"#84909a",marginTop:2},lineNote:{fontSize:8,lineHeight:12,color:"#526d7d",marginTop:3},progress:{fontSize:10,fontWeight:"900",color:"#16825c"},evidence:{flexDirection:"row",justifyContent:"space-between",gap:8,borderTopWidth:1,borderTopColor:"#edf1f4",paddingVertical:7},evidenceText:{flex:1,fontSize:8,color:"#526d7d"},evidenceOpen:{fontSize:8,fontWeight:"900",color:"#0b668f"},input:{borderWidth:1,borderColor:"#d4e0e7",borderRadius:9,padding:10,minHeight:72,textAlignVertical:"top",fontSize:9,color:"#173f5a",backgroundColor:"#fff",marginTop:5},actions:{flexDirection:"row",flexWrap:"wrap",gap:7,marginTop:10},approve:{backgroundColor:"#16825c",borderRadius:9,paddingHorizontal:11,paddingVertical:9},approveText:{fontSize:8,fontWeight:"900",color:"#fff"},outline:{borderWidth:1,borderColor:"#9fc3d7",borderRadius:9,paddingHorizontal:11,paddingVertical:9},outlineText:{fontSize:8,fontWeight:"900",color:"#0b668f"},decline:{borderWidth:1,borderColor:"#d9aaa6",borderRadius:9,paddingHorizontal:11,paddingVertical:9},declineText:{fontSize:8,fontWeight:"900",color:"#a13d37"},history:{flexDirection:"row",gap:8,borderTopWidth:1,borderTopColor:"#edf1f4",paddingTop:8,marginTop:8},historyStatus:{fontSize:7,fontWeight:"900",color:"#526d7d"}});
