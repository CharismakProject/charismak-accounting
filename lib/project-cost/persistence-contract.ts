import type { AccountingProjectSeed } from "./accounting-project-adapter";

export type StageEstimatorBudgetRpcArgs = {
  target_company: string;
  target_project: string;
  estimator_project_id: string;
  estimator_estimate_id: string | null;
  estimator_version: number;
  estimator_fingerprint: string;
  estimator_price_basis_at: string | null;
  budget_currency_code: string;
  budget_direct_cost: number;
  budget_allowance_total: number;
  budget_internal_cost: number;
  budget_contract_value_snapshot: number | null;
  budget_lines: AccountingProjectSeed["budgetLines"];
  budget_allowances: AccountingProjectSeed["budgetAllowances"];
};

export type StageEstimatorBudgetRpcResult = {
  status: "staged" | "existing";
  budget_id: string;
  budget_version: number;
  budget_status: "draft" | "approved" | "superseded";
  line_count?: number;
  allowance_count?: number;
};

export type ApproveProjectCostBudgetRpcArgs = {
  target_budget: string;
};

export type ApproveProjectCostBudgetRpcResult = {
  status: "approved" | "already_approved";
  budget_id: string;
  budget_version: number;
  project_id?: string;
};

const sumMoney = (values: number[]) =>
  Math.round((values.reduce((sum, value) => sum + value, 0) + Number.EPSILON) * 100) / 100;

/**
 * Maps a fully reviewed, fingerprinted Estimator seed to the database staging RPC.
 * No project/accounting mutation happens here.
 */
export function buildStageEstimatorBudgetRpcArgs(input: {
  companyId: string;
  projectId: string;
  seed: AccountingProjectSeed;
}): StageEstimatorBudgetRpcArgs {
  const { companyId, projectId, seed } = input;
  if (!companyId.trim() || !projectId.trim()) {
    throw new Error("Company and Accounting project IDs are required.");
  }
  if (seed.sourceReference.source_system !== "charismak_estimator") {
    throw new Error("Only Charismak Estimator seeds are supported by this bridge.");
  }
  if (!seed.sourceReference.source_project_id.trim()) {
    throw new Error("Estimator project identity is required.");
  }
  if (!seed.sourceReference.source_fingerprint.trim()) {
    throw new Error("Reviewed Estimator fingerprint is required.");
  }
  if (seed.sourceReference.source_version < 1) {
    throw new Error("Estimator version must be at least 1.");
  }
  if (seed.budgetLines.length === 0) {
    throw new Error("At least one reviewed budget line is required.");
  }

  const directCost = sumMoney(seed.budgetLines.map((line) => line.amount));
  const allowanceTotal = sumMoney(seed.budgetAllowances.map((allowance) => allowance.amount));
  const internalBudget = Math.round((seed.project.internal_cost_budget + Number.EPSILON) * 100) / 100;

  if (Math.abs(directCost + allowanceTotal - internalBudget) > 0.005) {
    throw new Error(
      "Reviewed budget no longer reconciles: direct cost plus allowances must equal internal cost budget.",
    );
  }

  return {
    target_company: companyId,
    target_project: projectId,
    estimator_project_id: seed.sourceReference.source_project_id,
    estimator_estimate_id: seed.sourceReference.source_estimate_id,
    estimator_version: seed.sourceReference.source_version,
    estimator_fingerprint: seed.sourceReference.source_fingerprint,
    estimator_price_basis_at: seed.sourceReference.price_basis_at,
    budget_currency_code: seed.project.currency,
    budget_direct_cost: directCost,
    budget_allowance_total: allowanceTotal,
    budget_internal_cost: internalBudget,
    budget_contract_value_snapshot: seed.project.contract_value,
    budget_lines: seed.budgetLines,
    budget_allowances: seed.budgetAllowances,
  };
}

export function buildApproveProjectCostBudgetRpcArgs(
  budgetId: string,
): ApproveProjectCostBudgetRpcArgs {
  if (!budgetId.trim()) throw new Error("Budget ID is required.");
  return { target_budget: budgetId };
}
