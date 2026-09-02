import { isValidCostCode, type CostCode } from "./cost-codes";
import type {
  EstimatorBridgeSnapshotInput,
  SupplyResponsibility,
} from "./estimator-bridge";

type RawEstimatorBillItem = {
  id?: unknown;
  itemCode?: unknown;
  description?: unknown;
  unit?: unknown;
  billQuantity?: unknown;
  amount?: unknown;
};

type RawEstimatorBillSection = {
  id?: unknown;
  code?: unknown;
  title?: unknown;
  items?: unknown;
};

type RawEstimatorBill = {
  id?: unknown;
  projectId?: unknown;
  status?: unknown;
  version?: unknown;
  projectName?: unknown;
  title?: unknown;
  currency?: unknown;
  priceBasisAt?: unknown;
  sections?: unknown;
  totals?: unknown;
};

export type EstimatorBillCandidateLine = {
  sourceLineId: string;
  sectionId: string;
  sectionTitle: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  amount: number | null;
  impliedRate: number | null;
  providedCostCode: CostCode | null;
  needsCostCodeReview: boolean;
};

export type EstimatorBillCandidateWarning =
  | "bill_is_not_completed"
  | "missing_project_identity"
  | "missing_or_unpriced_line"
  | "cost_code_review_required"
  | "commercial_mapping_review_required";

export type EstimatorBillReviewCandidate = {
  sourceBillId: string;
  sourceProjectId: string | null;
  sourceVersion: number;
  projectName: string;
  currency: string;
  priceBasisAt: string | null;
  billStatus: string;
  totals: {
    directCost: number;
    contingency: number;
    overhead: number;
    profit: number;
    discount: number;
    subTotalBeforeTax: number;
    vat: number;
    grandTotal: number;
  };
  suggestedInternalCostBases: {
    direct_cost: number;
    direct_plus_contingency: number;
  };
  suggestedCommercialBases: {
    subtotal_before_tax: number;
    grand_total: number;
  };
  lines: EstimatorBillCandidateLine[];
  warnings: EstimatorBillCandidateWarning[];
};

export type EstimatorBillApprovalDecisions = {
  internalCostBasis:
    | { kind: "direct_cost" }
    | { kind: "direct_plus_contingency" }
    | { kind: "explicit"; amount: number };
  contractValueBasis:
    | { kind: "subtotal_before_tax" }
    | { kind: "grand_total" }
    | { kind: "explicit"; amount: number }
    | { kind: "none" };
  lineDecisions: Record<
    string,
    {
      costCode: CostCode;
      supplyResponsibility?: SupplyResponsibility;
    }
  >;
};

const asString = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const asNumber = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const money = (value: unknown) => Math.round((asNumber(value) ?? 0) * 100) / 100;

function rawTotals(input: unknown) {
  const totals = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    directCost: money(totals.directCost),
    contingency: money(totals.contingency),
    overhead: money(totals.overhead),
    profit: money(totals.profit),
    discount: money(totals.discount),
    subTotalBeforeTax: money(totals.subTotalBeforeTax),
    vat: money(totals.vat),
    grandTotal: money(totals.grandTotal),
  };
}

/**
 * Converts the current Charismak Estimator Bill shape into a review candidate.
 * Nothing here is accounting truth yet: in particular, overhead/profit/VAT are
 * deliberately kept separate from the proposed internal project-cost bases.
 */
