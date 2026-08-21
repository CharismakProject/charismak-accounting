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

  const {data:project,error:pe}=await sb.from("projects").select("id,company_id").eq("id",projectId).maybeSingle();
  if(pe||!project)return out({error:pe?.message||"Project not found."},404);

  const {data:membership}=await sb.from("company_memberships")
    .select("company_id,is_owner")
    .eq("company_id",project.company_id)
    .eq("user_id",user.id)
    .eq("status","active")
    .maybeSingle();
  if(!membership)return out({error:"Project access denied."},403);

  const {data:intel,error:ie}=await sb.from("project_document_intelligence")
    .select("*")
    .eq("document_id",documentId)
    .eq("project_id",projectId)
    .maybeSingle();
  if(ie||!intel)return out({error:ie?.message||"Document interpretation is not ready."},422);

  const confidence=Number(intel.confidence||0);
  if(confidence<92)return out({ok:true,applied:false,reason:"confidence",confidence,status:"needs_review"});

  const kind=String(intel.detected_subtype||"other");
  const amount=n(intel.grand_total);

  // Commercial documents are deliberately review-first. A supplier invoice must not
  // become a client invoice, and a vendor quotation/BOQ must not overwrite the main
  // contract simply because extraction confidence is high.
  if(["invoice","quotation","boq","variation"].includes(kind)){
    await sb.from("project_document_intelligence").update({
      review_status:"pending",
      confirmation_notes:"Commercial/accounting direction requires confirmation before application.",
      updated_at:new Date().toISOString()
    }).eq("document_id",documentId).eq("project_id",projectId);
    return out({
      ok:true,
      applied:false,
      reason:"commercial_confirmation_required",
      confidence,
      status:"needs_review",
      kind,
      amount,
      message:"Document understood. Confirm whether it is client-side, supplier-side, a contract baseline, or a variation before it changes the accounts."
    });
  }

  let effect:string;
  if(kind==="fund_retirement")effect="funding_reconciliation_evidence";
  else if(kind==="fund_request")effect="funding_request_evidence";
  else if(kind==="receipt"||kind==="bill")effect="supporting_evidence";
  else return out({ok:true,applied:false,reason:"unsupported_auto_effect",confidence,status:"needs_review"});

  const {error:ae}=await sb.from("project_document_applications").upsert({
    company_id:project.company_id,
    project_id:projectId,
    document_id:documentId,
    effect,
    amount,
    document_nature:kind,
    commercial_role:"none",
    billing_role:"none",
    approval_status:"documented",
    confidence,
    auto_interpreted:true,
    user_overridden:false,
    applied_data:{reference:intel.document_reference,related_reference:intel.related_reference,auto_rule:"evidence_only_v2"},
    applied_by:user.id,
    applied_at:new Date().toISOString()
  },{onConflict:"document_id"});
  if(ae)return out({error:ae.message},500);

  await sb.from("project_document_intelligence").update({
    review_status:"confirmed",
    reviewed_by:user.id,
    reviewed_at:new Date().toISOString(),
    confirmed_effect:effect,
    confirmed_amount:amount,
    confirmation_notes:"Auto-attached as evidence only; no contract value, revenue, payable or expense was created.",
    updated_at:new Date().toISOString()
  }).eq("document_id",documentId).eq("project_id",projectId);

  const {error:re}=await sb.rpc("refresh_project_commercial_position",{p_project_id:projectId});
  if(re)return out({error:re.message},500);

  return out({ok:true,applied:true,status:"applied",confidence,effect,commercialRole:"none",billingRole:"none",amount});
});
