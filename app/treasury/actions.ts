"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { FINANCIAL_ACCOUNT_TYPES, boundedText, optionalIsoDate, requireAllowed, requiredPositiveMoney } from "../../lib/validation/finance";

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
  const institution = boundedText(formData.get("institution_name"), "Institution", 120, true);
  const accountName = boundedText(formData.get("account_name"), "Account label", 160, true);
  const accountType = requireAllowed(String(formData.get("account_type") || "bank"), FINANCIAL_ACCOUNT_TYPES, "Account type");
  const accountNumber = boundedText(formData.get("account_number"), "Account number", 32, false) || null;
  const openingRaw = String(formData.get("opening_balance") || "").trim();
  const opening = openingRaw ? Number(openingRaw) : 0;
  if (!Number.isFinite(opening)) throw new Error("Opening balance must be a valid number.");
  if (accountNumber && !/^[0-9*Xx\-\s]{4,32}$/.test(accountNumber)) throw new Error("Account number contains unsupported characters.");

  const institutionKey = institution.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
  const { data: duplicate } = await supabase.from("financial_accounts")
    .select("id")
    .eq("company_id", membership.company_id)
    .eq("account_name", accountName)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (duplicate) throw new Error("An active financial account with this label already exists.");

  const { error } = await supabase.from("financial_accounts").insert({
    company_id: membership.company_id,
    account_type: accountType,
    institution_name: institution,
    institution_key: institutionKey || "account",
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
  const { supabase, user, membership } = await context();
  const amount = requiredPositiveMoney(formData.get("amount"), "Transfer amount");
  const date = optionalIsoDate(formData.get("transfer_date"), "Transfer date") || new Date().toISOString().slice(0,10);
  const fromAccount = String(formData.get("from_account_id") || "") || null;
  const toAccount = String(formData.get("to_account_id") || "") || null;
  const fromProject = String(formData.get("from_project_id") || "") || null;
  const toProject = String(formData.get("to_project_id") || "") || null;
  const description = boundedText(formData.get("description"), "Description", 500, false) || "Internal transfer";
  if (!fromAccount && !fromProject) throw new Error("Select a source account or source project.");
  if (!toAccount && !toProject) throw new Error("Select a destination account or destination project.");
  if (fromAccount && toAccount && fromAccount === toAccount && (!fromProject || !toProject || fromProject === toProject)) throw new Error("Source and destination cannot be the same.");
  if (fromProject && toProject && fromProject === toProject && (!fromAccount || !toAccount || fromAccount === toAccount)) throw new Error("Source and destination cannot be the same.");

  const accountIds = Array.from(new Set([fromAccount, toAccount].filter(Boolean))) as string[];
  if (accountIds.length) {
    const { data: validAccounts, error: accountError } = await supabase.from("financial_accounts").select("id").eq("company_id", membership.company_id).in("id", accountIds);
    if (accountError || (validAccounts ?? []).length !== accountIds.length) throw new Error("One or more selected financial accounts do not belong to this company.");
  }
  const projectIds = Array.from(new Set([fromProject, toProject].filter(Boolean))) as string[];
  if (projectIds.length) {
    const { data: validProjects, error: projectError } = await supabase.from("projects").select("id").eq("company_id", membership.company_id).in("id", projectIds);
    if (projectError || (validProjects ?? []).length !== projectIds.length) throw new Error("One or more selected projects do not belong to this company.");
  }

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
    if (obligationError) {
      await supabase.from("transfer_pairs").delete().eq("id", transfer.id).eq("company_id", membership.company_id);
      throw new Error(obligationError.message);
    }
  }

  revalidatePath("/treasury");
  revalidatePath("/");
  redirect("/treasury?saved=transfer");
}