export function buildEstimatorBillReviewCandidate(
  raw: RawEstimatorBill,
): EstimatorBillReviewCandidate {
  const sourceBillId = asString(raw.id) ?? "unknown-bill";
  const sourceProjectId = asString(raw.projectId);
  const projectName = asString(raw.projectName) ?? asString(raw.title) ?? "Untitled project";
  const sourceVersion = Math.max(1, Math.trunc(asNumber(raw.version) ?? 1));
  const billStatus = asString(raw.status) ?? "draft";
  const currency = (asString(raw.currency) ?? "NGN").toUpperCase();
  const priceBasisAt = asString(raw.priceBasisAt);
  const totals = rawTotals(raw.totals);
  const warnings = new Set<EstimatorBillCandidateWarning>();

  if (billStatus !== "completed") warnings.add("bill_is_not_completed");
  if (!sourceProjectId) warnings.add("missing_project_identity");
  warnings.add("commercial_mapping_review_required");

  const sections = Array.isArray(raw.sections)
    ? (raw.sections as RawEstimatorBillSection[])
    : [];
  const lines: EstimatorBillCandidateLine[] = [];

  for (const [sectionIndex, section] of sections.entries()) {
    const sectionId = asString(section.id) ?? `section-${sectionIndex + 1}`;
    const sectionTitle = asString(section.title) ?? "General";
    const items = Array.isArray(section.items)
      ? (section.items as RawEstimatorBillItem[])
      : [];

    for (const [itemIndex, item] of items.entries()) {
      const itemId = asString(item.id) ?? `item-${itemIndex + 1}`;
      const sourceLineId = `${sectionId}:${itemId}`;
      const description = asString(item.description) ?? "Unnamed work item";
      const unit = asString(item.unit);
      const quantity = asNumber(item.billQuantity);
      const amount = asNumber(item.amount);
      const itemCode = asString(item.itemCode);
      const providedCostCode = itemCode && isValidCostCode(itemCode) ? itemCode : null;

      if (amount == null) warnings.add("missing_or_unpriced_line");
      if (!providedCostCode) warnings.add("cost_code_review_required");

      lines.push({
        sourceLineId,
        sectionId,
        sectionTitle,
        description,
        unit,
        quantity,
        amount: amount == null ? null : Math.round(amount * 100) / 100,
        impliedRate:
          amount != null && quantity != null && quantity > 0
            ? Math.round((amount / quantity) * 100) / 100
            : null,
        providedCostCode,
        needsCostCodeReview: !providedCostCode,
      });
    }
  }

  return {
    sourceBillId,
    sourceProjectId,
    sourceVersion,
    projectName,
    currency,
    priceBasisAt,
    billStatus,
    totals,
    suggestedInternalCostBases: {
      direct_cost: totals.directCost,
      direct_plus_contingency: Math.round((totals.directCost + totals.contingency) * 100) / 100,
    },
    suggestedCommercialBases: {
      subtotal_before_tax: totals.subTotalBeforeTax,
      grand_total: totals.grandTotal,
    },
    lines,
    warnings: Array.from(warnings),
  };
}

export function approveEstimatorBillCandidate(
  candidate: EstimatorBillReviewCandidate,
  decisions: EstimatorBillApprovalDecisions,
): EstimatorBridgeSnapshotInput {
  if (candidate.billStatus !== "completed") {
    throw new Error("Only a completed Estimator bill can become an Accounting budget baseline.");
  }
  if (!candidate.sourceProjectId) {
    throw new Error("The Estimator bill must be linked to a project before Accounting import.");
  }
  if (candidate.lines.some((line) => line.amount == null)) {
    throw new Error("All Estimator bill lines must be priced before Accounting import.");
  }

  const internalCostBudget =
    decisions.internalCostBasis.kind === "direct_cost"
      ? candidate.suggestedInternalCostBases.direct_cost
      : decisions.internalCostBasis.kind === "direct_plus_contingency"
        ? candidate.suggestedInternalCostBases.direct_plus_contingency
        : decisions.internalCostBasis.amount;

  const contractValue =
    decisions.contractValueBasis.kind === "subtotal_before_tax"
      ? candidate.suggestedCommercialBases.subtotal_before_tax
      : decisions.contractValueBasis.kind === "grand_total"
        ? candidate.suggestedCommercialBases.grand_total
        : decisions.contractValueBasis.kind === "explicit"
          ? decisions.contractValueBasis.amount
          : undefined;

  const lines = candidate.lines.map((line) => {
    const decision = decisions.lineDecisions[line.sourceLineId];
    const costCode = decision?.costCode ?? line.providedCostCode;
    if (!costCode || !isValidCostCode(costCode)) {
      throw new Error(`Cost code review is incomplete for ${line.sourceLineId}.`);
    }

    return {
      sourceLineId: line.sourceLineId,
      description: line.description,
      unit: line.unit ?? undefined,
      quantity: line.quantity ?? undefined,
      rate: line.impliedRate ?? undefined,
      amount: line.amount as number,
      costCode,
      supplyResponsibility: decision?.supplyResponsibility ?? "unknown",
    };
  });

  return {
    source: "charismak_estimator",
    sourceProjectId: candidate.sourceProjectId,
    sourceEstimateId: candidate.sourceBillId,
    sourceVersion: candidate.sourceVersion,
    projectName: candidate.projectName,
    currency: candidate.currency,
    contractValue,
    internalCostBudget,
    priceBasisAt: candidate.priceBasisAt ?? undefined,
    reviewed: true,
    lines,
  };
}
