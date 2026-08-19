"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

async function getContext() {
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData.user;
  if (authError || !user) redirect("/login");

  const { data: membership, error } = await supabase
    .from("company_memberships")
    .select("id, company_id, is_owner")
    .eq("user_id", user.id)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !membership) redirect("/login?message=No+active+company+membership");
  return { supabase, userId: user.id, membership };
}

const numberOrNull = (value: FormDataEntryValue | null) => {
  if (value === null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function createProject(formData: FormData) {
  const { supabase, userId, membership } = await getContext();
  const clientName = String(formData.get("client_name") || "").trim();
  const candidateId = String(formData.get("candidate_id") || "").trim();
  const importId = String(formData.get("import_id") || "").trim();
  let clientId: string | null = null;

  if (clientName) {
    const { data: client, error: clientError } = await supabase
      .from("clients")
      .upsert({ company_id: membership.company_id, name: clientName }, { onConflict: "company_id,name" })
      .select("id")
      .single();
    if (clientError) throw new Error(`Could not save client: ${clientError.message}`);
    clientId = client.id;
  }

  const projectCode = String(formData.get("project_code") || "").trim().toUpperCase();
  const projectName = String(formData.get("name") || "").trim();
  if (!projectCode || !projectName) throw new Error("Project code and name are required.");

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      company_id: membership.company_id,
      client_id: clientId,
      project_code: projectCode,
      name: projectName,
      location: String(formData.get("location") || "").trim() || null,
      status: String(formData.get("status") || "active"),
      start_date: String(formData.get("start_date") || "") || null,
      contract_value: numberOrNull(formData.get("contract_value")),
      internal_cost_budget: numberOrNull(formData.get("internal_cost_budget")),
      aliases: String(formData.get("aliases") || "").split(",").map(v => v.trim()).filter(Boolean),
      notes: String(formData.get("notes") || "").trim() || null,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create project: ${error.message}`);

  const { error: summaryError } = await supabase.from("project_financial_summaries").insert({ project_id: project.id });
  if (summaryError) throw new Error(`Project created but financial summary failed: ${summaryError.message}`);

  if (candidateId) {
    const { error: candidateError } = await supabase.rpc("link_statement_candidate", {
      candidate_id: candidateId,
      target_project: project.id,
    });
    if (candidateError) throw new Error(`Project created, but statement candidate linking failed: ${candidateError.message}`);
  }

  revalidatePath("/projects");
  revalidatePath("/");
  if (importId) revalidatePath(`/statements/${importId}`);
  redirect(candidateId && importId ? `/statements/${importId}?candidate=created` : `/projects/${project.id}`);
}

export async function updateProject(formData: FormData) {
  const { supabase, userId, membership } = await getContext();
  const projectId = String(formData.get("project_id") || "");
  if (!projectId) throw new Error("Project ID is required.");

  const { data: ownedProject, error: ownedProjectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("company_id", membership.company_id)
    .single();
  if (ownedProjectError || !ownedProject) throw new Error("Project not found in your company workspace.");

  const { error: projectError } = await supabase
    .from("projects")
    .update({
      name: String(formData.get("name") || "").trim(),
      location: String(formData.get("location") || "").trim() || null,
      status: String(formData.get("status") || "active"),
      contract_value: numberOrNull(formData.get("contract_value")),
      internal_cost_budget: numberOrNull(formData.get("internal_cost_budget")),
      aliases: String(formData.get("aliases") || "").split(",").map(v => v.trim()).filter(Boolean),
      notes: String(formData.get("notes") || "").trim() || null,
      updated_by: userId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", projectId)
    .eq("company_id", membership.company_id);
  if (projectError) throw new Error(`Could not update project: ${projectError.message}`);

  const funding = numberOrNull(formData.get("funding_received")) ?? 0;
  const expenditure = numberOrNull(formData.get("confirmed_expenditure")) ?? 0;
  const commitments = numberOrNull(formData.get("outstanding_commitments")) ?? 0;
  const cashBalance = funding - expenditure;
  const fundingPosition = cashBalance - commitments;

  const { error: summaryError } = await supabase
    .from("project_financial_summaries")
    .upsert({
      project_id: projectId,
      funding_received: funding,
      confirmed_expenditure: expenditure,
      cash_balance: cashBalance,
      outstanding_commitments: commitments,
      funding_surplus_shortfall: fundingPosition,
      reporting_period_start: String(formData.get("reporting_period_start") || "") || null,
      reporting_period_end: String(formData.get("reporting_period_end") || "") || null,
      source_label: String(formData.get("source_label") || "").trim() || null,
      updated_at: new Date().toISOString(),
    });
  if (summaryError) throw new Error(`Project details saved but financial summary failed: ${summaryError.message}`);

  revalidatePath(`/projects/${projectId}`);
  revalidatePath("/projects");
  revalidatePath("/");
  redirect(`/projects/${projectId}?saved=1`);
}
