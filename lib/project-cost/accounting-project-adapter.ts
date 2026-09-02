import {
  assertEstimatorBridgeReady,
  fingerprintEstimatorBridge,
  type NormalizedEstimatorBridge,
} from "./estimator-bridge";
import type { CostCode } from "./cost-codes";

export type AccountingProjectSeedBudgetLine = {
  source_line_id: string;
  cost_code: CostCode;
  description: string;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number;
  supply_responsibility: "contractor" | "client" | "unknown";
};

export type AccountingProjectSeed = {
  project: {
    name: string;
    currency: string;
    contract_value: number | null;
    internal_cost_budget: number;
  };
  sourceReference: {
    source_system: "charismak_estimator";
    source_project_id: string;
    source_estimate_id: string | null;
    source_version: number;
    source_fingerprint: string;
    price_basis_at: string | null;
  };
  financialSummary: {
    original_budget: number;
    revised_budget: number;
    expected_contract_revenue: number | null;
    forecast_final_cost: number;
    forecast_cost_to_complete: number;
    forecast_profit: number | null;
  };
  budgetLines: AccountingProjectSeedBudgetLine[];
};

/**
 * Builds a deterministic, persistence-free plan for turning a reviewed Estimator
 * snapshot into Accounting project data.
 *
 * This deliberately does not write to Supabase. Persistence must still verify the
 * destination company/project, permissions, source fingerprint and idempotency.
 */
export async function buildAccountingProjectSeed(
  input: NormalizedEstimatorBridge,
): Promise<AccountingProjectSeed> {
  const snapshot = assertEstimatorBridgeReady(input);
  const sourceFingerprint = await fingerprintEstimatorBridge(snapshot);

  return {
    project: {
      name: snapshot.projectName,
      currency: snapshot.currency,
      contract_value: snapshot.contractValue,
      internal_cost_budget: snapshot.internalCostBudget,
    },
    sourceReference: {
      source_system: "charismak_estimator",
      source_project_id: snapshot.sourceProjectId,
      source_estimate_id: snapshot.sourceEstimateId,
      source_version: snapshot.sourceVersion,
      source_fingerprint: sourceFingerprint,
      price_basis_at: snapshot.priceBasisAt,
    },
    financialSummary: {
      original_budget: snapshot.internalCostBudget,
      revised_budget: snapshot.internalCostBudget,
      expected_contract_revenue: snapshot.contractValue,
      forecast_final_cost: snapshot.internalCostBudget,
      forecast_cost_to_complete: snapshot.internalCostBudget,
      forecast_profit:
        snapshot.contractValue == null
          ? null
          : snapshot.contractValue - snapshot.internalCostBudget,
    },
    budgetLines: snapshot.lines.map((line) => ({
      source_line_id: line.sourceLineId,
      cost_code: line.costCode as CostCode,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      amount: line.amount,
      supply_responsibility: line.supplyResponsibility,
    })),
  };
}
