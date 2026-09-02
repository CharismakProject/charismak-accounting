import { z } from "zod";
import { isValidCostCode, suggestCostCode, type CostCode } from "./cost-codes";

const MAX_MONEY = 1_000_000_000_000_000;
const money = z.number().finite().min(0).max(MAX_MONEY);
const optionalMoney = money.optional();

export const supplyResponsibilitySchema = z.enum([
  "contractor",
  "client",
  "unknown",
]);

export const estimatorBridgeLineSchema = z.object({
  sourceLineId: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(4000),
  unit: z.string().trim().max(80).optional(),
  quantity: z.number().finite().min(0).optional(),
  rate: optionalMoney,
  amount: money,
  costCode: z.string().trim().max(20).optional(),
  supplyResponsibility: supplyResponsibilitySchema.optional(),
});

export const estimatorBridgeSnapshotSchema = z.object({
  source: z.literal("charismak_estimator"),
  sourceProjectId: z.string().trim().min(1).max(240),
  sourceEstimateId: z.string().trim().min(1).max(240).optional(),
  sourceVersion: z.number().int().positive().default(1),
  projectName: z.string().trim().min(1).max(500),
  currency: z.string().trim().length(3).transform((value) => value.toUpperCase()),
  contractValue: optionalMoney,
  internalCostBudget: money,
  priceBasisAt: z.string().datetime({ offset: true }).optional(),
  reviewed: z.literal(true),
  lines: z.array(estimatorBridgeLineSchema).min(1).max(20_000),
});

export type EstimatorBridgeSnapshotInput = z.input<
  typeof estimatorBridgeSnapshotSchema
>;
export type EstimatorBridgeSnapshot = z.output<
  typeof estimatorBridgeSnapshotSchema
>;
export type SupplyResponsibility = z.infer<typeof supplyResponsibilitySchema>;

export type NormalizedEstimatorBudgetLine = {
  sourceLineId: string;
  description: string;
  unit: string | null;
  quantity: number | null;
  rate: number | null;
  amount: number;
  costCode: CostCode | null;
  costCodeSource: "provided" | "suggested" | "unclassified";
  supplyResponsibility: SupplyResponsibility;
};

export type EstimatorBridgeWarning = {
  code:
    | "duplicate_source_line_id"
    | "invalid_cost_code"
    | "unclassified_cost_code"
    | "line_arithmetic_mismatch"
    | "budget_line_total_mismatch";
  message: string;
  sourceLineId?: string;
};

export type NormalizedEstimatorBridge = {
  source: "charismak_estimator";
  sourceProjectId: string;
  sourceEstimateId: string | null;
  sourceVersion: number;
  projectName: string;
  currency: string;
  contractValue: number | null;
  internalCostBudget: number;
  priceBasisAt: string | null;
  reviewed: true;
  lines: NormalizedEstimatorBudgetLine[];
  lineTotal: number;
  warnings: EstimatorBridgeWarning[];
  readyForImport: boolean;
};

const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

function relativeDifference(left: number, right: number) {
  const denominator = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) / denominator;
}

/**
 * Normalizes a reviewed Estimator snapshot into a deterministic Accounting import DTO.
 *
 * Important: suggested cost codes are never treated as confirmed accounting truth. If a
 * line arrives without a valid code, this function may suggest one to help the reviewer,
 * but `readyForImport` remains false until the Estimator sends an explicit valid code.
 */
