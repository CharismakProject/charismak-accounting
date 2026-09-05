import { COST_CODE_GROUPS, isValidCostCode, type CostCode } from "./cost-codes.ts";

export type ReviewedCommitmentStatus = "open" | "closed" | "cancelled";
export type ReviewedCommitment = {
  id: string;
  projectId: string;
  description: string;
  costCode: CostCode;
  committedAmount: number;
  paidAmount: number;
  status: ReviewedCommitmentStatus;
  dueDate?: string | null;
  note?: string | null;
};

export type CostToCompleteLine = {
  costCode: CostCode;
  amount: number;
  note?: string | null;
};

export type CostToCompleteSnapshot = {
  projectId: string;
  reviewedAt: string;
  lines: CostToCompleteLine[];
  note?: string | null;
};

export type CommitmentForecastPosition = {
  commitments: Array<ReviewedCommitment & { unpaidAmount: number }>;
  commitmentTotal: number;
  paidAgainstCommitments: number;
  unpaidCommitmentTotal: number;
  costToCompleteTotal: number | null;
  costToCompleteByCode: Array<{
    costCode: CostCode;
    name: string;
    unpaidCommitments: number;
    forecastCostToComplete: number | null;
    headroomAfterCommitments: number | null;
    status: "not_reviewed" | "covers_commitments" | "below_commitments";
  }>;
  issues: string[];
  readyForForecast: boolean;
};

const round = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const money = (value: number, label: string) => {
  if (!Number.isFinite(value) || value < 0) throw new Error(`${label} must be a non-negative finite amount.`);
  return round(value);
};
const isoDate = (value: string | null | undefined) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

/**
 * Cost-to-Complete convention used by Charismak App:
 * - forecast CTC is ALL expected future project cost from the review date;
 * - known unpaid commitments are INCLUDED in forecast CTC, never added to it again;
 * - each reviewed cost-code CTC must therefore be at least its known unpaid commitment balance.
 */
export function buildCommitmentForecastPosition(input: {
  projectId: string;
  commitments: ReviewedCommitment[];
  snapshot?: CostToCompleteSnapshot | null;
}): CommitmentForecastPosition {
  const issues: string[] = [];
  const active = input.commitments
    .filter((row) => row.status !== "cancelled")
    .map((row) => {
      if (!row.id.trim()) issues.push("A commitment is missing its ID.");
      if (row.projectId !== input.projectId) issues.push(`Commitment ${row.id || "(unknown)"} belongs to another project.`);
      if (!row.description.trim()) issues.push(`Commitment ${row.id || "(unknown)"} needs a description.`);
      if (!isValidCostCode(row.costCode)) issues.push(`Commitment ${row.id || "(unknown)"} needs a valid cost code.`);
      if (!isoDate(row.dueDate)) issues.push(`Commitment ${row.id || "(unknown)"} has an invalid due date.`);
      const committedAmount = money(row.committedAmount, `Commitment ${row.id}`);
      const paidAmount = money(row.paidAmount, `Paid commitment ${row.id}`);
      if (paidAmount > committedAmount + 0.005) issues.push(`Paid amount exceeds commitment ${row.id}.`);
      const unpaidAmount = round(Math.max(committedAmount - paidAmount, 0));
      if (row.status === "closed" && unpaidAmount > 0.005) issues.push(`Closed commitment ${row.id} still has an unpaid balance.`);
      return { ...row, committedAmount, paidAmount, unpaidAmount };
    });

  const commitmentTotal = round(active.reduce((sum, row) => sum + row.committedAmount, 0));
  const paidAgainstCommitments = round(active.reduce((sum, row) => sum + row.paidAmount, 0));
  const unpaidCommitmentTotal = round(active.reduce((sum, row) => sum + row.unpaidAmount, 0));

  const ctcByCode = new Map<CostCode, number>();
  if (input.snapshot) {
    if (input.snapshot.projectId !== input.projectId) issues.push("The Cost-to-Complete snapshot belongs to another project.");
    if (!input.snapshot.reviewedAt || Number.isNaN(Date.parse(input.snapshot.reviewedAt))) issues.push("Cost-to-Complete review date is invalid.");
    for (const line of input.snapshot.lines) {
      if (!isValidCostCode(line.costCode)) {
        issues.push(`Cost-to-Complete line ${line.costCode} is not a valid construction cost code.`);
        continue;
      }
      const amount = money(line.amount, `Cost-to-Complete ${line.costCode}`);
      ctcByCode.set(line.costCode, round((ctcByCode.get(line.costCode) ?? 0) + amount));
    }
  }

  const costToCompleteByCode = COST_CODE_GROUPS.map((group) => {
    const costCode = group.code as CostCode;
    const unpaidCommitments = round(active.filter((row) => row.costCode === costCode).reduce((sum, row) => sum + row.unpaidAmount, 0));
    const forecastCostToComplete = input.snapshot ? round(ctcByCode.get(costCode) ?? 0) : null;
    const headroomAfterCommitments = forecastCostToComplete == null ? null : round(forecastCostToComplete - unpaidCommitments);
    const status = forecastCostToComplete == null
      ? "not_reviewed" as const
      : forecastCostToComplete + 0.005 < unpaidCommitments
        ? "below_commitments" as const
        : "covers_commitments" as const;
    if (status === "below_commitments") issues.push(`${costCode} · ${group.name} Cost-to-Complete is below known unpaid commitments.`);
    return { costCode, name: group.name, unpaidCommitments, forecastCostToComplete, headroomAfterCommitments, status };
  });

  const costToCompleteTotal = input.snapshot
    ? round(costToCompleteByCode.reduce((sum, row) => sum + (row.forecastCostToComplete ?? 0), 0))
    : null;

  return {
    commitments: active,
    commitmentTotal,
    paidAgainstCommitments,
    unpaidCommitmentTotal,
    costToCompleteTotal,
    costToCompleteByCode,
    issues: [...new Set(issues)],
    readyForForecast: Boolean(input.snapshot) && issues.length === 0,
  };
}
