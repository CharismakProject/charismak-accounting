"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import { parseOptionalNonNegativeMoney, parseRequiredMoney } from "../../lib/accounting/guards";

async function context() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");
  const { data: membership } = await supabase
    .from("company_memberships")
    .select("id,company_id,is_owner")
    .eq("user_id", auth.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) redirect("/login");
  return { supabase, user: auth.user, membership };
}

function requiredText(value: FormDataEntryValue | null, label: string, max = 200) {
  const text = String(value ?? "").trim();
  if (!text) throw new Error(`${label} is required.`);
  if (text.length > max) throw new Error(`${label} is too long.`);
  return text;
}

async function ensureParty(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  userId: string,
  nameRaw: FormDataEntryValue | null,
  partyType: "customer" | "vendor",
) {
  const name = requiredText(nameRaw, partyType === "customer" ? "Customer/client" : "Supplier/vendor");
  const { data: existing } = await supabase
    .from("business_parties")
    .select("id,party_type")
    .eq("company_id", companyId)
    .ilike("name", name)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  if (existing) {
    if (existing.party_type !== partyType && existing.party_type !== "both") {
      await supabase.from("business_parties").update({ party_type: "both", updated_at: new Date().toISOString() }).eq("id", existing.id);
    }
    return existing.id as string;
  }
  const { data, error } = await supabase
    .from("business_parties")
    .insert({ company_id: companyId, party_type: partyType, name, created_by: userId })
    .select("id")
    .single();
  if (error || !data) throw new Error(error?.message || `Could not create ${partyType}.`);
  return data.id as string;
}

export async function createClientInvoice(formData: FormData) {
  const { supabase, user, membership } = await context();
  const projectId = String(formData.get("project_id") || "").trim() || null;
  const partyId = await ensureParty(supabase, membership.company_id, user.id, formData.get("party_name"), "customer");
  const invoiceNumber = requiredText(formData.get("invoice_number"), "Invoice number", 120);
  const issueDate = requiredText(formData.get("issue_date"), "Issue date", 10);
  const dueDate = String(formData.get("due_date") || "").trim() || null;
  const gross = parseRequiredMoney(formData.get("gross_amount"), "Invoice amount");
  const tax = parseOptionalNonNegativeMoney(formData.get("tax_amount"), "Tax/VAT") ?? 0;
  const retention = parseOptionalNonNegativeMoney(formData.get("retention_amount"), "Retention") ?? 0;
  const notes = String(formData.get("notes") || "").trim() || null;
  const { error } = await supabase.rpc("record_client_invoice_atomic", {
    target_company: membership.company_id,
    target_project: projectId,
    target_party: partyId,
    target_source_document: null,
    target_invoice_number: invoiceNumber,
    target_issue_date: issueDate,
    target_due_date: dueDate,
    target_gross: gross,
    target_tax: tax,
    target_retention: retention,
    target_notes: notes,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  revalidatePath("/");
  redirect("/accounting?saved=invoice");
}

export async function createSupplierBill(formData: FormData) {
  const { supabase, user, membership } = await context();
  const projectId = String(formData.get("project_id") || "").trim() || null;
  const scope = String(formData.get("expense_scope") || "project");
  const partyId = await ensureParty(supabase, membership.company_id, user.id, formData.get("party_name"), "vendor");
  const billNumber = requiredText(formData.get("bill_number"), "Bill/invoice number", 120);
  const issueDate = requiredText(formData.get("issue_date"), "Issue date", 10);
  const dueDate = String(formData.get("due_date") || "").trim() || null;
  const gross = parseRequiredMoney(formData.get("gross_amount"), "Bill amount");
  const tax = parseOptionalNonNegativeMoney(formData.get("tax_amount"), "Tax/VAT") ?? 0;
  const category = String(formData.get("category_name") || "").trim() || null;
  const accountCode = String(formData.get("expense_account_code") || "").trim() || null;
  const notes = String(formData.get("notes") || "").trim() || null;
  const { error } = await supabase.rpc("record_supplier_bill_atomic", {
    target_company: membership.company_id,
    target_project: projectId,
    target_party: partyId,
    target_source_document: null,
    target_bill_number: billNumber,
    target_issue_date: issueDate,
    target_due_date: dueDate,
    target_gross: gross,
    target_tax: tax,
    target_scope: scope,
    target_expense_account_code: accountCode,
    target_category: category,
    target_notes: notes,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  revalidatePath("/");
  redirect("/accounting?saved=bill");
}

export async function calculateWip(formData: FormData) {
  const { supabase } = await context();
  const projectId = requiredText(formData.get("project_id"), "Project", 60);
  const asOf = requiredText(formData.get("as_of_date"), "WIP date", 10);
  const method = String(formData.get("calculation_method") || "cost_to_cost");
  const { error } = await supabase.rpc("calculate_wip_snapshot", {
    target_project: projectId,
    target_as_of: asOf,
    target_method: method,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  redirect("/accounting?saved=wip");
}

export async function postWip(formData: FormData) {
  const { supabase } = await context();
  const snapshotId = requiredText(formData.get("snapshot_id"), "WIP snapshot", 60);
  const { error } = await supabase.rpc("post_wip_revenue_atomic", { target_snapshot: snapshotId });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  revalidatePath("/");
  redirect("/accounting?saved=wip-posted");
}

export async function reconcileBank(formData: FormData) {
  const { supabase } = await context();
  const accountId = requiredText(formData.get("financial_account_id"), "Financial account", 60);
  const periodEnd = requiredText(formData.get("period_end"), "Reconciliation date", 10);
  const statementImportId = String(formData.get("statement_import_id") || "").trim() || null;
  const { error } = await supabase.rpc("reconcile_bank_account_atomic", {
    target_account: accountId,
    target_period_end: periodEnd,
    target_statement_import: statementImportId,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  redirect("/accounting?saved=reconciliation");
}

export async function setAccountingPeriod(formData: FormData) {
  const { supabase, membership } = await context();
  if (!membership.is_owner) throw new Error("Only a company owner can close or reopen accounting periods.");
  const start = requiredText(formData.get("period_start"), "Period start", 10);
  const end = requiredText(formData.get("period_end"), "Period end", 10);
  const status = String(formData.get("status") || "open");
  const notes = String(formData.get("notes") || "").trim() || null;
  const { error } = await supabase.rpc("set_accounting_period_status", {
    target_company: membership.company_id,
    target_start: start,
    target_end: end,
    target_status: status,
    target_notes: notes,
  });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  redirect("/accounting?saved=period");
}

export async function generatePaymentMatches() {
  const { supabase, membership } = await context();
  const { error } = await supabase.rpc("generate_payment_match_suggestions", { target_company: membership.company_id });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  redirect("/accounting?saved=matches");
}

export async function confirmPaymentMatch(formData: FormData) {
  const { supabase } = await context();
  const suggestionId = requiredText(formData.get("suggestion_id"), "Match suggestion", 60);
  const { error } = await supabase.rpc("confirm_statement_payment_match_atomic", { target_suggestion: suggestionId });
  if (error) throw new Error(error.message);
  revalidatePath("/accounting");
  revalidatePath("/statements");
  revalidatePath("/");
  redirect("/accounting?saved=match-confirmed");
}
