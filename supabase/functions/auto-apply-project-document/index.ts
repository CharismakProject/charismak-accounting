import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
const n=(v:unknown)=>{const x=Number(v);return Number.isFinite(x)?x:null};

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return out({error:"POST required"},405);
  const auth=req.headers.get("Authorization")??"";
  const url=Deno.env.get("SUPABASE_URL")!;
  const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await sb.auth.getUser();
  if(!user)return out({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));
  const documentId=String(body?.documentId??"");
  const projectId=String(body?.projectId??"");
  if(!documentId||!projectId)return out({error:"documentId and projectId are required"},400);

  const [{data:intel,error:ie},{data:project,error:pe},{data:membership}]=await Promise.all([
    sb.from("project_document_intelligence").select("*").eq("document_id",documentId).eq("project_id",projectId).maybeSingle(),
    sb.from("projects").select("id,company_id,contract_value").eq("id",projectId).maybeSingle(),
    sb.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle(),
  ]);
  if(ie||!intel)return out({error:ie?.message||"Document interpretation is not ready."},422);
  if(pe||!project||!membership||membership.company_id!==project.company_id)return out({error:"Project access denied."},403);
  const confidence=Number(intel.confidence||0);
  if(confidence<92)return out({ok:true,applied:false,reason:"confidence",confidence,status:"needs_review"});

  const kind=String(intel.detected_subtype||"other");
  const text=String(intel.raw_text_preview||"").toLowerCase();
  const amount=n(intel.grand_total);
  const related=String(intel.related_reference||"").trim();
  let relatedExists=false;
  if(related){
    const {data:r}=await sb.from("project_document_intelligence").select("id").eq("project_id",projectId).eq("document_reference",related).limit(1).maybeSingle();
    relatedExists=Boolean(r);
  }

  const {data:existingApps}=await sb.from("project_document_applications").select("id,document_id,commercial_role").eq("project_id",projectId);
  const hasBase=(existingApps??[]).some((r:any)=>r.commercial_role==="base_scope"&&r.document_id!==documentId);

  let effect="reference_only",commercialRole="none",billingRole="none";
  if(kind==="fund_retirement")effect="funding_reconciliation_evidence";
  else if(kind==="fund_request")effect="funding_request_evidence";
  else if(kind==="receipt"||kind==="bill")effect="supporting_evidence";
  else if(kind==="boq"||kind==="quotation"){
    if(hasBase)return out({ok:true,applied:false,reason:"existing_base_scope",confidence,status:"needs_review"});
    effect="contract_baseline";commercialRole="base_scope";
  } else if(kind==="variation"){
    effect="variation";commercialRole=relatedExists?"variation":"additional_scope";
    if(/invoice/.test(text))billingRole="client_invoice";
  } else if(kind==="invoice"){
    effect="client_invoice";billingRole="client_invoice";
    if(/additional|new scope|extra work|revised scope|variation|additional works/.test(text))commercialRole=relatedExists?"variation":"additional_scope";
  } else {
    return out({ok:true,applied:false,reason:"unsupported_auto_effect",confidence,status:"needs_review"});
  }

  const {error:ae}=await sb.from("project_document_applications").upsert({
    company_id:project.company_id,project_id:projectId,document_id:documentId,effect,amount,
    document_nature:kind,commercial_role:commercialRole,billing_role:billingRole,
    approval_status:"documented",confidence,auto_interpreted:true,user_overridden:false,
    applied_data:{reference:intel.document_reference,related_reference:intel.related_reference,auto_rule:"safe_high_confidence_v1"},
    applied_by:user.id,applied_at:new Date().toISOString()
  },{onConflict:"document_id"});
  if(ae)return out({error:ae.message},500);

  if(commercialRole==="base_scope"&&amount!==null){
    const {error:e}=await sb.from("projects").update({contract_value:amount,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",projectId).eq("company_id",project.company_id);
    if(e)return out({error:e.message},500);
  }
  if(commercialRole==="variation"&&amount!==null){
    const code=String(intel.document_reference||`DOC-${documentId.slice(0,8)}`);
    const {data:existing}=await sb.from("project_variations").select("id").eq("project_id",projectId).eq("variation_code",code).limit(1).maybeSingle();
    if(existing){
      await sb.from("project_variations").update({title:intel.title||"Project variation",amount,description:intel.related_reference||null,updated_by:user.id,updated_at:new Date().toISOString()}).eq("id",existing.id);
    }else{
      await sb.from("project_variations").insert({project_id:projectId,variation_code:code,title:intel.title||"Project variation",description:intel.related_reference||null,variation_type:"addition",amount,status:"proposed",created_by:user.id,updated_by:user.id});
    }
  }
  await sb.from("project_document_intelligence").update({review_status:"confirmed",reviewed_by:user.id,reviewed_at:new Date().toISOString(),confirmed_effect:effect,confirmed_amount:amount,confirmation_notes:"Auto-applied from high-confidence construction interpretation",updated_at:new Date().toISOString()}).eq("document_id",documentId).eq("project_id",projectId);
  const {error:re}=await sb.rpc("refresh_project_commercial_position",{p_project_id:projectId});
  if(re)return out({error:re.message},500);

  return out({ok:true,applied:true,status:"applied",confidence,effect,commercialRole,billingRole,amount});
});
