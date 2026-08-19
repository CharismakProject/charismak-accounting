"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");
  const { data: membership } = await supabase.from("company_memberships").select("id,company_id,is_owner").eq("user_id", user.id).eq("status", "active").limit(1).maybeSingle();
  if (!membership) redirect("/login");
  return { supabase, user, membership };
}

export async function createFinancialAccount(formData: FormData) {
  const { supabase, user, membership } = await context();
  const institution = String(formData.get("institution_name") || "").trim();
  const accountName = String(formData.get("account_name") || "").trim();
  const accountType = String(formData.get("account_type") || "bank");
  const accountNumber = String(formData.get("account_number") || "").trim() || null;
  const opening = String(formData.get("opening_balance") || "").trim();
  if (!institution || !accountName) throw new Error("Institution and account label are required.");

  const { error } = await supabase.from("financial_accounts").insert({
    company_id: membership.company_id,
    account_type: accountType,
    institution_name: institution,
    institution_key: institution.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    account_name: accountName,
    account_number_masked: accountNumber,
    current_balance: opening ? Number(opening) : 0,
    balance_as_of: opening ? new Date().toISOString().slice(0,10) : null,
    account_scope: "company",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/treasury");
  revalidatePath("/");
  redirect("/treasury?saved=account");
}

export async function recordInternalTransfer(formData: FormData) {
  const { supabase, user, membership } = await context();
  const amount = Number(formData.get("amount") || 0);
  const date = String(formData.get("transfer_date") || "") || new Date().toISOString().slice(0,10);
  const fromAccount = String(formData.get("from_account_id") || "") || null;
  const toAccount = String(formData.get("to_account_id") || "") || null;
  const fromProject = String(formData.get("from_project_id") || "") || null;
  const toProject = String(formData.get("to_project_id") || "") || null;
  const description = String(formData.get("description") || "").trim() || "Internal transfer";
  if (!Number.isFinite(amount) || amount <= 0) throw new Error("Transfer amount must be greater than zero.");
  if (!fromAccount && !toAccount) throw new Error("Select at least one financial account.");

  const createsDue = Boolean(fromProject && toProject && fromProject !== toProject);
  const { data: transfer, error } = await supabase.from("transfer_pairs").insert({
    company_id: membership.company_id,
    transfer_date: date,
    amount,
    from_account_id: fromAccount,
    to_account_id: toAccount,
    from_project_id: fromProject,
    to_project_id: toProject,
    status: "confirmed",
    creates_due_to_from: createsDue,
    confirmed_by: user.id,
    confirmed_at: new Date().toISOString(),
  }).select("id").single();
  if (error) throw new Error(error.message);

  if (createsDue && transfer) {
    const { error: obligationError } = await supabase.from("inter_project_obligations").insert({
      company_id: membership.company_id,
      creditor_project_id: fromProject,
      debtor_project_id: toProject,
      amount,
      source_transfer_id: transfer.id,
      description,
      status: "open",
    });
    if (obligationError) throw new Error(obligationError.message);
  }

  revalidatePath("/treasury");
  revalidatePath("/");
  redirect("/treasury?saved=transfer");
}
