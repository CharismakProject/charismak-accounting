"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "../../lib/supabase/client";
import { validateUploadBatch } from "../../lib/accounting/guards";

type Project={id:string;project_code:string;name:string};
type Hint="auto"|"bank_statement"|"invoice"|"bill"|"quotation"|"receipt"|"boq"|"other";
type Action="analyse"|"analyse_keywords"|"store_only";
type Result={name:string;state:"queued"|"working"|"done"|"review"|"duplicate"|"failed";message:string;href?:string;type?:string};
const MAX=20*1024*1024;
const supported=["pdf","csv","xlsx","xls","docx","jpg","jpeg","png","webp"];
const mime:Record<string,string[]>={pdf:["application/pdf"],csv:["text/csv","application/csv","text/plain","application/vnd.ms-excel"],xlsx:["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/octet-stream"],xls:["application/vnd.ms-excel","application/octet-stream"],docx:["application/vnd.openxmlformats-officedocument.wordprocessingml.document","application/octet-stream"],jpg:["image/jpeg"],jpeg:["image/jpeg"],png:["image/png"],webp:["image/webp"]};
const safe=(s:string)=>s.replace(/[^a-zA-Z0-9._-]/g,"_");
const keywords=(s:string)=>Array.from(new Set(s.split(/[\n,;]+/).map(v=>v.trim()).filter(v=>v.length>=2))).slice(0,30);
const label=(s:string)=>s.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
async function hash(file:File){const bytes=await file.arrayBuffer();const d=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
async function readableFunctionError(error:any){try{const response=error?.context as Response|undefined;if(response){if(response.status===401)return "Your session needs to be refreshed. Sign in again and retry.";const payload=await response.clone().json().catch(()=>null);if(payload?.error)return payload.error;if(payload?.message)return payload.message;if(response.status>=500)return "Charismak could not finish analysing this file. The uploaded copy is safe and can be retried.";}}catch{}return error?.message||"The analysis could not be completed.";}

export default function UniversalIntakeV2({companyId,projects,onboarding=false,defaultProjectId=""}:{companyId:string;projects:Project[];onboarding?:boolean;defaultProjectId?:string}){
  const supabase=useMemo(()=>createClient(),[]);
  const [files,setFiles]=useState<File[]>([]);
  const [hint,setHint]=useState<Hint>("auto");
  const [action,setAction]=useState<Action>("analyse");
  const [keywordText,setKeywordText]=useState("");
  const [projectId,setProjectId]=useState(defaultProjectId);
  const [results,setResults]=useState<Result[]>([]);
  const [summary,setSummary]=useState("");
  const [busy,setBusy]=useState(false);
  const update=(i:number,p:Partial<Result>)=>setResults(prev=>prev.map((r,x)=>x===i?{...r,...p}:r));

  async function projectSignals(analysed:any){
    const ids:string[]=Array.isArray(analysed?.statementImportIds)&&analysed.statementImportIds.length?analysed.statementImportIds.map(String):analysed?.statementImportId?[String(analysed.statementImportId)]:[];
    const words=keywords(keywordText);
    let count=0;let first:string|null=null;
    for(const importId of ids){
      const {data,error}=words.length
        ? await supabase.rpc("discover_statement_projects_with_keywords",{target_import:importId,target_keywords:words})
        : await supabase.rpc("discover_statement_projects",{target_import:importId});
      if(error)continue;
      const found=Number((data as any)?.candidate_count??0);
      count+=found;
      if(!first&&found>0)first=importId;
    }
    return {count,first};
  }

  async function applyResult(i:number,documentId:string,analysed:any){
    if(analysed?.statementImportId){
      const signals=action==="store_only"?{count:0,first:null}:await projectSignals(analysed);
      const base=analysed?.message||"Financial statement imported.";
      update(i,{state:"done",type:"Financial statement",message:`${base}${signals.count?` ${signals.count} project/site signal${signals.count===1?"":"s"} found.`:""}`,href:signals.first?`/statements/${signals.first}/projects`:`/statements/${analysed.statementImportId}`});
      return;
    }
    if(analysed?.projectId&&analysed?.status==="ready"){
      const {data,error}=await supabase.functions.invoke("auto-apply-project-document",{body:{documentId,projectId:analysed.projectId}});
      if(!error&&data?.applied){update(i,{state:"done",type:label(analysed?.type||hint),message:"Document analysed and applied to the project record.",href:`/projects/${analysed.projectId}`});return;}
      update(i,{state:"review",type:label(analysed?.type||hint),message:"The document was understood, but one confirmation is needed before it changes the official project record.",href:`/projects/${analysed.projectId}/documents`});return;
    }
    const review=analysed?.status==="needs_review";
    update(i,{state:review?"review":"done",type:label(String(analysed?.type||hint||"document")),message:analysed?.message||(review?"One decision is needed before this affects accounting.":"Record analysed and organised."),href:analysed?.projectId?`/projects/${analysed.projectId}/documents`:undefined});
  }

  async function run(){
    if(!files.length||busy)return;
    const words=keywords(keywordText);
    if(action==="analyse_keywords"&&!words.length){setSummary("Enter at least one project, site, client or narration keyword to search for.");return;}
    try{validateUploadBatch(files.length,files.reduce((n,f)=>n+f.size,0));}catch(e:any){setSummary(e?.message||"The selected upload batch is not valid.");return;}
    setBusy(true);setSummary("");setResults(files.map(f=>({name:f.name,state:"queued",message:"Waiting…"})));
    let done=0,review=0,duplicate=0,failed=0;
    try{
      const {data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Your session expired. Sign in again.");
      const {data:batch,error:batchError}=await supabase.from("intake_batches").insert({company_id:companyId,created_by:user.id,total_files:files.length}).select("id").single();if(batchError||!batch)throw new Error(batchError?.message||"Could not create upload batch.");
      for(let i=0;i<files.length;i++){
        const file=files[i];const ext=(file.name.split(".").pop()||"").toLowerCase();update(i,{state:"working",message:"Checking file…"});
        if(file.size>MAX){failed++;update(i,{state:"failed",message:"File is over the 20 MB limit."});continue;}
        if(!supported.includes(ext)){failed++;update(i,{state:"failed",message:"Unsupported file type."});continue;}
        if(file.type&&mime[ext]&&!mime[ext].includes(file.type)){failed++;update(i,{state:"failed",message:"File contents/type do not match the file extension."});continue;}
        const fileHash=await hash(file);
        const {data:existing}=await supabase.from("source_documents").select("id,project_id,document_type").eq("company_id",companyId).eq("file_hash",fileHash).limit(1).maybeSingle();
        if(existing){duplicate++;update(i,{state:"duplicate",message:"This exact file already exists. Nothing was counted twice.",href:existing.project_id?`/projects/${existing.project_id}/documents`:"/statements"});continue;}
        const path=`${companyId}/intake/${new Date().getUTCFullYear()}/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${safe(file.name)}`;
        update(i,{message:"Uploading securely…"});
        const {error:storageError}=await supabase.storage.from("universal-intake").upload(path,file,{contentType:file.type||undefined,upsert:false});if(storageError){failed++;update(i,{state:"failed",message:storageError.message});continue;}
        const selectedType=hint==="auto"?"other":hint;
        const {data:doc,error:docError}=await supabase.from("source_documents").insert({company_id:companyId,project_id:projectId||null,document_type:selectedType,file_name:file.name,storage_path:path,file_hash:fileHash,metadata:{bucket:"universal-intake",extension:ext,mime_type:file.type||null,original_size:file.size,intake_project_hint:projectId||null,intake_document_type_hint:hint,intake_action:action,intake_keywords:words},uploaded_by:user.id}).select("id").single();
        if(docError||!doc){await supabase.storage.from("universal-intake").remove([path]);failed++;update(i,{state:"failed",message:docError?.message||"Could not register the uploaded file."});continue;}
        const {data:item,error:itemError}=await supabase.from("intake_items").insert({batch_id:batch.id,company_id:companyId,document_id:doc.id,detected_project_id:projectId||null}).select("id").single();
        if(itemError||!item){await supabase.from("source_documents").delete().eq("id",doc.id);await supabase.storage.from("universal-intake").remove([path]);failed++;update(i,{state:"failed",message:itemError?.message||"Could not create intake item."});continue;}
        if(action==="store_only"){
          await supabase.from("intake_items").update({detected_type:selectedType,detected_project_id:projectId||null,confidence:100,status:"applied",suggested_action:{action:"stored_only"},message:"Stored as evidence without changing accounting."}).eq("id",item.id);
          done++;update(i,{state:"done",type:label(selectedType),message:"Stored safely as evidence. No accounting values were changed.",href:projectId?`/projects/${projectId}/documents`:undefined});continue;
        }
        update(i,{message:action==="analyse_keywords"?"Analysing and searching your keywords…":"Analysing the record…"});
        const {data:analysed,error:analysisError}=await supabase.functions.invoke("analyse-intake-document-v3",{body:{documentId:doc.id,batchId:batch.id,documentTypeHint:hint,action,keywords:words}});
        if(analysisError){const message=await readableFunctionError(analysisError);await supabase.from("intake_items").update({status:"needs_review",message}).eq("id",item.id);review++;update(i,{state:"review",message});continue;}
        await applyResult(i,doc.id,analysed);
        if(analysed?.status==="needs_review")review++;else done++;
      }
      await supabase.from("intake_batches").update({processed_files:done+review+duplicate,needs_review_count:review,status:failed===files.length?"failed":review?"needs_review":"completed",summary:{processed:done,needs_review:review,duplicates:duplicate,failed}}).eq("id",batch.id);
      setSummary(`${done} organised · ${review} need a decision · ${duplicate} already known · ${failed} failed`);
    }catch(e:any){setSummary(e?.message||"The upload batch could not be processed.");}finally{setBusy(false);}
  }

  const showKeywords=hint==="bank_statement"||action==="analyse_keywords";
  return <div className="universal-add">
    <section className="add-hero"><span>{onboarding?"ONBOARDING · START FROM YOUR RECORDS":"ADD TO CHARISMAK ACCOUNTING"}</span><h1>Bring the records you already use.</h1><p>Charismak is not tied to one bank or one document format. Tell it what you are uploading and what you want done, then review the accounting/project decisions that matter.</p></section>
    <section className="add-card">
      <label className="add-drop"><input type="file" multiple accept=".pdf,.csv,.xlsx,.xls,.docx,.jpg,.jpeg,.png,.webp" onChange={e=>setFiles(Array.from(e.target.files||[]))}/><strong>{files.length?`${files.length} file${files.length===1?"":"s"} selected`:"Choose files"}</strong><span>Up to 20 files · 20 MB each · 100 MB combined</span></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10,marginTop:12}}>
        <label style={fieldLabel}>What type of record is this?<select value={hint} onChange={e=>setHint(e.target.value as Hint)} style={control}><option value="auto">Let Charismak detect it</option><option value="bank_statement">Bank / financial statement</option><option value="invoice">Invoice</option><option value="bill">Supplier bill</option><option value="quotation">Quotation</option><option value="boq">BOQ</option><option value="receipt">Receipt / payment evidence</option><option value="other">Other project / company document</option></select></label>
        <label style={fieldLabel}>What should Charismak do?<select value={action} onChange={e=>setAction(e.target.value as Action)} style={control}><option value="analyse">Analyse and organise it</option><option value="analyse_keywords">Analyse + search my project keywords</option><option value="store_only">Keep as evidence only</option></select></label>
      </div>
      {showKeywords&&action!=="store_only"&&<label style={{...fieldLabel,marginTop:10}}>What should Charismak search for?<textarea value={keywordText} onChange={e=>setKeywordText(e.target.value)} rows={3} placeholder="Project/site/client/narration keywords — comma or new line separated" style={{...control,height:"auto",padding:10}}/><small style={{fontWeight:600,color:"#758695"}}>Matches are shown with transaction count and money in/out. You decide whether a signal becomes a project or links to one.</small></label>}
      <div className="add-hint-row"><label><span>Already know the project? <small>Optional</small></span><select value={projectId} onChange={e=>setProjectId(e.target.value)}><option value="">No project yet / let Charismak suggest</option>{projects.map(p=><option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label><button className="add-primary" disabled={!files.length||busy} onClick={run}>{busy?"Working on your records…":action==="store_only"?"Save evidence":"Upload & analyse"}</button></div>
    </section>
    {!!results.length&&<section className="intake-results"><div className="intake-summary"><h2>What Charismak did</h2><p>{summary||"Processing…"}</p></div>{results.map((r,i)=><article key={`${r.name}-${i}`} className={`intake-result ${r.state}`}><div className="intake-icon">{r.state==="done"?"✓":r.state==="review"?"?":r.state==="duplicate"?"↺":r.state==="failed"?"!":"…"}</div><div className="intake-copy"><strong>{r.name}</strong>{r.type&&<div className="intake-tags"><span>{r.type}</span></div>}<p>{r.message}</p></div>{r.href&&<Link href={r.href} className="intake-open">Open →</Link>}</article>)}</section>}
    {onboarding&&<section style={{marginTop:14,padding:14,border:"1px solid #dbe6ec",borderRadius:14,background:"#fff",display:"flex",gap:10,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}><div><b style={{color:"#173a54"}}>Records can keep processing while you continue setup.</b><p style={{margin:"3px 0 0",fontSize:11,color:"#6d7f8e"}}>Next, invite your team and assign their roles/project access.</p></div><Link href="/onboarding/team" className="primary-link-button">Continue to team setup →</Link></section>}
  </div>;
}
const fieldLabel={display:"grid",gap:5,fontSize:10,fontWeight:800,color:"#536879"} as const;
const control={height:42,border:"1px solid #ccd9e2",borderRadius:10,padding:"0 10px",background:"white",font:"inherit"} as const;