export function normalizeEstimatorBridge(input: unknown): NormalizedEstimatorBridge {
  const snapshot = estimatorBridgeSnapshotSchema.parse(input);
  const warnings: EstimatorBridgeWarning[] = [];
  const seenLineIds = new Set<string>();

  const lines = snapshot.lines.map<NormalizedEstimatorBudgetLine>((line) => {
    if (seenLineIds.has(line.sourceLineId)) {
      warnings.push({
        code: "duplicate_source_line_id",
        sourceLineId: line.sourceLineId,
        message: `Duplicate Estimator line ID: ${line.sourceLineId}`,
      });
    }
    seenLineIds.add(line.sourceLineId);

    let costCode: CostCode | null = null;
    let costCodeSource: NormalizedEstimatorBudgetLine["costCodeSource"] = "unclassified";

    if (line.costCode && isValidCostCode(line.costCode)) {
      costCode = line.costCode;
      costCodeSource = "provided";
    } else if (line.costCode) {
      costCode = suggestCostCode(line.description);
      costCodeSource = costCode ? "suggested" : "unclassified";
      warnings.push({
        code: "invalid_cost_code",
        sourceLineId: line.sourceLineId,
        message: `Estimator line ${line.sourceLineId} supplied invalid cost code ${line.costCode}.`,
      });
    } else {
      costCode = suggestCostCode(line.description);
      costCodeSource = costCode ? "suggested" : "unclassified";
      warnings.push({
        code: costCode ? "invalid_cost_code" : "unclassified_cost_code",
        sourceLineId: line.sourceLineId,
        message: costCode
          ? `Estimator line ${line.sourceLineId} needs confirmation of suggested cost code ${costCode}.`
          : `Estimator line ${line.sourceLineId} could not be classified to a shared cost code.`,
      });
    }

    if (line.quantity != null && line.rate != null) {
      const calculated = roundMoney(line.quantity * line.rate);
      if (relativeDifference(calculated, line.amount) > 0.005) {
        warnings.push({
          code: "line_arithmetic_mismatch",
          sourceLineId: line.sourceLineId,
          message: `Estimator line ${line.sourceLineId} amount does not agree with quantity × rate.`,
        });
      }
    }

    return {
      sourceLineId: line.sourceLineId,
      description: line.description,
      unit: line.unit ?? null,
      quantity: line.quantity ?? null,
      rate: line.rate ?? null,
      amount: roundMoney(line.amount),
      costCode,
      costCodeSource,
      supplyResponsibility: line.supplyResponsibility ?? "unknown",
    };
  });

  const lineTotal = roundMoney(lines.reduce((sum, line) => sum + line.amount, 0));
  if (relativeDifference(lineTotal, snapshot.internalCostBudget) > 0.01) {
    warnings.push({
      code: "budget_line_total_mismatch",
      message: `Budget line total (${lineTotal}) differs from internal cost budget (${roundMoney(snapshot.internalCostBudget)}).`,
    });
  }

  return {
    source: snapshot.source,
    sourceProjectId: snapshot.sourceProjectId,
    sourceEstimateId: snapshot.sourceEstimateId ?? null,
    sourceVersion: snapshot.sourceVersion,
    projectName: snapshot.projectName,
    currency: snapshot.currency,
    contractValue: snapshot.contractValue == null ? null : roundMoney(snapshot.contractValue),
    internalCostBudget: roundMoney(snapshot.internalCostBudget),
    priceBasisAt: snapshot.priceBasisAt ?? null,
    reviewed: true,
    lines,
    lineTotal,
    warnings,
    readyForImport:
      warnings.length === 0 &&
      lines.every((line) => line.costCodeSource === "provided" && line.costCode != null),
  };
}

function canonicalizeForFingerprint(snapshot: NormalizedEstimatorBridge) {
  return JSON.stringify({
    source: snapshot.source,
    sourceProjectId: snapshot.sourceProjectId,
    sourceEstimateId: snapshot.sourceEstimateId,
    sourceVersion: snapshot.sourceVersion,
    projectName: snapshot.projectName,
    currency: snapshot.currency,
    contractValue: snapshot.contractValue,
    internalCostBudget: snapshot.internalCostBudget,
    priceBasisAt: snapshot.priceBasisAt,
    lines: snapshot.lines.map((line) => ({
      sourceLineId: line.sourceLineId,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.rate,
      amount: line.amount,
      costCode: line.costCode,
      supplyResponsibility: line.supplyResponsibility,
    })),
  });
}

export async function fingerprintEstimatorBridge(snapshot: NormalizedEstimatorBridge) {
  const bytes = new TextEncoder().encode(canonicalizeForFingerprint(snapshot));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

export function assertEstimatorBridgeReady(snapshot: NormalizedEstimatorBridge) {
  if (!snapshot.readyForImport) {
    const reasons = snapshot.warnings.map((warning) => warning.message).join(" ");
    throw new Error(`Estimator snapshot requires review before import. ${reasons}`);
  }
  return snapshot;
}
