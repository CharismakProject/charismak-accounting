"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { validateInternalTransfer } from "../../lib/accounting/guards";

const ACCOUNT_TYPES = new Set(["bank","fintech_wallet","cash","petty_cash","site_imprest","loan_credit","other"]);

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
  const openingRaw = String(formData.get("opening_balance") || "").trim();
  if (!institution || !accountName) throw new Error("Institution and account label are required.");
  if (institution.length > 160 || accountName.length > 160) throw new Error("Institution or account label is too long.");
  if (!ACCOUNT_TYPES.has(accountType)) throw new Error("Choose a valid financial account type.");
  const opening = openingRaw === "" ? 0 : Number(openingRaw);
  if (!Number.isFinite(opening)) throw new Error("Opening balance must be a valid number.");

  const { error } = await supabase.from("financial_accounts").insert({
    company_id: membership.company_id,
    account_type: accountType,
    institution_name: institution,
    institution_key: institution.toLowerCase().replace(/[^a-z0-9]+/g, "_"),
    account_name: accountName,
    account_number_masked: accountNumber,
    current_balance: opening,
    balance_as_of: openingRaw ? new Date().toISOString().slice(0,10) : null,
    account_scope: "company",
    created_by: user.id,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/treasury");
  revalidatePath("/");
  redirect("/treasury?saved=account");
}

export async function recordInternalTransfer(formData: FormData) {
  const { supabase, membership } = await context();
  const date = String(formData.get("transfer_date") || "") || new Date().toISOString().slice(0,10);
  const fromProject = String(formData.get("from_project_id") || "") || null;
  const toProject = String(formData.get("to_project_id") || "") || null;
  const description = String(formData.get("description") || "").trim() || "Internal transfer";
  const validated = validateInternalTransfer({
    amount: formData.get("amount"),
    fromAccountId: String(formData.get("from_account_id") || ""),
    toAccountId: String(formData.get("to_account_id") || ""),
  });

  const { error } = await supabase.rpc("record_internal_transfer_atomic", {
    target_company: membership.company_id,
    target_transfer_date: date,
    target_amount: validated.amount,
    target_from_account: validated.fromAccountId,
    target_to_account: validated.toAccountId,
    target_from_project: fromProject,
    target_to_project: toProject,
    target_description: description,
  });
  if (error) throw new Error(error.message);

  revalidatePath("/treasury");
  revalidatePath("/");
  if (fromProject) revalidatePath(`/projects/${fromProject}`);
  if (toProject) revalidatePath(`/projects/${toProject}`);
  redirect("/treasury?saved=transfer");
}
