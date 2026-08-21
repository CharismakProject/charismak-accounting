import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});

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
  const batchId=String(body?.batchId??"");
  if(!documentId||!batchId)return out({error:"documentId and batchId are required"},400);
  const {data:doc,error:de}=await sb.from("source_documents").select("id,company_id,project_id,file_name,metadata").eq("id",documentId).single();
  if(de||!doc)return out({error:de?.message||"Document not found"},404);
  const ext=String((doc.metadata as any)?.extension??doc.file_name.split(".").pop()??"").toLowerCase();
  if(!["jpg","jpeg","png","webp"].includes(ext))return out({error:"This analyser is for image documents only."},400);
  const {data:item,error:ie}=await sb.from("intake_items").select("id").eq("document_id",documentId).eq("batch_id",batchId).maybeSingle();
  if(ie||!item)return out({error:ie?.message||"Intake item not found"},404);

  const {error:ve}=await sb.from("visual_document_reviews").upsert({
    company_id:doc.company_id,
    source_document_id:doc.id,
    extraction_status:"needs_visual_review",
    extraction_engine:"provider_pending",
    extracted_fields:{project_hint:doc.project_id??null,file_name:doc.file_name,extension:ext},
    updated_at:new Date().toISOString(),
  },{onConflict:"source_document_id"});
  if(ve)return out({error:ve.message},500);

  await sb.from("intake_items").update({
    detected_type:"visual_financial_document",
    detected_project_id:doc.project_id,
    confidence:100,
    status:"needs_review",
    suggested_action:{action:"visual_review",document_id:doc.id},
    message:"Image evidence is stored safely. It is queued for visual extraction/review and will not be posted to the ledger until its meaning is confirmed.",
  }).eq("id",item.id);

  return out({
    ok:true,
    type:"visual financial document",
    status:"needs_review",
    projectId:doc.project_id,
    message:"Image evidence stored and queued for visual extraction/review. Nothing was posted or counted twice.",
    href:"/accounting",
  });
});
