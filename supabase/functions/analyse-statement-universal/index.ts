import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";
import { extractText, getDocumentProxy } from "npm:unpdf";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
type Identity={institution:string|null;institutionKey:string|null;accountName:string|null;accountNumber:string|null;accountType:"bank"|"fintech_wallet";confidence:number;evidence:string[]};
const compact=(v:unknown)=>String(v??"").replace(/\s+/g," ").trim();
const INSTITUTIONS=[
  ["Access Bank","access_bank","bank",/\baccess ?bank\b/i],["UBA","uba","bank",/\b(united bank for africa|uba plc|uba bank)\b/i],
  ["Zenith Bank","zenith_bank","bank",/\bzenith bank\b/i],["GTBank","gtbank","bank",/\b(guaranty trust bank|gtbank|gt bank)\b/i],
  ["FirstBank","firstbank","bank",/\b(first bank of nigeria|firstbank)\b/i],["Stanbic IBTC","stanbic_ibtc","bank",/\bstanbic ibtc\b/i],
  ["Fidelity Bank","fidelity_bank","bank",/\bfidelity bank\b/i],["FCMB","fcmb","bank",/\b(first city monument bank|fcmb)\b/i],
  ["Sterling Bank","sterling_bank","bank",/\bsterling bank\b/i],["Wema Bank","wema_bank","bank",/\b(wema bank|alat by wema)\b/i],
  ["Polaris Bank","polaris_bank","bank",/\bpolaris bank\b/i],["Ecobank","ecobank","bank",/\becobank\b/i],
  ["Union Bank","union_bank","bank",/\bunion bank\b/i],["Keystone Bank","keystone_bank","bank",/\bkeystone bank\b/i],
  ["ProvidusBank","providus_bank","bank",/\bprovidus ?bank\b/i],["Jaiz Bank","jaiz_bank","bank",/\bjaiz bank\b/i],
  ["TAJBank","tajbank","bank",/\btaj ?bank\b/i],["Lotus Bank","lotus_bank","bank",/\blotus bank\b/i],
  ["Globus Bank","globus_bank","bank",/\bglobus bank\b/i],["PremiumTrust Bank","premiumtrust_bank","bank",/\bpremiumtrust bank\b/i],
  ["OPay","opay","fintech_wallet",/\b(opay|owealth)\b/i],["Carbon","carbon","fintech_wallet",/\b(carbon|one finance)\b/i],
  ["Moniepoint","moniepoint","fintech_wallet",/\bmoniepoint\b/i],["PalmPay","palmpay","fintech_wallet",/\bpalmpay\b/i],
  ["Kuda","kuda","fintech_wallet",/\bkuda(?: microfinance)? bank\b|\bkuda\b/i],["FairMoney","fairmoney","fintech_wallet",/\bfairmoney\b/i],
] as const;
function cleanName(v:string|null){if(!v)return null;const x=compact(v).replace(/\b(account number|account no\.?|a\/c no\.?|currency|statement period|branch)\b.*$/i,"").replace(/^[\s:.-]+|[\s:.-]+$/g,"");return x.length>=3&&x.length<=120?x:null;}
function identity(text:string,filename:string,hints:any):Identity{
  const evidence:string[]=[];let institution:string|null=null,institutionKey:string|null=null,accountType:"bank"|"fintech_wallet"="bank",confidence=0;
  const header=compact(text).slice(0,18000);
  for(const [name,key,type,re] of INSTITUTIONS){if(re.test(header)){institution=name;institutionKey=key;accountType=type;confidence=.98;evidence.push(`Institution detected from document: ${name}`);break;}}
  if(!institution){const f=filename.replace(/[_-]+/g," ");for(const [name,key,type,re] of INSTITUTIONS){if(re.test(f)){institution=name;institutionKey=key;accountType=type;confidence=.72;evidence.push(`Institution inferred from filename: ${name}`);break;}}}
  if(!institution&&hints?.institution){institution=String(hints.institution).trim()||null;if(institution){institutionKey=institution.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_+|_+$/g,"");accountType=/opay|carbon|palmpay|moniepoint|kuda|fairmoney/i.test(institution)?"fintech_wallet":"bank";confidence=.62;evidence.push("Institution supplied as upload hint");}}
  let accountName:string|null=null;for(const re of [/(?:account\s*(?:name|holder)|a\/c\s*name|customer\s*name|wallet\s*name)\s*[:\-]\s*([^\n|]{3,120})/i,/(?:account\s*(?:name|holder)|a\/c\s*name|customer\s*name|wallet\s*name)\s+([A-Z][A-Z0-9 &'().,\-]{2,119})/i]){const m=text.match(re);const c=cleanName(m?.[1]??null);if(c){accountName=c;confidence=Math.max(confidence,.94);evidence.push("Account holder/name detected from statement header");break;}}
  if(!accountName&&hints?.account_name){accountName=String(hints.account_name).trim()||null;if(accountName){confidence=Math.max(confidence,.62);evidence.push("Account name supplied as upload hint");}}
  let accountNumber:string|null=null;const m=text.match(/(?:account\s*(?:number|no\.?|#)|a\/c\s*(?:number|no\.?|#)|wallet\s*(?:number|id)|account\s*id)\s*[:\-]?\s*([*xX•\d\s-]{6,24})/i);if(m?.[1]){const raw=m[1].replace(/[\s-]+/g,"");const digits=raw.replace(/\D/g,"");if(digits.length>=4&&digits.length<=12){accountNumber=raw;confidence=Math.max(confidence,.96);evidence.push("Account number/identifier detected from statement header");}}
  if(!accountNumber&&hints?.account_number){accountNumber=String(hints.account_number).trim()||null;if(accountNumber){confidence=Math.max(confidence,.64);evidence.push("Account number supplied as upload hint");}}
  return{institution,institutionKey,accountName,accountNumber,accountType,confidence,evidence};
}
async function extractIdentityText(bytes:Uint8Array,ext:string){
  if(["xlsx","xls","csv"].includes(ext)){const wb=XLSX.read(bytes,{type:"array",raw:false});const parts:string[]=[];for(const sn of wb.SheetNames.slice(0,4)){parts.push(sn);const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{header:1,defval:"",raw:false,blankrows:false}) as unknown[][];for(const row of rows.slice(0,60))parts.push(row.map(compact).filter(Boolean).join(" | "));}return parts.join("\n").slice(0,24000);}
  if(ext==="pdf"){const doc=await getDocumentProxy(bytes);const ex=await extractText(doc,{mergePages:true});return String(ex.text||"").slice(0,24000);}
  return "";
}
async function ensureAccount(sb:any,userId:string,companyId:string,id:Identity){
  if(id.accountNumber){const {data}=await sb.from("financial_accounts").select("id").eq("company_id",companyId).eq("account_number_masked",id.accountNumber).eq("is_active",true).limit(2);if((data??[]).length===1)return{id:data[0].id,created:false};}
  if(id.institution){const {data}=await sb.from("financial_accounts").select("id,account_name").eq("company_id",companyId).eq("account_type",id.accountType).eq("is_active",true).ilike("institution_name",id.institution).limit(20);const matches=data??[];if(id.accountName){const exact=matches.find((r:any)=>String(r.account_name||"").trim().toLowerCase()===id.accountName!.toLowerCase());if(exact)return{id:exact.id,created:false};}if(matches.length===1)return{id:matches[0].id,created:false};}
  const {data,error}=await sb.from("financial_accounts").insert({company_id:companyId,account_type:id.accountType,institution_name:id.institution,institution_key:id.institutionKey,account_name:id.accountName||(id.institution?`${id.institution} Account`:"Imported account"),account_number_masked:id.accountNumber,created_by:userId}).select("id").single();if(error)throw new Error(`Could not register detected account: ${error.message}`);return{id:data.id,created:true};
}
Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});if(req.method!=="POST")return out({error:"POST required"},405);
  const auth=req.headers.get("Authorization")??"";const url=Deno.env.get("SUPABASE_URL")!;const anon=Deno.env.get("SUPABASE_ANON_KEY")!;const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await sb.auth.getUser();if(!user)return out({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));const importId=String(body?.importId??"");if(!importId)return out({error:"importId is required"},400);
  const {data:si,error}=await sb.from("statement_imports").select("id,company_id,financial_account_id,detected_institution_name,detected_account_name,detected_account_number_masked,document:source_documents(id,file_name,storage_path,source_name,metadata)").eq("id",importId).single();if(error||!si)return out({error:error?.message||"Statement not found"},404);
  const doc=Array.isArray((si as any).document)?(si as any).document[0]:(si as any).document;const ext=String(doc?.metadata?.extension??doc?.file_name?.split(".").pop()??"").toLowerCase();
  try{
    let detected:Identity|null=null;let accountId=(si as any).financial_account_id as string|null;let accountCreated=false;
    if(!accountId){const buckets=[String(doc?.metadata?.bucket??""),"financial-documents","universal-intake"].filter((v,i,a)=>v&&a.indexOf(v)===i);let blob:Blob|null=null;let msg="Stored statement could not be downloaded";for(const bucket of buckets){const r=await sb.storage.from(bucket).download(doc.storage_path);if(r.data){blob=r.data;break;}if(r.error)msg=r.error.message;}if(!blob)throw new Error(msg);const bytes=new Uint8Array(await blob.arrayBuffer());const text=await extractIdentityText(bytes,ext);const hints={institution:(si as any).detected_institution_name,account_name:(si as any).detected_account_name,account_number:(si as any).detected_account_number_masked,...(doc?.metadata?.user_hints??{})};detected=identity(text,doc?.file_name??"",hints);const account=await ensureAccount(sb,user.id,(si as any).company_id,detected);accountId=account.id;accountCreated=account.created;await sb.from("statement_imports").update({financial_account_id:accountId,detected_institution_name:detected.institution,detected_account_name:detected.accountName,detected_account_number_masked:detected.accountNumber,detected_as_new_account:accountCreated,updated_at:new Date().toISOString()}).eq("id",importId);const meta=(doc?.metadata&&typeof doc.metadata==="object")?doc.metadata:{};await sb.from("source_documents").update({source_name:detected.institution||doc?.source_name||null,metadata:{...meta,detected_identity:detected,identity_analyser:"universal_identity_v1"}}).eq("id",doc.id);}
    const response=await fetch(`${url}/functions/v1/analyse-statement`,{method:"POST",headers:{Authorization:auth,apikey:anon,"content-type":"application/json"},body:JSON.stringify({importId})});const analysis=await response.json().catch(()=>({error:`Statement analyser returned ${response.status}`}));if(!response.ok||analysis?.error)return out({error:analysis?.error||`Statement analyser returned ${response.status}`},response.status>=400?response.status:500);
    if(!detected){const {data:latest}=await sb.from("statement_imports").select("detected_institution_name,detected_account_name,detected_account_number_masked,financial_account_id").eq("id",importId).single();detected={institution:latest?.detected_institution_name??null,institutionKey:null,accountName:latest?.detected_account_name??null,accountNumber:latest?.detected_account_number_masked??null,accountType:"bank",confidence:.7,evidence:["Existing account link reused"]};accountId=latest?.financial_account_id??accountId;}
    return out({...analysis,ok:true,identity:detected,financialAccountId:accountId,accountCreated});
  }catch(e){return out({error:e instanceof Error?e.message:"Universal statement analysis failed"},500);}
});