import {
  calculateProjectCostPosition,
  type CostActualInput,
  type CostAllowanceInput,
  type CostBudgetInput,
  type CostCommitmentInput,
  type ProjectCostPosition,
} from "./budget-vs-actual.ts";

export type ProjectCostHealth = "no_budget" | "within_budget" | "at_risk" | "over_budget";

export type ProjectCostControl = {
  position: ProjectCostPosition;
  commitmentsStatus: "connected" | "not_connected";
  forecastStatus: "available" | "not_available";
  forecastCostToComplete: number | null;
  forecastFinalCost: number | null;
  expectedProfitAtBudget: number | null;
  forecastProfit: number | null;
  health: ProjectCostHealth;
  warnings: string[];
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const optionalMoney = (value: number | null | undefined, label: string) => {
  if (value == null) return null;
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite amount.`);
  return round(value);
};

function healthFor(position: ProjectCostPosition): ProjectCostHealth {
  if (position.internalCostBudget <= 0) return position.totalExposure > 0 ? "over_budget" : "no_budget";
  if (position.totalExposure > position.internalCostBudget + 0.005) return "over_budget";
  if (position.totalExposure / position.internalCostBudget >= 0.9) return "at_risk";
  return "within_budget";
}

/**
 * Project Cost Control V1.
 *
 * - Actuals are posted project expenses only; callers must filter income/transfers out.
 * - `commitments: null` means the commitment source is not connected. It is not treated
 *   as proof that the project has zero commitments.
 * - Forecast final cost is never inferred from remaining budget. It is calculated only
 *   when a reviewed forecast cost-to-complete is supplied.
 */
export function buildProjectCostControl(input: {
  budgets: CostBudgetInput[];
  allowances?: CostAllowanceInput[];
  actuals: CostActualInput[];
  commitments: CostCommitmentInput[] | null;
  contractValue?: number | null;
  forecastCostToComplete?: number | null;
}): ProjectCostControl {
  const commitments = input.commitments ?? [];
  const position = calculateProjectCostPosition({
    budgets: input.budgets,
    allowances: input.allowances ?? [],
    actuals: input.actuals,
    commitments,
  });

  const warnings: string[] = [];
  if (input.commitments == null) {
    warnings.push("Commitments are not connected yet. Exposure currently reflects confirmed actual spend only.");
  }
  if (position.unclassifiedActual > 0) {
    warnings.push(`${position.unclassifiedActual} of actual project spend is not yet assigned to a construction cost code.`);
  }

  const contractValue = optionalMoney(input.contractValue, "Contract value");
  const forecastCostToComplete = optionalMoney(input.forecastCostToComplete, "Forecast cost to complete");
  if (
    forecastCostToComplete != null &&
    input.commitments != null &&
    forecastCostToComplete + 0.005 < position.unpaidCommitment
  ) {
    warnings.push("Forecast cost to complete is below known unpaid commitments; review the forecast before relying on profit.");
  }

  const forecastFinalCost = forecastCostToComplete == null
    ? null
    : round(position.actual + forecastCostToComplete);
  const expectedProfitAtBudget = contractValue == null
    ? null
    : round(contractValue - position.internalCostBudget);
  const forecastProfit = contractValue == null || forecastFinalCost == null
    ? null
    : round(contractValue - forecastFinalCost);

  return {
    position,
    commitmentsStatus: input.commitments == null ? "not_connected" : "connected",
    forecastStatus: forecastFinalCost == null ? "not_available" : "available",
    forecastCostToComplete,
    forecastFinalCost,
    expectedProfitAtBudget,
    forecastProfit,
    health: healthFor(position),
    warnings,
  };
}
