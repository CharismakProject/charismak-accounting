"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

const PROJECT_CLASSIFICATIONS = new Set(["project_expense", "project_funding"]);

export async function confirmStatementTransaction(formData: FormData) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const rowId = String(formData.get("statement_row_id") || "");
  const importId = String(formData.get("import_id") || "");
  const classification = String(formData.get("classification") || "unknown");
  const projectId = String(formData.get("project_id") || "") || null;
  const categoryName = String(formData.get("category_name") || "").trim() || null;

  if (!rowId || !importId) throw new Error("Statement row and import are required.");
  if (PROJECT_CLASSIFICATIONS.has(classification) && !projectId) {
    throw new Error("Choose a project for project funding or project expense.");
  }

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

  const { data: membership } = await supabase
    .from("company_memberships")
    .select("id")
    .eq("company_id", statement.company_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) throw new Error("You do not have access to this company statement.");

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

  if (!row.transaction_date || row.signed_amount === null) {
    throw new Error("This row needs a valid transaction date and amount before it can be confirmed.");
  }

  let projectReportingEnd: string | null = null;
  if (projectId) {
    const { data: project } = await supabase
      .from("projects")
      .select("id, company_id")
      .eq("id", projectId)
      .eq("company_id", statement.company_id)
      .single();
    if (!project) throw new Error("Selected project does not belong to this company.");

    const { data: summary } = await supabase
      .from("project_financial_summaries")
      .select("reporting_period_end")
      .eq("project_id", projectId)
      .maybeSingle();
    projectReportingEnd = summary?.reporting_period_end ?? null;
  }

  const historicalBaseline = Boolean(
    projectId && projectReportingEnd && row.transaction_date <= projectReportingEnd,
  );

  const canonicalStatus = historicalBaseline ? "confirmed_reconciliation_only" : "confirmed";

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
      category_name: classification === "project_expense" ? categoryName : null,
      status: canonicalStatus,
      confirmed_by: userId,
      confirmed_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (txError) throw new Error(txError.message);

  const { error: linkError } = await supabase
    .from("statement_row_transaction_links")
    .insert({
      statement_row_id: rowId,
      canonical_transaction_id: transaction.id,
      confidence: 100,
      reason: {
        matched_by: "user_confirmation",
        classification,
        historical_baseline: historicalBaseline,
      },
      is_primary: true,
    });
  if (linkError) throw new Error(linkError.message);

  if (PROJECT_CLASSIFICATIONS.has(classification) && projectId && !historicalBaseline) {
    const { data: summary } = await supabase
      .from("project_financial_summaries")
      .select("funding_received, confirmed_expenditure, outstanding_commitments, reporting_period_end")
      .eq("project_id", projectId)
      .maybeSingle();

    const currentFunding = Number(summary?.funding_received ?? 0);
    const currentExpenditure = Number(summary?.confirmed_expenditure ?? 0);
    const commitments = Number(summary?.outstanding_commitments ?? 0);
    const amount = Math.abs(Number(row.signed_amount));
    const funding = classification === "project_funding" ? currentFunding + amount : currentFunding;
    const expenditure = classification === "project_expense" ? currentExpenditure + amount : currentExpenditure;
    const cashBalance = funding - expenditure;
    const fundingPosition = cashBalance - commitments;

    const nextPeriodEnd = !summary?.reporting_period_end || row.transaction_date > summary.reporting_period_end
      ? row.transaction_date
      : summary.reporting_period_end;

    const { error: summaryError } = await supabase
      .from("project_financial_summaries")
      .upsert({
        project_id: projectId,
        funding_received: funding,
        confirmed_expenditure: expenditure,
        cash_balance: cashBalance,
        outstanding_commitments: commitments,
        funding_surplus_shortfall: fundingPosition,
        reporting_period_end: nextPeriodEnd,
        updated_at: new Date().toISOString(),
      });
    if (summaryError) throw new Error(summaryError.message);

    if (classification === "project_expense" && categoryName) {
      const { data: existingCategory } = await supabase
        .from("project_cost_categories")
        .select("id, amount")
        .eq("project_id", projectId)
        .eq("category_name", categoryName)
        .maybeSingle();

      if (existingCategory) {
        await supabase
          .from("project_cost_categories")
          .update({ amount: Number(existingCategory.amount) + amount, updated_at: new Date().toISOString() })
          .eq("id", existingCategory.id);
      } else {
        await supabase
          .from("project_cost_categories")
          .insert({ project_id: projectId, category_name: categoryName, amount, sort_order: 999 });
      }
    }

    revalidatePath(`/projects/${projectId}`);
    revalidatePath("/projects");
  }

  revalidatePath(`/statements/${importId}`);
  revalidatePath("/statements");
  redirect(`/statements/${importId}?confirmed=${historicalBaseline ? "historical" : "posted"}`);
}
