"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";

const numeric=(v:any)=>{const n=Number(v);return Number.isFinite(n)?n:null};

async function authContext(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership)redirect("/login");
  return{supabase,user,membership};
}

function interpretation(intel:any,hasRelated:boolean){
  const kind=String(intel.detected_subtype||"other");
  const text=String(intel.raw_text_preview||"").toLowerCase();
  let documentNature=kind;
  let commercialRole="none";
  let billingRole="none";
  let effect="reference_only";
  if(kind==="boq"||kind==="quotation"){commercialRole="base_scope";effect="contract_baseline"}
  if(kind==="variation"){commercialRole=hasRelated?"variation":"additional_scope";billingRole=/invoice/.test(text)?"client_invoice":"none";effect=hasRelated?"variation":"contract_baseline"}
  if(kind==="invoice"){
    billingRole="client_invoice";effect="client_invoice";
    if(/additional|new scope|extra work|revised scope|variation/.test(text))commercialRole=hasRelated?"variation":"additional_scope";
  }
  if(kind==="fund_retirement"){effect="funding_reconciliation_evidence";commercialRole="none"}
  if(kind==="fund_request"){effect="funding_request_evidence";commercialRole="none"}
  if(kind==="receipt"||kind==="bill")effect="supporting_evidence";
  return{documentNature,commercialRole,billingRole,effect};
}

export async function acceptDocumentInterpretation(formData:FormData){
  const {supabase,user,membership}=await authContext();
  const projectId=String(formData.get("project_id")||"");
  const documentId=String(formData.get("document_id")||"");
  const {data:intel}=await supabase.from("project_document_intelligence").select("*").eq("project_id",projectId).eq("document_id",documentId).maybeSingle();
  if(!intel)throw new Error("Document interpretation is not ready yet.");
  const amount=numeric(intel.grand_total);
  const related=String(intel.related_reference||"");
  let hasRelated=false;
  if(related){
    const {data:relatedDoc}=await supabase.from("project_document_intelligence").select("id").eq("project_id",projectId).eq("document_reference",related).limit(1).maybeSingle();
    hasRelated=Boolean(relatedDoc);
  }
  const meaning=interpretation(intel,hasRelated);
  const approvalStatus="documented";
  const {error:applyError}=await supabase.from("project_document_applications").upsert({
    company_id:membership.company_id,project_id:projectId,document_id:documentId,
    effect:meaning.effect,amount,
    document_nature:meaning.documentNature,commercial_role:meaning.commercialRole,billing_role:meaning.billingRole,
    approval_status:approvalStatus,confidence:intel.confidence,auto_interpreted:true,user_overridden:false,
    applied_data:{reference:intel.document_reference,related_reference:intel.related_reference,detected_subtype:intel.detected_subtype},
    applied_by:user.id,applied_at:new Date().toISOString()
  },{onConflict:"document_id"});
  if(applyError)throw new Error(applyError.message);

  if(meaning.commercialRole==="base_scope"&&amount!==null){
    const {error}=await supabase.from("projects").update({contract_value:amount,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",projectId).eq("company_id",membership.company_id);if(error)throw new Error(error.message);
  }
  if(meaning.commercialRole==="variation"&&amount!==null){
    const code=String(intel.document_reference||`DOC-${documentId.slice(0,8)}`);
    const {data:existing}=await supabase.from("project_variations").select("id").eq("project_id",projectId).eq("variation_code",code).limit(1).maybeSingle();
    if(existing)await supabase.from("project_variations").update({title:intel.title||"Project variation",amount,description:intel.related_reference||null,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",existing.id);
    else await supabase.from("project_variations").insert({project_id:projectId,variation_code:code,title:intel.title||"Project variation",description:intel.related_reference||null,variation_type:"addition",amount,status:"proposed",created_by:user.id,updated_by:user.id});
  }
  await supabase.from("project_document_intelligence").update({review_status:"confirmed",reviewed_by:user.id,reviewed_at:new Date().toISOString(),confirmed_effect:meaning.effect,confirmed_amount:amount,confirmation_notes:"Accepted suggested construction interpretation",updated_at:new Date().toISOString()}).eq("document_id",documentId).eq("project_id",projectId);
  await supabase.rpc("refresh_project_commercial_position",{p_project_id:projectId});
  revalidatePath(`/projects/${projectId}`);revalidatePath(`/projects/${projectId}/documents`);revalidatePath("/projects");revalidatePath("/");
  redirect(`/projects/${projectId}/documents?accepted=${encodeURIComponent(documentId)}`);
}
