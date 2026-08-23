import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
const hex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(b=>b.toString(16).padStart(2,"0")).join("");
const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return out({error:"POST required"},405);
  const auth=req.headers.get("Authorization")??"";
  const url=Deno.env.get("SUPABASE_URL")!;const anon=Deno.env.get("SUPABASE_ANON_KEY")!;const serviceRole=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if(!serviceRole)return out({error:"Server duplicate protection is not configured."},500);
  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await userClient.auth.getUser();if(!user)return out({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));const companyId=String(body?.companyId??"");const bucket="universal-intake";const storagePath=String(body?.storagePath??"").replace(/^\/+/,"");
  if(!companyId||!storagePath)return out({error:"companyId and storagePath are required"},400);
  if(!storagePath.startsWith(`${companyId}/`))return out({error:"Invalid upload path."},403);
  const {data:membership}=await userClient.from("company_memberships").select("id").eq("company_id",companyId).eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!membership)return out({error:"Access denied"},403);
  const admin=createClient(url,serviceRole,{auth:{persistSession:false,autoRefreshToken:false}});
  let blob:Blob|null=null;let lastError="";
  for(let attempt=0;attempt<4;attempt++){
    const result=await admin.storage.from(bucket).download(storagePath);
    if(!result.error&&result.data){blob=result.data;break;}
    lastError=result.error?.message||"Object not available";
    if(attempt<3)await sleep(250*(attempt+1));
  }
  if(!blob)return out({error:`Could not read the uploaded file for duplicate protection. ${lastError}`},409);
  const bytes=await blob.arrayBuffer();const digest=await crypto.subtle.digest("SHA-256",bytes);const fileHash=hex(digest);
  const {data:existing,error:ee}=await admin.from("source_documents").select("id,project_id,document_type,file_name,uploaded_at").eq("company_id",companyId).eq("file_hash",fileHash).order("uploaded_at",{ascending:true}).limit(1).maybeSingle();
  if(ee)return out({error:ee.message},500);
  return out({ok:true,fileHash,size:bytes.byteLength,duplicate:Boolean(existing),existing:existing??null,checkedBy:"server_sha256_v4"});
});
