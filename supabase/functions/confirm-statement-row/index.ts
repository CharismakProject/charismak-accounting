import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
const PROJECT=new Set(["project_expense","project_funding"]);
function inferParty(counterparty:string|null,narration:string|null){const direct=String(counterparty||"").trim();if(direct)return direct;const m=String(narration||"").match(/transfer\s+(?:to|from)\s+([^|]+)/i);return m?.[1]?.trim()||""}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return out({error:"POST required"},405);
  const auth=req.headers.get("Authorization")??"";const url=Deno.env.get("SUPABASE_URL")!;const anon=Deno.env.get("SUPABASE_ANON_KEY")!;const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await sb.auth.getUser();if(!user)return out({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));const rowId=String(body?.statementRowId??"");const importId=String(body?.importId??"");const classification=String(body?.classification??"unknown");const projectId=body?.projectId?String(body.projectId):null;const category=body?.categoryName?String(body.categoryName).trim():null;
  if(!rowId||!importId)return out({error:"Statement row and import are required."},400);if(PROJECT.has(classification)&&!projectId)return out({error:"Choose a project first."},400);
  const [{data:row,error:re},{data:statement,error:se},{data:existing}]=await Promise.all([
    sb.from("statement_rows").select("id,import_id,transaction_date,value_date,narration,reference,counterparty,signed_amount,running_balance,normalized_fingerprint").eq("id",rowId).eq("import_id",importId).single(),
    sb.from("statement_imports").select("id,company_id,financial_account_id,rows_pending_review").eq("id",importId).single(),
    sb.from("statement_row_transaction_links").select("canonical_transaction_id").eq("statement_row_id",rowId).eq("is_primary",true).limit(1).maybeSingle(),
  ]);
  if(re||!row)return out({error:re?.message||"Statement row not found."},404);if(se||!statement)return out({error:se?.message||"Statement not found."},404);if(existing?.canonical_transaction_id)return out({ok:true,alreadyConfirmed:true});if(!row.transaction_date||row.signed_amount===null)return out({error:"Transaction date and amount are required."},422);
  const {data:membership}=await sb.from("company_memberships").select("id").eq("company_id",statement.company_id).eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!membership)return out({error:"Company access denied."},403);
  if(projectId){const {data:p}=await sb.from("projects").select("id").eq("id",projectId).eq("company_id",statement.company_id).maybeSingle();if(!p)return out({error:"Project is not available to this account."},403)}
  const now=new Date().toISOString();const personal=classification==="personal_non_business",transfer=classification==="internal_transfer";
  const {data:tx,error:te}=await sb.from("canonical_transactions").insert({company_id:statement.company_id,financial_account_id:statement.financial_account_id,project_id:PROJECT.has(classification)?projectId:null,transaction_date:row.transaction_date,value_date:row.value_date,narration:row.narration,reference:row.reference,counterparty:row.counterparty,signed_amount:row.signed_amount,running_balance:row.running_balance,normalized_fingerprint:row.normalized_fingerprint,classification,transaction_type:classification,category_name:classification==="project_expense"?(category||"Uncategorised"):null,is_personal_non_business:personal,is_internal_transfer:transfer,is_posted:true,posted_at:now,status:"confirmed",created_by:user.id,confirmed_by:user.id,confirmed_at:now}).select("id").single();if(te||!tx)return out({error:te?.message||"Could not post transaction."},500);
  const {error:le}=await sb.from("statement_row_transaction_links").insert({statement_row_id:rowId,canonical_transaction_id:tx.id,confidence:100,reason:{matched_by:"user_confirmation",classification,channel:"native_or_api"},is_primary:true});if(le)return out({error:le.message},500);
  if(PROJECT.has(classification)&&projectId){const party=inferParty(row.counterparty,row.narration);if(party)await sb.rpc("learn_project_relationship",{target_project:projectId,party_name:party,relationship_kind:classification==="project_funding"?"sponsor":"vendor",classification_hint:classification,category_hint:classification==="project_expense"?(category||"Uncategorised"):null,source_label:"confirmed_statement_transaction",learned_transaction:tx.id});const {error:fe}=await sb.rpc("refresh_project_financial_summary",{target_project:projectId});if(fe)return out({error:fe.message},500)}
  await sb.from("statement_imports").update({rows_pending_review:Math.max(Number(statement.rows_pending_review??0)-1,0),updated_at:now}).eq("id",importId);
  return out({ok:true,transactionId:tx.id});
});
