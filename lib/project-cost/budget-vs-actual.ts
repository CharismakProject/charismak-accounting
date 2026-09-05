import { COST_CODE_GROUPS, isValidCostCode, type CostCode } from "./cost-codes.ts";

export type CostBudgetInput = {
  costCode: CostCode;
  amount: number;
};

export type CostActualInput = {
  transactionId: string;
  costCode: string | null;
  amount: number;
};

export type CostCommitmentInput = {
  commitmentId: string;
  costCode: CostCode;
  committedAmount: number;
  paidAmount?: number;
};

export type CostAllowanceInput = {
  kind: "contingency" | "other";
  amount: number;
};

export type CostCodePosition = {
  costCode: CostCode;
  name: string;
  budget: number;
  committed: number;
  commitmentPaid: number;
  unpaidCommitment: number;
  actual: number;
  exposure: number;
  remainingBeforeUncommittedSpend: number;
  budgetConsumedPercent: number | null;
  status: "not_budgeted" | "within_budget" | "at_risk" | "over_budget";
};

export type ProjectCostPosition = {
  directBudget: number;
  allowanceBudget: number;
  internalCostBudget: number;
  committed: number;
  unpaidCommitment: number;
  actual: number;
  classifiedActual: number;
  unclassifiedActual: number;
  exposureBeforeUnclassified: number;
  totalExposure: number;
  remainingBudget: number;
  contingencyRemainingBeforeUnclassified: number;
  byCostCode: CostCodePosition[];
  unclassifiedTransactionIds: string[];
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const safeMoney = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite amount.`);
  return roundMoney(value);
};

function riskStatus(budget: number, exposure: number): CostCodePosition["status"] {
  if (budget <= 0) return exposure > 0 ? "over_budget" : "not_budgeted";
  if (exposure > budget + 0.005) return "over_budget";
  const ratio = exposure / budget;
  if (ratio >= 0.9) return "at_risk";
  return "within_budget";
}

/**
 * Deterministic cost-position engine.
 *
 * Important accounting rule: a subcontract commitment that is partly paid contributes
 * only its unpaid balance to future exposure. Paid amounts are already represented by
 * actual transactions and must not be counted twice.
 */
export function calculateProjectCostPosition(input: {
  budgets: CostBudgetInput[];
  allowances?: CostAllowanceInput[];
  actuals: CostActualInput[];
  commitments?: CostCommitmentInput[];
}): ProjectCostPosition {
  const budgetByCode = new Map<CostCode, number>();
  const actualByCode = new Map<CostCode, number>();
  const commitmentByCode = new Map<CostCode, { committed: number; paid: number; unpaid: number }>();
  const unclassifiedTransactionIds: string[] = [];
  let unclassifiedActual = 0;

  for (const item of input.budgets) {
    const amount = safeMoney(item.amount, `Budget ${item.costCode}`);
    budgetByCode.set(item.costCode, roundMoney((budgetByCode.get(item.costCode) ?? 0) + amount));
  }

  for (const item of input.actuals) {
    const amount = safeMoney(item.amount, `Actual ${item.transactionId}`);
    if (!item.costCode || !isValidCostCode(item.costCode)) {
      unclassifiedActual = roundMoney(unclassifiedActual + amount);
      unclassifiedTransactionIds.push(item.transactionId);
      continue;
    }
    actualByCode.set(item.costCode, roundMoney((actualByCode.get(item.costCode) ?? 0) + amount));
  }

  for (const item of input.commitments ?? []) {
    const committed = safeMoney(item.committedAmount, `Commitment ${item.commitmentId}`);
    const paid = safeMoney(item.paidAmount ?? 0, `Paid commitment ${item.commitmentId}`);
    if (paid > committed + 0.005) {
      throw new Error(`Paid amount exceeds commitment ${item.commitmentId}.`);
    }
    const current = commitmentByCode.get(item.costCode) ?? { committed: 0, paid: 0, unpaid: 0 };
    current.committed = roundMoney(current.committed + committed);
    current.paid = roundMoney(current.paid + paid);
    current.unpaid = roundMoney(current.unpaid + Math.max(committed - paid, 0));
    commitmentByCode.set(item.costCode, current);
  }

  const allowanceBudget = roundMoney(
    (input.allowances ?? []).reduce(
      (sum, allowance) => sum + safeMoney(allowance.amount, `${allowance.kind} allowance`),
      0,
    ),
  );

  const byCostCode = COST_CODE_GROUPS.map<CostCodePosition>((group) => {
    const costCode = group.code;
    const budget = roundMoney(budgetByCode.get(costCode) ?? 0);
    const actual = roundMoney(actualByCode.get(costCode) ?? 0);
    const commitment = commitmentByCode.get(costCode) ?? { committed: 0, paid: 0, unpaid: 0 };
    const exposure = roundMoney(actual + commitment.unpaid);
    const remainingBeforeUncommittedSpend = roundMoney(budget - exposure);

    return {
      costCode,
      name: group.name,
      budget,
      committed: commitment.committed,
      commitmentPaid: commitment.paid,
      unpaidCommitment: commitment.unpaid,
      actual,
      exposure,
      remainingBeforeUncommittedSpend,
      budgetConsumedPercent: budget > 0 ? Math.round((exposure / budget) * 10_000) / 100 : null,
      status: riskStatus(budget, exposure),
    };
  });

  const directBudget = roundMoney(byCostCode.reduce((sum, row) => sum + row.budget, 0));
  const classifiedActual = roundMoney(byCostCode.reduce((sum, row) => sum + row.actual, 0));
  const committed = roundMoney(byCostCode.reduce((sum, row) => sum + row.committed, 0));
  const unpaidCommitment = roundMoney(byCostCode.reduce((sum, row) => sum + row.unpaidCommitment, 0));
  const actual = roundMoney(classifiedActual + unclassifiedActual);
  const exposureBeforeUnclassified = roundMoney(classifiedActual + unpaidCommitment);
  const totalExposure = roundMoney(exposureBeforeUnclassified + unclassifiedActual);
  const internalCostBudget = roundMoney(directBudget + allowanceBudget);
  const remainingBudget = roundMoney(internalCostBudget - totalExposure);
  const directVarianceBeforeUnclassified = roundMoney(directBudget - exposureBeforeUnclassified);
  const contingencyRemainingBeforeUnclassified = roundMoney(
    Math.min(allowanceBudget, Math.max(allowanceBudget + directVarianceBeforeUnclassified, 0)),
  );

  return {
    directBudget,
    allowanceBudget,
    internalCostBudget,
    committed,
    unpaidCommitment,
    actual,
    classifiedActual,
    unclassifiedActual,
    exposureBeforeUnclassified,
    totalExposure,
    remainingBudget,
    contingencyRemainingBeforeUnclassified,
    byCostCode,
    unclassifiedTransactionIds,
  };
}
