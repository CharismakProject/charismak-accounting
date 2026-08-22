import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return out({error:"POST required"},405);
  const auth=req.headers.get("Authorization")??"";const url=Deno.env.get("SUPABASE_URL")!;const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await sb.auth.getUser();if(!user)return out({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));const companyId=String(body?.companyId??"");const bucket=String(body?.bucket??"universal-intake");const storagePath=String(body?.storagePath??"");
  if(!companyId||!storagePath)return out({error:"companyId and storagePath are required"},400);
  const {data:membership}=await sb.from("company_memberships").select("id").eq("company_id",companyId).eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!membership)return out({error:"Access denied"},403);
  const {data:blob,error:be}=await sb.storage.from(bucket).download(storagePath);if(be||!blob)return out({error:be?.message||"Could not read uploaded file for duplicate protection."},400);
  const bytes=await blob.arrayBuffer();const digest=await crypto.subtle.digest("SHA-256",bytes);const fileHash=hex(digest);
  const {data:existing,error:ee}=await sb.from("source_documents").select("id,project_id,document_type,file_name,created_at").eq("company_id",companyId).eq("file_hash",fileHash).order("created_at",{ascending:true}).limit(1).maybeSingle();if(ee)return out({error:ee.message},400);
  return out({ok:true,fileHash,size:bytes.byteLength,duplicate:Boolean(existing),existing:existing??null});
});
