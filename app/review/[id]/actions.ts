"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

async function context(){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!membership)redirect("/login");return{supabase,user,membership};
}
const slug=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,60)||"financial_account";

export async function confirmIntakeProject(formData:FormData){
  const {supabase,membership}=await context();const itemId=String(formData.get("item_id")||"");const projectId=String(formData.get("project_id")||"");
  const {data:item}=await supabase.from("intake_items").select("id,document_id,company_id").eq("id",itemId).eq("company_id",membership.company_id).maybeSingle();if(!item)throw new Error("Review item not found.");
  const {data:project}=await supabase.from("projects").select("id,name,project_code").eq("id",projectId).eq("company_id",membership.company_id).maybeSingle();if(!project)throw new Error("Choose a valid project.");
  await supabase.from("source_documents").update({project_id:projectId}).eq("id",item.document_id).eq("company_id",membership.company_id);
  const {data:analysed,error}=await supabase.functions.invoke("analyse-project-document",{body:{documentId:item.document_id}});
  await supabase.from("intake_items").update({detected_project_id:projectId,confidence:error?60:Math.max(85,Number(analysed?.confidence||0)),status:error?"needs_review":"ready",suggested_action:{action:"review_project_document",project_id:projectId,project_code:project.project_code},message:error?"Project confirmed, but document analysis still needs review.":`Project confirmed as ${project.name}. Review Charismak's interpretation.`}).eq("id",itemId);
  revalidatePath("/review");revalidatePath(`/projects/${projectId}/documents`);redirect(`/projects/${projectId}/documents`);
}

export async function confirmIntakeAccount(formData:FormData){
  const {supabase,user,membership}=await context();const itemId=String(formData.get("item_id")||"");const existingId=String(formData.get("financial_account_id")||"");const institution=String(formData.get("institution_name")||"").trim()||"Financial institution";const accountName=String(formData.get("account_name")||"").trim()||`${institution} Account`;const accountNumber=String(formData.get("account_number")||"").trim()||null;
  const {data:item}=await supabase.from("intake_items").select("id,document_id,company_id").eq("id",itemId).eq("company_id",membership.company_id).maybeSingle();if(!item)throw new Error("Review item not found.");
  let account:any=null;
  if(existingId){const r=await supabase.from("financial_accounts").select("id,institution_name,account_name,account_number_masked").eq("id",existingId).eq("company_id",membership.company_id).eq("is_active",true).maybeSingle();account=r.data;if(!account)throw new Error("Choose a valid financial account.");}
  else{const r=await supabase.from("financial_accounts").insert({company_id:membership.company_id,account_type:"bank",institution_name:institution,institution_key:slug(institution),account_name:accountName,account_number_masked:accountNumber,created_by:user.id}).select("id,institution_name,account_name,account_number_masked").single();if(r.error||!r.data)throw new Error(r.error?.message||"Could not create the financial account.");account=r.data;}
  const {data:doc}=await supabase.from("source_documents").select("id,metadata").eq("id",item.document_id).maybeSingle();
  await supabase.from("source_documents").update({document_type:"bank_statement",project_id:null,source_name:account.institution_name,metadata:{...(doc?.metadata as any),detected_institution:account.institution_name,detected_account_number:account.account_number_masked}}).eq("id",item.document_id);
  let {data:imp}=await supabase.from("statement_imports").select("id").eq("document_id",item.document_id).maybeSingle();
  if(!imp){const r=await supabase.from("statement_imports").insert({document_id:item.document_id,company_id:membership.company_id,financial_account_id:account.id,detected_institution_name:account.institution_name,detected_account_name:account.account_name,detected_account_number_masked:account.account_number_masked,status:"uploaded"}).select("id").single();if(r.error||!r.data)throw new Error(r.error?.message||"Could not create the statement import.");imp=r.data;}else await supabase.from("statement_imports").update({financial_account_id:account.id,detected_institution_name:account.institution_name,detected_account_name:account.account_name,detected_account_number_masked:account.account_number_masked}).eq("id",imp.id);
  const {data:analysed,error}=await supabase.functions.invoke("analyse-statement",{body:{importId:imp.id}});
  if(!error)await supabase.rpc("discover_statement_projects",{target_import:imp.id});
  await supabase.from("intake_items").update({detected_type:"bank_statement",detected_project_id:null,confidence:error?82:96,status:error?"needs_review":"applied",suggested_action:{action:"open_statement",statement_import_id:imp.id,institution:account.institution_name},message:error?(error.message||"The account is confirmed, but the statement still needs review."):`Statement processed. ${Number(analysed?.rows||0)} transaction rows found.`}).eq("id",itemId);
  revalidatePath("/review");revalidatePath("/statements");redirect(`/statements/${imp.id}`);
}

export async function deleteIntakeRecord(formData:FormData){
  const {supabase,membership}=await context();const itemId=String(formData.get("item_id")||"");
  const {data:item}=await supabase.from("intake_items").select("document_id").eq("id",itemId).eq("company_id",membership.company_id).maybeSingle();if(!item)throw new Error("Review item not found.");
  const {data:imp}=await supabase.from("statement_imports").select("id").eq("document_id",item.document_id).limit(1).maybeSingle();
  const result=imp?await supabase.rpc("delete_statement_import_with_audit",{target_import:imp.id}):await supabase.rpc("delete_source_document_with_audit",{target_document:item.document_id});if(result.error)throw result.error;
  const data:any=result.data||{};if(data.storage_path&&!data.virtual_sheet)await supabase.storage.from(data.bucket||"universal-intake").remove([data.storage_path]);
  revalidatePath("/review");revalidatePath("/documents");redirect("/review?deleted=1");
}
