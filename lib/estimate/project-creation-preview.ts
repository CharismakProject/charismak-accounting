import type { EstimateSummary } from "./estimate-summary.ts";
import type { ReviewedBoqDecisionMap } from "./review-decision.ts";
import { isValidCostCode, type CostCode } from "../project-cost/cost-codes.ts";
import type { BoqSupplyResponsibility, SectionedBoq } from "./sectioned-boq.ts";

export type InternalBudgetBasis = "direct_cost" | "direct_plus_contingency" | "explicit";
export type ContractValueBasis = "grand_total" | "subtotal_before_tax" | "explicit" | "none";

export type ProjectCreationChoice = {
  projectName: string;
  internalBudgetBasis: InternalBudgetBasis | null;
  contractValueBasis: ContractValueBasis | null;
  explicitInternalBudget?: number | null;
  explicitContractValue?: number | null;
};

export type ProjectBudgetLinePreview = {
  sourceLineId: string;
  itemNo?: string;
  description: string;
  unit: string;
  quantity: number;
  rate: number;
  amount: number;
  costCode: CostCode;
  supplyResponsibility: BoqSupplyResponsibility;
};

export type ProjectBudgetAllowancePreview = {
  sourceAllowanceId: string;
  kind: "contingency" | "other";
  description: string;
  amount: number;
};

export type ProjectCreationPreview = {
  sourceEstimateId: string;
  project: {
    name: string;
    currency: string;
    internalCostBudget: number | null;
    contractValue: number | null;
  };
  commercialSnapshot: Pick<EstimateSummary,
    "directCost" | "contingency" | "overhead" | "profit" | "discount" | "subtotalBeforeTax" | "tax" | "grandTotal"
  >;
  internalDirectCost: number;
  internalContingencyAllowance: number;
  clientSuppliedExcludedValue: number;
  budgetLines: ProjectBudgetLinePreview[];
  budgetAllowances: ProjectBudgetAllowancePreview[];
  materials: EstimateSummary["materials"];
  forecastProfit: number | null;
  issues: string[];
  readyToStage: boolean;
};

const validMoney = (value: number | null | undefined) => value != null && Number.isFinite(value) && value >= 0;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;
const percentage = (value: number) => Number.isFinite(value) ? Math.max(0, Math.min(100, value)) / 100 : 0;

