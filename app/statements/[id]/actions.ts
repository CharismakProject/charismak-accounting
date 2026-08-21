"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";
import { FINAL_TRANSACTION_CLASSIFICATIONS, requireAllowed } from "../../../lib/validation/finance";

const PROJECT_CLASSIFICATIONS=new Set(["project_expense","project_funding"]);
const EXPENSE_CLASSIFICATIONS=new Set(["project_expense","company_expense"]);

function inferParty(counterparty:string|null|undefined,narration:string|null|undefined){
  const direct=String(counterparty||"").trim();
  if(direct)return direct;
  const text=String(narration||"");
  const match=text.match(/transfer\s+(?:to|from)\s+([^|]+)/i);
  return match?.[1]?.trim()||"";
}

export async function confirmStatementTransaction(formData:FormData){
  const supabase=await createClient(); const {data:authData}=await supabase.auth.getUser(); const user=authData.user; if(!user)redirect("/login");
  const rowId=String(formData.get("statement_row_id")||""); const importId=String(formData.get("import_id")||""); const classification=String(formData.get("classification")||""); const projectId=String(formData.get("project_id")||"")||null; const categoryName=String(formData.get("category_name")||"").trim()||null;
  if(!rowId||!importId)throw new Error("Statement row and import are required.");
  requireAllowed(classification,FINAL_TRANSACTION_CLASSIFICATIONS,"Transaction classification");
  if(PROJECT_CLASSIFICATIONS.has(classification)&&!projectId)throw new Error("Choose a project for project funding or project expense.");

  const [{data:row,error:rowError},{data:statement,error:statementError},{data:existingLink}]=await Promise.all([
    supabase.from("statement_rows").select("id,import_id,transaction_date,value_date,narration,reference,counterparty,signed_amount,running_balance,normalized_fingerprint").eq("id",rowId).eq("import_id",importId).single(),
    supabase.from("statement_imports").select("id,company_id,financial_account_id").eq("id",importId).single(),
    supabase.from("statement_row_transaction_links").select("canonical_transaction_id").eq("statement_row_id",rowId).eq("is_primary",true).limit(1).maybeSingle(),
  ]);
  if(rowError||!row)throw new Error(rowError?.message||"Statement row not found.");
  if(statementError||!statement)throw new Error(statementError?.message||"Statement import not found.");
  if(existingLink?.canonical_transaction_id){revalidatePath(`/statements/${importId}`);redirect(`/statements/${importId}?confirmed=already`);}
  if(!row.transaction_date||row.signed_amount===null||!Number.isFinite(Number(row.signed_amount)))throw new Error("This row needs a valid transaction date and amount before it can be confirmed.");
  if(projectId){const {data:project}=await supabase.from("projects").select("id").eq("id",projectId).eq("company_id",statement.company_id).single();if(!project)throw new Error("Selected project is not accessible in this company workspace.");}

  const now=new Date().toISOString(); const isPersonal=classification==="personal_non_business"; const isTransfer=classification==="internal_transfer";
  const {data:transaction,error:txError}=await supabase.from("canonical_transactions").insert({
    company_id:statement.company_id,financial_account_id:statement.financial_account_id,project_id:PROJECT_CLASSIFICATIONS.has(classification)?projectId:null,
    transaction_date:row.transaction_date,value_date:row.value_date,narration:row.narration,reference:row.reference,counterparty:row.counterparty,signed_amount:row.signed_amount,running_balance:row.running_balance,normalized_fingerprint:row.normalized_fingerprint,
    classification,transaction_type:classification,category_name:EXPENSE_CLASSIFICATIONS.has(classification)?(categoryName||"Uncategorised"):null,is_personal_non_business:isPersonal,is_internal_transfer:isTransfer,is_posted:true,posted_at:now,status:"confirmed",created_by:user.id,confirmed_by:user.id,confirmed_at:now,
  }).select("id").single();
  if(txError||!transaction)throw new Error(txError?.message||"Could not post the transaction.");

  const {error:linkError}=await supabase.from("statement_row_transaction_links").insert({statement_row_id:rowId,canonical_transaction_id:transaction.id,confidence:100,reason:{matched_by:"user_confirmation",classification},is_primary:true});
  if(linkError){
    await supabase.from("canonical_transactions").delete().eq("id",transaction.id).eq("created_by",user.id);
    throw new Error(linkError.message);
  }

  if(PROJECT_CLASSIFICATIONS.has(classification)&&projectId){
    const party=inferParty(row.counterparty,row.narration);
    if(party){
      await supabase.rpc("learn_project_relationship",{
        target_project:projectId,
        party_name:party,
        relationship_kind:classification==="project_funding"?"sponsor":"vendor",
        classification_hint:classification,
        category_hint:classification==="project_expense"?(categoryName||"Uncategorised"):null,
        source_label:"confirmed_statement_transaction",
        learned_transaction:transaction.id,
      });
    }
    const {error:refreshError}=await supabase.rpc("refresh_project_financial_summary",{target_project:projectId});if(refreshError)throw new Error(refreshError.message);revalidatePath(`/projects/${projectId}`);revalidatePath("/projects");
  }

  const {error:finalizeError}=await supabase.rpc("finalize_statement_import",{target_import:importId});
  if(finalizeError)throw new Error(`Transaction posted, but statement totals could not refresh: ${finalizeError.message}`);
  revalidatePath(`/statements/${importId}`); revalidatePath("/statements"); revalidatePath("/");
  redirect(`/statements/${importId}?confirmed=posted#transactions`);
}
