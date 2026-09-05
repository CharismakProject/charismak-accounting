"use server";

import { z } from "zod";
import { createClient } from "../../../lib/supabase/server";
import type {
  ApproveProjectCostBudgetRpcResult,
  StageEstimatorBudgetRpcArgs,
  StageEstimatorBudgetRpcResult,
} from "../../../lib/project-cost/persistence-contract";

const lineSchema = z.object({
  source_line_id: z.string().trim().min(1).max(240),
  cost_code: z.string().regex(/^(0[1-9]|1[0-9]|20)$/),
  description: z.string().trim().min(1).max(4000),
  unit: z.string().max(80).nullable(),
  quantity: z.number().finite().min(0).nullable(),
  rate: z.number().finite().min(0).nullable(),
  amount: z.number().finite().min(0),
  supply_responsibility: z.enum(["contractor", "client", "unknown"]),
});

const allowanceSchema = z.object({
  source_allowance_id: z.string().trim().min(1).max(240),
  kind: z.enum(["contingency", "other"]),
  description: z.string().trim().min(1).max(1000),
  amount: z.number().finite().min(0),
});

const stageArgsSchema = z
  .object({
    target_company: z.string().uuid(),
    target_project: z.string().uuid(),
    estimator_project_id: z.string().trim().min(1).max(240),
    estimator_estimate_id: z.string().trim().min(1).max(240).nullable(),
    estimator_version: z.number().int().positive(),
    estimator_fingerprint: z.string().trim().min(16).max(256),
    estimator_price_basis_at: z.string().datetime({ offset: true }).nullable(),
    budget_currency_code: z.string().regex(/^[A-Z]{3}$/),
    budget_direct_cost: z.number().finite().min(0),
    budget_allowance_total: z.number().finite().min(0),
    budget_internal_cost: z.number().finite().min(0),
    budget_contract_value_snapshot: z.number().finite().min(0).nullable(),
    budget_lines: z.array(lineSchema).min(1).max(20_000),
    budget_allowances: z.array(allowanceSchema).max(500),
  })
  .strict();

export type ProjectCostActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

function bridgeEnabled() {
  return process.env.PROJECT_COST_BRIDGE_ENABLED === "true";
}

export async function stageReviewedEstimatorBudget(
  input: StageEstimatorBudgetRpcArgs,
): Promise<ProjectCostActionResult<StageEstimatorBudgetRpcResult>> {
  if (!bridgeEnabled()) {
    return {
      ok: false,
      error:
        "Project-cost staging is disabled until the reviewed Accounting migration is approved and applied.",
    };
  }

  const parsed = stageArgsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "The reviewed Estimator budget payload is invalid." };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, error: "Sign in before staging an Accounting budget." };
  }

  const { data, error } = await supabase.rpc(
    "stage_estimator_budget_v1",
    parsed.data,
  );
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: data as StageEstimatorBudgetRpcResult };
}

export async function approveReviewedProjectCostBudget(
  budgetId: string,
): Promise<ProjectCostActionResult<ApproveProjectCostBudgetRpcResult>> {
  if (!bridgeEnabled()) {
    return {
      ok: false,
      error:
        "Project-cost approval is disabled until the reviewed Accounting migration is approved and applied.",
    };
  }

  const parsedBudgetId = z.string().uuid().safeParse(budgetId);
  if (!parsedBudgetId.success) {
    return { ok: false, error: "A valid staged budget ID is required." };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return { ok: false, error: "Sign in before approving an Accounting budget." };
  }

  const { data, error } = await supabase.rpc("approve_project_cost_budget_v1", {
    target_budget: parsedBudgetId.data,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: data as ApproveProjectCostBudgetRpcResult };
}
