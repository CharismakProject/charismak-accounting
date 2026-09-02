"use server";

import { createClient } from "../../../../lib/supabase/server";
import type { StagedProjectWorkspace } from "../../../../lib/estimate/staged-project-workspace";
import { buildCreateAppProjectFromEstimateRpcArgs, validateAppProjectApproval, type CreateAppProjectFromEstimateRpcResult, type ProjectApprovalDetails } from "../../../../lib/project-cost/app-project-approval";

export type ApproveDraftProjectActionResult =
  | { ok: true; result: CreateAppProjectFromEstimateRpcResult }
  | { ok: false; code: "validation" | "bridge_disabled" | "auth" | "company" | "rpc"; message: string };

export async function approveDraftProjectAction(input: { workspace: StagedProjectWorkspace; details: ProjectApprovalDetails }): Promise<ApproveDraftProjectActionResult> {
  const issues = validateAppProjectApproval(input.workspace, input.details);
  if (issues.length) return { ok: false, code: "validation", message: issues.join(" ") };

  if (process.env.PROJECT_COST_BRIDGE_ENABLED !== "true") {
    return { ok: false, code: "bridge_disabled", message: "Approval package is valid, but the live project-cost bridge is disabled. Apply and verify the reviewed project-cost migration before enabling PROJECT_COST_BRIDGE_ENABLED=true." };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return { ok: false, code: "auth", message: authError?.message || "Sign in again before approving a live project." };

  const { data: memberships, error: memberError } = await supabase
    .from("company_members")
    .select("company_id,role,status")
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .eq("role", "md");
  if (memberError) return { ok: false, code: "company", message: memberError.message };
  if (!memberships?.length) return { ok: false, code: "company", message: "Only an active MD can approve a reviewed Estimate into a live project." };
  if (memberships.length !== 1) return { ok: false, code: "company", message: "More than one MD company workspace is available. Company selection must be explicit before live approval." };

  try {
    const args = await buildCreateAppProjectFromEstimateRpcArgs({ companyId: memberships[0].company_id, workspace: input.workspace, details: input.details });
    const { data, error } = await supabase.rpc("create_app_project_from_estimate_v1", args);
    if (error) return { ok: false, code: "rpc", message: error.message };
    const result = data as CreateAppProjectFromEstimateRpcResult | null;
    if (!result?.project_id || !result?.budget_id) return { ok: false, code: "rpc", message: "The approval RPC did not return the expected project and budget IDs." };
    return { ok: true, result };
  } catch (error) {
    return { ok: false, code: "validation", message: error instanceof Error ? error.message : "Could not prepare the live approval package." };
  }
}
