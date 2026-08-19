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

const safeFileName = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

async function uploadProjectImage(
  supabase: Awaited<ReturnType<typeof createClient>>,
  companyId: string,
  projectId: string,
  image: FormDataEntryValue | null,
) {
  if (!(image instanceof File) || image.size === 0) return null;
  if (image.size > 10 * 1024 * 1024) throw new Error("Project image must be 10 MB or smaller.");
  if (!["image/jpeg", "image/png", "image/webp"].includes(image.type)) throw new Error("Project image must be JPG, PNG or WEBP.");

  const path = `${companyId}/${projectId}/${Date.now()}-${safeFileName(image.name)}`;
  const bytes = new Uint8Array(await image.arrayBuffer());
  const { error } = await supabase.storage.from("project-media").upload(path, bytes, {
    contentType: image.type,
    upsert: false,
  });
  if (error) throw new Error(`Project image upload failed: ${error.message}`);
  return path;
}

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

  const internalBudget = numberOrNull(formData.get("internal_cost_budget"));
  const contractValue = numberOrNull(formData.get("contract_value"));

  const { data: project, error } = await supabase
    .from("projects")
    .insert({
      company_id: membership.company_id,
      client_id: clientId,
      project_code: projectCode,
      name: projectName,
      project_type: String(formData.get("project_type") || "").trim() || null,
      location: String(formData.get("location") || "").trim() || null,
      site_address: String(formData.get("site_address") || "").trim() || null,
      status: String(formData.get("status") || "active"),
      start_date: String(formData.get("start_date") || "") || null,
      end_date: String(formData.get("end_date") || "") || null,
      contract_value: contractValue,
      internal_cost_budget: internalBudget,
      progress_percent: numberOrNull(formData.get("progress_percent")) ?? 0,
      external_reference: String(formData.get("external_reference") || "").trim() || null,
      description: String(formData.get("description") || "").trim() || null,
      aliases: String(formData.get("aliases") || "").split(",").map(v => v.trim()).filter(Boolean),
      notes: String(formData.get("notes") || "").trim() || null,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();

  if (error) throw new Error(`Could not create project: ${error.message}`);

  let imagePath: string | null = null;
  try {
    imagePath = await uploadProjectImage(supabase, membership.company_id, project.id, formData.get("project_image"));
    if (imagePath) {
      const { error: imageUpdateError } = await supabase.from("projects").update({
        project_image_path: imagePath,
        image_alt: String(formData.get("image_alt") || projectName).trim() || projectName,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      }).eq("id", project.id);
      if (imageUpdateError) throw imageUpdateError;
    }
  } catch (imageError) {
    if (imagePath) await supabase.storage.from("project-media").remove([imagePath]);
    throw imageError;
  }

  const expectedRevenue = numberOrNull(formData.get("expected_contract_revenue")) ?? contractValue ?? 0;
  const originalBudget = numberOrNull(formData.get("original_budget")) ?? internalBudget ?? 0;
  const { error: summaryError } = await supabase.from("project_financial_summaries").insert({
    project_id: project.id,
    original_budget: originalBudget,
    revised_budget: originalBudget,
    expected_contract_revenue: expectedRevenue,
    forecast_final_cost: originalBudget,
    forecast_cost_to_complete: originalBudget,
    forecast_profit: expectedRevenue - originalBudget,
  });
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
    .select("id, project_image_path")
    .eq("id", projectId)
    .eq("company_id", membership.company_id)
    .single();
  if (ownedProjectError || !ownedProject) throw new Error("Project not found in your company workspace.");

  const newImagePath = await uploadProjectImage(supabase, membership.company_id, projectId, formData.get("project_image"));
  const projectPatch: Record<string, unknown> = {
    name: String(formData.get("name") || "").trim(),
    project_type: String(formData.get("project_type") || "").trim() || null,
    location: String(formData.get("location") || "").trim() || null,
    site_address: String(formData.get("site_address") || "").trim() || null,
    status: String(formData.get("status") || "active"),
    start_date: String(formData.get("start_date") || "") || null,
    end_date: String(formData.get("end_date") || "") || null,
    progress_percent: numberOrNull(formData.get("progress_percent")) ?? 0,
    contract_value: numberOrNull(formData.get("contract_value")),
    internal_cost_budget: numberOrNull(formData.get("internal_cost_budget")),
    external_reference: String(formData.get("external_reference") || "").trim() || null,
    description: String(formData.get("description") || "").trim() || null,
    aliases: String(formData.get("aliases") || "").split(",").map(v => v.trim()).filter(Boolean),
    notes: String(formData.get("notes") || "").trim() || null,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  if (newImagePath) {
    projectPatch.project_image_path = newImagePath;
    projectPatch.image_alt = String(formData.get("image_alt") || formData.get("name") || "Project image").trim();
  }

  const { error: projectError } = await supabase.from("projects").update(projectPatch).eq("id", projectId).eq("company_id", membership.company_id);
  if (projectError) {
    if (newImagePath) await supabase.storage.from("project-media").remove([newImagePath]);
    throw new Error(`Could not update project: ${projectError.message}`);
  }
  if (newImagePath && ownedProject.project_image_path && ownedProject.project_image_path !== newImagePath) {
    await supabase.storage.from("project-media").remove([ownedProject.project_image_path]);
  }

  const funding = numberOrNull(formData.get("funding_received")) ?? 0;
  const expenditure = numberOrNull(formData.get("confirmed_expenditure")) ?? 0;
  const commitments = numberOrNull(formData.get("outstanding_commitments")) ?? 0;
  const cashBalance = funding - expenditure;
  const fundingPosition = cashBalance - commitments;
  const originalBudget = numberOrNull(formData.get("original_budget")) ?? numberOrNull(formData.get("internal_cost_budget")) ?? 0;
  const revisedBudget = numberOrNull(formData.get("revised_budget")) ?? originalBudget;
  const forecastCtc = numberOrNull(formData.get("forecast_cost_to_complete")) ?? Math.max(revisedBudget - expenditure, 0);
  const forecastFinal = expenditure + forecastCtc;
  const expectedRevenue = numberOrNull(formData.get("expected_contract_revenue")) ?? numberOrNull(formData.get("contract_value")) ?? 0;
  const overhead = numberOrNull(formData.get("overhead_allocated")) ?? 0;
  const forecastProfit = expectedRevenue - forecastFinal - overhead;

  const { error: summaryError } = await supabase
    .from("project_financial_summaries")
    .upsert({
      project_id: projectId,
      funding_received: funding,
      confirmed_expenditure: expenditure,
      actual_paid_cost: expenditure,
      cash_balance: cashBalance,
      outstanding_commitments: commitments,
      committed_cost: commitments,
      funding_surplus_shortfall: fundingPosition,
      original_budget: originalBudget,
      revised_budget: revisedBudget,
      forecast_cost_to_complete: forecastCtc,
      forecast_final_cost: forecastFinal,
      expected_contract_revenue: expectedRevenue,
      work_certified: numberOrNull(formData.get("work_certified")) ?? 0,
      invoiced_amount: numberOrNull(formData.get("invoiced_amount")) ?? 0,
      paid_revenue: numberOrNull(formData.get("paid_revenue")) ?? 0,
      retention_held: numberOrNull(formData.get("retention_held")) ?? 0,
      overhead_allocated: overhead,
      forecast_profit: forecastProfit,
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
