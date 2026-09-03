"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../../../lib/supabase/client";
import { assessFieldEvidence, prepareFieldProgressLines, type FieldProgressWorkItem } from "../../../../../lib/project-cost/field-progress-review";

type Entry={progress:string;completed:string;note:string};
const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;};
const safe=(name:string)=>name.replace(/[^a-zA-Z0-9._-]/g,"_");

export default function FieldProgressClient({projectId,userId,workItems}:{projectId:string;userId:string;workItems:FieldProgressWorkItem[]}){
  const router=useRouter();
  const [entries,setEntries]=useState<Record<string,Entry>>(()=>Object.fromEntries(workItems.map(item=>[item.budgetLineId,{progress:String(item.priorProgressPercent),completed:item.priorCompletedQuantity==null?"":String(item.priorCompletedQuantity),note:""}])));
  const [files,setFiles]=useState<File[]>([]);
  const [summary,setSummary]=useState("");
  const [reportDate,setReportDate]=useState(localDate());
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState<string|null>(null);
  const rawLines=workItems.map(item=>{const e=entries[item.budgetLineId];return{budgetLineId:item.budgetLineId,reportedProgressPercent:Number(e?.progress||0),reportedCompletedQuantity:e?.completed.trim()?Number(e.completed):null,lineNote:e?.note||null};});
  const validation=useMemo(()=>{try{return{lines:prepareFieldProgressLines(workItems,rawLines),error:null as string|null}}catch(error){return{lines:[],error:error instanceof Error?error.message:"Review the field progress entries."}}},[workItems,entries]);
  const evidence=useMemo(()=>assessFieldEvidence(files.map(file=>({name:file.name,mimeType:file.type||null,size:file.size}))),[files]);

  async function submit(){
    if(busy||validation.error||evidence.warnings.length||summary.trim().length<3)return;
    const supabase=createClient();
    const token=crypto.randomUUID();
    const uploaded:string[]=[];
    setBusy(true);setMessage(null);
    try{
      for(const file of files){
        const path=`${projectId}/${userId}/${token}/${Date.now()}-${safe(file.name)}`;
        const {error}=await supabase.storage.from("project-progress-evidence").upload(path,file,{contentType:file.type,upsert:false});
        if(error)throw error;
        uploaded.push(path);
      }
      const payload=validation.lines.map(line=>({budget_line_id:line.budgetLineId,reported_progress_percent:line.effectiveProgressPercent,reported_completed_quantity:line.reportedCompletedQuantity,line_note:line.lineNote??null}));
      const {error}=await supabase.rpc("submit_project_field_progress_v1" as never,{target_project_id:projectId,report_date_value:reportDate,site_summary_value:summary.trim(),field_lines:payload,evidence_token_value:token} as never);
      if(error)throw error;
      setFiles([]);setSummary("");setMessage("Field progress submitted for MD review. Project progress has not changed yet.");router.refresh();
    }catch(error){
      if(uploaded.length)await supabase.storage.from("project-progress-evidence").remove(uploaded).catch(()=>undefined);
      setMessage(error instanceof Error?error.message:"Could not submit field progress.");
    }finally{setBusy(false);}
  }

  return <section className="compact-card" style={{display:"grid",gap:12}}>
    <div><small style={eye}>PM FIELD REPORT</small><h2 style={title}>Report what is physically complete on site</h2><p style={copy}>You can see approved quantities and the last approved progress only. Internal rates, budget amounts, profit and Money records are intentionally hidden.</p></div>
    <label style={label}>Report date<input type="date" max={localDate()} value={reportDate} onChange={e=>setReportDate(e.target.value)} style={input}/></label>
    <div style={{display:"grid",gap:8}}>{workItems.map(item=>{const e=entries[item.budgetLineId];return <article key={item.budgetLineId} style={row}><div style={{flex:1,minWidth:210}}><b style={{fontSize:10,color:"#29475c"}}>{item.costCode} · {item.description}</b><small style={{display:"block",fontSize:8,color:"#84909a",marginTop:3}}>Approved quantity {item.approvedQuantity==null?"—":`${item.approvedQuantity} ${item.unit??""}`} · last approved {item.priorProgressPercent}%</small></div><label style={miniLabel}>Progress %<input type="number" min={item.priorProgressPercent} max="100" step="0.1" value={e.progress} onChange={event=>setEntries(current=>({...current,[item.budgetLineId]:{...current[item.budgetLineId],progress:event.target.value,completed:""}}))} style={miniInput}/></label>{item.approvedQuantity!=null&&item.approvedQuantity>0&&<label style={miniLabel}>Completed {item.unit??"qty"}<input type="number" min={item.priorCompletedQuantity??0} max={item.approvedQuantity} step="0.001" value={e.completed} onChange={event=>setEntries(current=>({...current,[item.budgetLineId]:{...current[item.budgetLineId],completed:event.target.value}}))} style={miniInput}/></label>}<label style={{...miniLabel,minWidth:180}}>Site note<input value={e.note} maxLength={1000} placeholder="Optional" onChange={event=>setEntries(current=>({...current,[item.budgetLineId]:{...current[item.budgetLineId],note:event.target.value}}))} style={{...miniInput,width:190}}/></label></article>})}</div>
    {validation.error&&<div style={warn}>{validation.error}</div>}
    <label style={label}>Overall site summary<textarea rows={3} maxLength={3000} value={summary} onChange={e=>setSummary(e.target.value)} placeholder="What was completed, areas inspected, constraints or site position" style={input}/></label>
    <label style={label}>Site evidence<input type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={e=>setFiles(Array.from(e.target.files??[]).slice(0,8))} style={input}/><small style={{fontSize:8,color:"#718391"}}>1–8 site photos or PDFs, maximum 10 MB each.</small></label>
    {!!files.length&&<div style={{display:"grid",gap:4}}>{files.map(file=><small key={`${file.name}-${file.size}`} style={{fontSize:8,color:"#526d7d"}}>{file.name} · {(file.size/1024/1024).toFixed(1)} MB</small>)}</div>}
    {evidence.warnings.map(w=><div key={w} style={warn}>{w}</div>)}
    {message&&<div style={message.includes("submitted")?ok:warn}>{message}</div>}
    <button type="button" onClick={submit} disabled={busy||!!validation.error||!!evidence.warnings.length||summary.trim().length<3} style={{justifySelf:"start",opacity:busy||validation.error||evidence.warnings.length||summary.trim().length<3?.5:1}}>{busy?"Submitting…":"Submit for MD Review"}</button>
    <small style={{fontSize:8,lineHeight:1.5,color:"#718391"}}>Submitting does not update authoritative project progress. MD approval is required.</small>
  </section>;
}
const eye:React.CSSProperties={fontSize:8,fontWeight:900,letterSpacing:".1em",color:"#0b668f"};const title:React.CSSProperties={fontSize:15,color:"#173f5a",margin:"5px 0 8px"};const copy:React.CSSProperties={fontSize:10,lineHeight:1.55,color:"#718391",margin:0};const label:React.CSSProperties={display:"grid",gap:5,fontSize:9,fontWeight:800,color:"#466273"};const input:React.CSSProperties={border:"1px solid #d4e0e7",borderRadius:8,padding:9,font:"inherit",background:"#fff"};const row:React.CSSProperties={display:"flex",alignItems:"center",gap:8,flexWrap:"wrap",border:"1px solid #e0e8ed",borderRadius:11,padding:10};const miniLabel:React.CSSProperties={display:"grid",gap:3,fontSize:7,color:"#718391",minWidth:95};const miniInput:React.CSSProperties={width:110,border:"1px solid #d4e0e7",borderRadius:7,padding:"7px 8px",fontSize:10};const warn:React.CSSProperties={background:"#fff4ce",borderRadius:10,padding:10,fontSize:9,color:"#775c18"};const ok:React.CSSProperties={background:"#ecf8f2",borderRadius:10,padding:10,fontSize:9,color:"#176247"};
