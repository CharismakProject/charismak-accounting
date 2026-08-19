"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

const PROJECT_CLASSIFICATIONS = new Set(["project_expense", "project_funding"]);

export async function confirmStatementTransaction(formData: FormData) {
  const supabase = await createClient();
  const { data: authData } = await supabase.auth.getUser();
  const user = authData.user;
  if (!user) redirect("/login");

  const rowId = String(formData.get("statement_row_id") || "");
  const importId = String(formData.get("import_id") || "");
  const classification = String(formData.get("classification") || "unknown");
  const projectId = String(formData.get("project_id") || "") || null;
  const categoryName = String(formData.get("category_name") || "").trim() || null;

  if (!rowId || !importId) throw new Error("Statement row and import are required.");
  if (PROJECT_CLASSIFICATIONS.has(classification) && !projectId) throw new Error("Choose a project for project funding or project expense.");

  const { data: row, error: rowError } = await supabase
    .from("statement_rows")
    .select("id, import_id, transaction_date, value_date, narration, reference, counterparty, signed_amount, running_balance, normalized_fingerprint")
    .eq("id", rowId)
    .eq("import_id", importId)
    .single();
  if (rowError || !row) throw new Error(rowError?.message || "Statement row not found.");

  const { data: statement, error: statementError } = await supabase
    .from("statement_imports")
    .select("id, company_id, financial_account_id")
    .eq("id", importId)
    .single();
  if (statementError || !statement) throw new Error(statementError?.message || "Statement import not found.");

  const { data: existingLink } = await supabase
    .from("statement_row_transaction_links")
    .select("canonical_transaction_id")
    .eq("statement_row_id", rowId)
    .eq("is_primary", true)
    .limit(1)
    .maybeSingle();
  if (existingLink?.canonical_transaction_id) {
    revalidatePath(`/statements/${importId}`);
    redirect(`/statements/${importId}?confirmed=already`);
  }

  if (!row.transaction_date || row.signed_amount === null) throw new Error("This row needs a valid transaction date and amount before it can be confirmed.");

  if (projectId) {
    const { data: project } = await supabase.from("projects").select("id").eq("id", projectId).eq("company_id", statement.company_id).single();
    if (!project) throw new Error("Selected project is not accessible in this company workspace.");
  }

  const isPersonal = classification === "personal_non_business";
  const isTransfer = classification === "internal_transfer";
  const amount = Math.abs(Number(row.signed_amount));

  const { data: transaction, error: txError } = await supabase
    .from("canonical_transactions")
    .insert({
      company_id: statement.company_id,
      financial_account_id: statement.financial_account_id,
      project_id: PROJECT_CLASSIFICATIONS.has(classification) ? projectId : null,
      transaction_date: row.transaction_date,
      value_date: row.value_date,
      narration: row.narration,
      reference: row.reference,
      counterparty: row.counterparty,
      signed_amount: row.signed_amount,
      running_balance: row.running_balance,
      normalized_fingerprint: row.normalized_fingerprint,
      classification,
      transaction_type: classification,
      category_name: classification === "project_expense" ? categoryName : null,
      is_personal_non_business: isPersonal,
      is_internal_transfer: isTransfer,
      is_posted: true,
      posted_at: new Date().toISOString(),
      status: "confirmed",
      created_by: user.id,
      confirmed_by: user.id,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (txError) throw new Error(txError.message);

  const { error: linkError } = await supabase.from("statement_row_transaction_links").insert({
    statement_row_id: rowId,
    canonical_transaction_id: transaction.id,
    confidence: 100,
    reason: { matched_by: "user_confirmation", classification },
    is_primary: true,
  });
  if (linkError) throw new Error(linkError.message);

  if (PROJECT_CLASSIFICATIONS.has(classification) && projectId) {
    const { data: summary } = await supabase
      .from("project_financial_summaries")
      .select("funding_received, confirmed_expenditure, outstanding_commitments, revised_budget, original_budget, forecast_cost_to_complete, expected_contract_revenue, overhead_allocated, reporting_period_start, reporting_period_end")
      .eq("project_id", projectId)
      .maybeSingle();

    const currentFunding = Number(summary?.funding_received ?? 0);
    const currentExpenditure = Number(summary?.confirmed_expenditure ?? 0);
    const commitments = Number(summary?.outstanding_commitments ?? 0);
    const funding = classification === "project_funding" ? currentFunding + amount : currentFunding;
    const expenditure = classification === "project_expense" ? currentExpenditure + amount : currentExpenditure;
    const cashBalance = funding - expenditure;
    const fundingPosition = cashBalance - commitments;
    const revisedBudget = Number(summary?.revised_budget ?? summary?.original_budget ?? 0);
    const existingCtc = Number(summary?.forecast_cost_to_complete ?? 0);
    const forecastCtc = existingCtc > 0 ? existingCtc : Math.max(revisedBudget - expenditure, 0);
    const forecastFinalCost = expenditure + forecastCtc;
    const expectedRevenue = Number(summary?.expected_contract_revenue ?? 0);
    const overhead = Number(summary?.overhead_allocated ?? 0);
    const forecastProfit = expectedRevenue - forecastFinalCost - overhead;
    const periodStart = !summary?.reporting_period_start || row.transaction_date < summary.reporting_period_start ? row.transaction_date : summary.reporting_period_start;
    const periodEnd = !summary?.reporting_period_end || row.transaction_date > summary.reporting_period_end ? row.transaction_date : summary.reporting_period_end;

    const { error: summaryError } = await supabase.from("project_financial_summaries").upsert({
      project_id: projectId,
      funding_received: funding,
      confirmed_expenditure: expenditure,
      actual_paid_cost: expenditure,
      cash_balance: cashBalance,
      outstanding_commitments: commitments,
      committed_cost: commitments,
      funding_surplus_shortfall: fundingPosition,
      forecast_cost_to_complete: forecastCtc,
      forecast_final_cost: forecastFinalCost,
      forecast_profit: forecastProfit,
      reporting_period_start: periodStart,
      reporting_period_end: periodEnd,
      source_label: "Confirmed bank statement transactions",
      updated_at: new Date().toISOString(),
    });
    if (summaryError) throw new Error(summaryError.message);

    if (classification === "project_expense" && categoryName) {
      const { data: existingCategory } = await supabase.from("project_cost_categories").select("id, amount").eq("project_id", projectId).eq("category_name", categoryName).maybeSingle();
      if (existingCategory) {
        const { error: categoryError } = await supabase.from("project_cost_categories").update({ amount: Number(existingCategory.amount) + amount, updated_at: new Date().toISOString() }).eq("id", existingCategory.id);
        if (categoryError) throw new Error(categoryError.message);
      } else {
        const { error: categoryError } = await supabase.from("project_cost_categories").insert({ project_id: projectId, category_name: categoryName, amount, sort_order: 999 });
        if (categoryError) throw new Error(categoryError.message);
      }
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
  }

  revalidatePath(`/statements/${importId}`);
  revalidatePath("/statements");
  revalidatePath("/");
  redirect(`/statements/${importId}?confirmed=posted`);
}
