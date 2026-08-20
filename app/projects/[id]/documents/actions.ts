"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";

const allowedExtensions=new Set(["pdf","xlsx","xls","csv","docx","jpg","jpeg","png","webp"]);
const safeFileName=(name:string)=>name.replace(/[^a-zA-Z0-9._-]/g,"_");
const num=(v:FormDataEntryValue|null)=>{const n=Number(v??"");return Number.isFinite(n)?n:null};

async function context(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("id,company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership)redirect("/login?message=No+active+company+membership");
  return{supabase,user,membership};
}

async function fileHash(bytes:Uint8Array){
  const digest=await crypto.subtle.digest("SHA-256",bytes);
  return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

export async function uploadProjectDocuments(formData:FormData){
  const {supabase,user,membership}=await context();
  const projectId=String(formData.get("project_id")||"");
  const {data:project}=await supabase.from("projects").select("id,company_id").eq("id",projectId).eq("company_id",membership.company_id).maybeSingle();
  if(!project)throw new Error("Project not found or you do not have access.");
  const files=formData.getAll("documents").filter((v):v is File=>v instanceof File&&v.size>0);
  if(!files.length)throw new Error("Choose at least one project document.");
  if(files.length>10)throw new Error("Upload up to 10 documents in one batch.");
  let uploaded=0,analysed=0,failed=0,duplicates=0;
  for(const file of files){
    if(file.size>20*1024*1024){failed++;continue}
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    if(!allowedExtensions.has(ext)){failed++;continue}
    const bytes=new Uint8Array(await file.arrayBuffer());
    const hash=await fileHash(bytes);
    const {data:existing}=await supabase.from("source_documents").select("id").eq("company_id",membership.company_id).eq("project_id",projectId).eq("file_hash",hash).limit(1).maybeSingle();
    if(existing){duplicates++;continue}
    const path=`${membership.company_id}/${projectId}/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${safeFileName(file.name)}`;
    const {error:storageError}=await supabase.storage.from("project-documents").upload(path,bytes,{contentType:file.type||undefined,upsert:false});
    if(storageError){failed++;continue}
    const {data:doc,error:docError}=await supabase.from("source_documents").insert({company_id:membership.company_id,project_id:projectId,document_type:"other",file_name:file.name,storage_path:path,file_hash:hash,metadata:{bucket:"project-documents",extension:ext,mime_type:file.type||null,original_size:file.size,upload_method:"project_document_batch"},uploaded_by:user.id}).select("id").single();
    if(docError||!doc){await supabase.storage.from("project-documents").remove([path]);failed++;continue}
    uploaded++;
    const {error:analysisError}=await supabase.functions.invoke("analyse-project-document",{body:{documentId:doc.id}});
    if(analysisError)failed++;else analysed++;
  }
  revalidatePath(`/projects/${projectId}`);revalidatePath(`/projects/${projectId}/documents`);
  redirect(`/projects/${projectId}/documents?uploaded=${uploaded}&analysed=${analysed}&failed=${failed}&duplicates=${duplicates}`);
}

export async function retryProjectDocumentAnalysis(formData:FormData){
  const {supabase}=await context();
  const projectId=String(formData.get("project_id")||"");
  const documentId=String(formData.get("document_id")||"");
  const {error}=await supabase.functions.invoke("analyse-project-document",{body:{documentId}});
  revalidatePath(`/projects/${projectId}/documents`);
  redirect(`/projects/${projectId}/documents?retry=${error?"failed":"ok"}`);
}

export async function confirmProjectDocument(formData:FormData){
  const {supabase,user,membership}=await context();
  const projectId=String(formData.get("project_id")||"");
  const documentId=String(formData.get("document_id")||"");
  const effect=String(formData.get("effect")||"reference_only");
  const allowed=new Set(["reference_only","contract_baseline","client_invoice","variation","internal_cost_budget","funding_reconciliation_evidence","funding_request_evidence","supporting_evidence"]);
  if(!allowed.has(effect))throw new Error("Unsupported document effect.");
  const {data:intel}=await supabase.from("project_document_intelligence").select("*,document:source_documents(id,file_name)").eq("document_id",documentId).eq("project_id",projectId).maybeSingle();
  if(!intel)throw new Error("Document analysis not found for this project.");
  const amount=num(formData.get("confirmed_amount"))??Number(intel.grand_total??0)||null;
  const notes=String(formData.get("confirmation_notes")||"").trim()||null;
  const importRows=formData.get("import_line_items")==="on";
  const {error:applyError}=await supabase.from("project_document_applications").upsert({company_id:membership.company_id,project_id:projectId,document_id:documentId,effect,amount,applied_data:{detected_subtype:intel.detected_subtype,reference:intel.document_reference,related_reference:intel.related_reference,import_line_items:importRows},applied_by:user.id,applied_at:new Date().toISOString()},{onConflict:"document_id"});
  if(applyError)throw new Error(`You can review this document, but you do not have authority to apply it: ${applyError.message}`);

  const lines=Array.isArray(intel.extracted_line_items)?intel.extracted_line_items:[];
  if(effect==="contract_baseline"&&amount!==null){
    const {error:e1}=await supabase.from("projects").update({contract_value:amount,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",projectId).eq("company_id",membership.company_id);if(e1)throw new Error(e1.message);
    const {error:e2}=await supabase.from("project_financial_summaries").update({expected_contract_revenue:amount,updated_at:new Date().toISOString()}).eq("project_id",projectId);if(e2)throw new Error(e2.message);
    if(importRows&&lines.length){await supabase.from("project_contract_items").delete().eq("project_id",projectId).eq("source_document_id",documentId);const rows=lines.filter((r:any)=>r?.description&&Number(r?.amount||0)>0).slice(0,200).map((r:any,i:number)=>({company_id:membership.company_id,project_id:projectId,source_document_id:documentId,section_name:r.section||null,item_code:r.item_code||null,description:String(r.description).slice(0,1000),unit:r.unit||null,quantity:r.quantity??null,rate:r.rate??null,amount:r.amount??null,sort_order:i+1}));if(rows.length){const {error}=await supabase.from("project_contract_items").insert(rows);if(error)throw new Error(error.message)}}
  }

  if(effect==="client_invoice"&&amount!==null){
    const {data:apps}=await supabase.from("project_document_applications").select("amount").eq("project_id",projectId).eq("effect","client_invoice");
    const documentInvoiceTotal=(apps??[]).reduce((s:number,r:any)=>s+Number(r.amount||0),0);
    const {data:summary}=await supabase.from("project_financial_summaries").select("invoiced_amount").eq("project_id",projectId).maybeSingle();
    const next=Math.max(Number(summary?.invoiced_amount||0),documentInvoiceTotal);
    const {error}=await supabase.from("project_financial_summaries").update({invoiced_amount:next,updated_at:new Date().toISOString()}).eq("project_id",projectId);if(error)throw new Error(error.message);
  }

  if(effect==="variation"&&amount!==null){
    const code=String(intel.document_reference||`DOC-${documentId.slice(0,8)}`);
    const {data:existing}=await supabase.from("project_variations").select("id").eq("project_id",projectId).eq("variation_code",code).limit(1).maybeSingle();
    if(existing){const {error}=await supabase.from("project_variations").update({title:intel.title||"Document variation",amount,description:notes||intel.related_reference||null,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",existing.id);if(error)throw new Error(error.message)}else{const {error}=await supabase.from("project_variations").insert({project_id:projectId,variation_code:code,title:intel.title||"Document variation",description:notes||intel.related_reference||null,variation_type:"addition",amount,status:"proposed",created_by:user.id,updated_by:user.id});if(error)throw new Error(error.message)}
  }

  if(effect==="internal_cost_budget"&&amount!==null){
    const {error:e1}=await supabase.from("projects").update({internal_cost_budget:amount,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",projectId).eq("company_id",membership.company_id);if(e1)throw new Error(e1.message);
    const {error:e2}=await supabase.from("project_financial_summaries").update({original_budget:amount,revised_budget:amount,updated_at:new Date().toISOString()}).eq("project_id",projectId);if(e2)throw new Error(e2.message);
    if(importRows&&lines.length){await supabase.from("project_budget_items").delete().eq("project_id",projectId).eq("source_document_id",documentId);const rows=lines.filter((r:any)=>r?.description&&Number(r?.amount||0)>0).slice(0,200).map((r:any,i:number)=>({project_id:projectId,cost_code:r.item_code||null,work_section:r.section||null,description:String(r.description).slice(0,1000),original_budget:Number(r.amount||0),revised_budget:Number(r.amount||0),forecast_remaining:Number(r.amount||0),source_document_id:documentId,sort_order:i+1,created_by:user.id,updated_by:user.id}));if(rows.length){const {error}=await supabase.from("project_budget_items").insert(rows);if(error)throw new Error(error.message)}}
  }

  const {error:reviewError}=await supabase.from("project_document_intelligence").update({review_status:"confirmed",reviewed_by:user.id,reviewed_at:new Date().toISOString(),confirmed_effect:effect,confirmed_amount:amount,confirmation_notes:notes,updated_at:new Date().toISOString()}).eq("document_id",documentId).eq("project_id",projectId);if(reviewError)throw new Error(reviewError.message);
  revalidatePath(`/projects/${projectId}`);revalidatePath(`/projects/${projectId}/documents`);revalidatePath("/");
  redirect(`/projects/${projectId}/documents?confirmed=${encodeURIComponent(documentId)}`);
}