export function buildProjectCreationPreview(input: {
  boq: SectionedBoq;
  summary: EstimateSummary;
  decisions: ReviewedBoqDecisionMap;
  choice: ProjectCreationChoice;
}): ProjectCreationPreview {
  const { boq, summary, decisions, choice } = input;
  const issues: string[] = [];
  const projectName = choice.projectName.trim();
  if (!projectName) issues.push("Enter a project name.");

  if (summary.unpricedItems > 0) {
    issues.push(`${summary.unpricedItems} BOQ item${summary.unpricedItems === 1 ? " is" : "s are"} still unpriced.`);
  }
  if (summary.arithmeticMismatchItems > 0) {
    issues.push(`${summary.arithmeticMismatchItems} imported BOQ item${summary.arithmeticMismatchItems === 1 ? " has" : "s have"} a source Amount that does not equal Qty × imported Rate. Review and explicitly confirm/change the working rate before Project staging.`);
  }

  const budgetLines: ProjectBudgetLinePreview[] = [];
  let clientSuppliedExcludedValue = 0;
  for (const line of summary.lines) {
    const decision = decisions[line.itemId];
    if (!decision?.confirmed) {
      issues.push(`BOQ item ${line.itemNo || line.itemId} is not fully confirmed.`);
      continue;
    }
    if (!isValidCostCode(decision.costCode)) {
      issues.push(`BOQ item ${line.itemNo || line.itemId} needs a valid reviewed cost code.`);
      continue;
    }
    if (decision.supplyResponsibility === "unknown") {
      issues.push(`BOQ item ${line.itemNo || line.itemId} still has unknown supply responsibility.`);
      continue;
    }
    if (line.workingRate == null || line.amount == null) continue;
    if (decision.supplyResponsibility === "client") {
      clientSuppliedExcludedValue = roundMoney(clientSuppliedExcludedValue + line.amount);
      continue;
    }
    budgetLines.push({
      sourceLineId: line.itemId,
      itemNo: line.itemNo,
      description: line.description,
      unit: line.unit,
      quantity: line.quantity,
      rate: line.workingRate,
      amount: line.amount,
      costCode: decision.costCode,
      supplyResponsibility: decision.supplyResponsibility,
    });
  }

  const internalDirectCost = roundMoney(budgetLines.reduce((sum, line) => sum + line.amount, 0));
  const internalContingencyAllowance = roundMoney(internalDirectCost * percentage(summary.settings.contingencyPercent));
  let internalCostBudget: number | null = null;
  const budgetAllowances: ProjectBudgetAllowancePreview[] = [];
  if (!choice.internalBudgetBasis) {
    issues.push("Choose what becomes the internal project cost budget.");
  } else if (choice.internalBudgetBasis === "direct_cost") {
    internalCostBudget = internalDirectCost;
  } else if (choice.internalBudgetBasis === "direct_plus_contingency") {
    internalCostBudget = roundMoney(internalDirectCost + internalContingencyAllowance);
    if (internalContingencyAllowance > 0) budgetAllowances.push({
      sourceAllowanceId: `${boq.id}-contingency`,
      kind: "contingency",
      description: `Reviewed internal contingency (${summary.settings.contingencyPercent}%)`,
      amount: internalContingencyAllowance,
    });
  } else if (!validMoney(choice.explicitInternalBudget)) {
    issues.push("Enter a valid explicit internal cost budget.");
  } else {
    internalCostBudget = roundMoney(choice.explicitInternalBudget!);
    if (internalCostBudget < internalDirectCost) {
      issues.push("The explicit internal cost budget cannot be below the reviewed contractor direct cost.");
    } else if (internalCostBudget > internalDirectCost) {
      budgetAllowances.push({
        sourceAllowanceId: `${boq.id}-reviewed-reserve`,
        kind: "other",
        description: "Reviewed project cost reserve",
        amount: roundMoney(internalCostBudget - internalDirectCost),
      });
    }
  }

  let contractValue: number | null = null;
  if (!choice.contractValueBasis) {
    issues.push("Choose what becomes the project contract value, or choose no contract value yet.");
  } else if (choice.contractValueBasis === "grand_total") {
    contractValue = summary.grandTotal;
  } else if (choice.contractValueBasis === "subtotal_before_tax") {
    contractValue = summary.subtotalBeforeTax;
  } else if (choice.contractValueBasis === "explicit") {
    if (!validMoney(choice.explicitContractValue)) issues.push("Enter a valid explicit contract value.");
    else contractValue = roundMoney(choice.explicitContractValue!);
  }

  const uniqueIssues = [...new Set(issues)];
  const forecastProfit = contractValue == null || internalCostBudget == null
    ? null
    : roundMoney(contractValue - internalCostBudget);

  return {
    sourceEstimateId: boq.id,
    project: {
      name: projectName,
      currency: boq.currency,
      internalCostBudget,
      contractValue,
    },
    commercialSnapshot: {
      directCost: summary.directCost,
      contingency: summary.contingency,
      overhead: summary.overhead,
      profit: summary.profit,
      discount: summary.discount,
      subtotalBeforeTax: summary.subtotalBeforeTax,
      tax: summary.tax,
      grandTotal: summary.grandTotal,
    },
    internalDirectCost,
    internalContingencyAllowance,
    clientSuppliedExcludedValue,
    budgetLines,
    budgetAllowances,
    materials: summary.materials,
    forecastProfit,
    issues: uniqueIssues,
    readyToStage: uniqueIssues.length === 0 && internalCostBudget != null,
  };
}

export function serializeProjectCreationPreview(preview: ProjectCreationPreview) {
  return JSON.stringify({ schemaVersion: 1, sourceSystem: "charismak_app_estimate", reviewed: true, ...preview }, null, 2);
}
