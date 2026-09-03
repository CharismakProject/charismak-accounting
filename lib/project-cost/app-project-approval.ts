import { isValidCostCode } from "./cost-codes.ts";
import type { StagedProjectWorkspace } from "../estimate/staged-project-workspace.ts";

export type ProjectApprovalDetails = {
  location: string;
  projectCode?: string | null;
  clientName?: string | null;
  projectType?: string | null;
  startDate?: string | null;
  expectedEndDate?: string | null;
  description?: string | null;
};

export type CreateAppProjectFromEstimateRpcArgs = {
  target_company: string;
  source_workspace_id: string;
  source_estimate_id: string;
  source_version: number;
  source_fingerprint: string;
  project_name: string;
  project_location: string;
  project_code: string | null;
  project_client_name: string | null;
  project_type: string | null;
  project_start_date: string | null;
  project_expected_end_date: string | null;
  project_description: string | null;
  budget_currency_code: string;
  budget_direct_cost: number;
  budget_allowance_total: number;
  budget_internal_cost: number;
  budget_contract_value_snapshot: number | null;
  budget_lines: Array<{
    source_line_id: string;
    cost_code: string;
    description: string;
    unit: string | null;
    quantity: number | null;
    rate: number | null;
    amount: number;
    supply_responsibility: string;
  }>;
  budget_allowances: Array<{
    source_allowance_id: string;
    kind: "contingency" | "other";
    description: string;
    amount: number;
  }>;
  budget_materials: Array<{
    material_key: string;
    material: string;
    unit: string;
    quantity: number;
    sources: unknown[];
  }>;
};

export type CreateAppProjectFromEstimateRpcResult = {
  status: "created" | "existing";
  project_id: string;
  budget_id: string;
  budget_version: number;
  budget_status: "approved";
};

const round = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const optional = (value: string | null | undefined) => {
  const trimmed = value?.trim() ?? "";
  return trimmed || null;
};
const validIsoDate = (value: string | null | undefined) => !value || /^\d{4}-\d{2}-\d{2}$/.test(value);

export function validateAppProjectApproval(workspace: StagedProjectWorkspace, details: ProjectApprovalDetails) {
  const issues: string[] = [];
  if (workspace.schemaVersion !== 1 || workspace.sourceSystem !== "charismak_app_estimate" || workspace.status !== "reviewed_draft" || workspace.reviewed !== true) issues.push("The staged workspace is not a reviewed Charismak App Estimate draft.");
  if (!workspace.project.name.trim()) issues.push("Project name is required.");
  if (!details.location.trim()) issues.push("Project location is required before live approval.");
  if (!/^[A-Z]{3}$/.test(workspace.project.currency.toUpperCase())) issues.push("Project currency must be a three-letter code.");
  if (workspace.project.internalCostBudget == null || workspace.project.internalCostBudget < 0) issues.push("A valid internal cost budget is required.");
  if (workspace.project.contractValue != null && workspace.project.contractValue < 0) issues.push("Contract value cannot be negative.");
  if (Math.abs(workspace.budgetBaseline.reconciliationDifference) > 0.005) issues.push("Budget lines plus allowances no longer reconcile to the reviewed internal budget.");
  if (!workspace.budgetLines.length) issues.push("At least one reviewed project-cost line is required.");
  const ids = new Set<string>();
  for (const line of workspace.budgetLines) {
    if (!line.sourceLineId.trim() || ids.has(line.sourceLineId)) issues.push(`Duplicate or missing BOQ source line ID: ${line.sourceLineId || "(blank)"}.`);
    ids.add(line.sourceLineId);
    if (!isValidCostCode(line.costCode)) issues.push(`BOQ line ${line.itemNo || line.sourceLineId} has an invalid cost code.`);
    if (!["contractor", "specialist", "labour_only"].includes(line.supplyResponsibility)) issues.push(`BOQ line ${line.itemNo || line.sourceLineId} is not a contractor-side project-cost line.`);
    if (!Number.isFinite(line.amount) || line.amount < 0) issues.push(`BOQ line ${line.itemNo || line.sourceLineId} has an invalid amount.`);
  }
  const direct = round(workspace.budgetLines.reduce((sum, line) => sum + line.amount, 0));
  const allowances = round(workspace.budgetAllowances.reduce((sum, line) => sum + line.amount, 0));
  if (Math.abs(direct - workspace.internalDirectCost) > 0.005) issues.push("Reviewed project-cost lines no longer equal contractor Direct Cost.");
  if (workspace.project.internalCostBudget != null && Math.abs(round(direct + allowances) - round(workspace.project.internalCostBudget)) > 0.005) issues.push("Direct Cost plus allowances no longer equals the internal project budget.");
  if (!validIsoDate(details.startDate) || !validIsoDate(details.expectedEndDate)) issues.push("Project dates must use YYYY-MM-DD.");
  if (details.startDate && details.expectedEndDate && details.expectedEndDate < details.startDate) issues.push("Expected completion date cannot be before the start date.");
  for (const material of workspace.materials) if (!material.key || !material.material.trim() || !material.unit.trim() || !Number.isFinite(material.quantity) || material.quantity < 0) issues.push("One or more material schedule rows are invalid.");
  return [...new Set(issues)];
}

function canonicalApproval(workspace: StagedProjectWorkspace, details: ProjectApprovalDetails) {
  return JSON.stringify({
    schemaVersion: 1,
    sourceSystem: "charismak_app_estimate",
    sourceWorkspaceId: workspace.workspaceId,
    sourceEstimateId: workspace.sourceEstimateId,
    project: { name: workspace.project.name.trim(), location: details.location.trim(), projectCode: optional(details.projectCode), clientName: optional(details.clientName), projectType: optional(details.projectType), startDate: optional(details.startDate), expectedEndDate: optional(details.expectedEndDate), description: optional(details.description), currency: workspace.project.currency.toUpperCase(), internalCostBudget: round(workspace.project.internalCostBudget ?? 0), contractValue: workspace.project.contractValue == null ? null : round(workspace.project.contractValue) },
    lines: workspace.budgetLines.map(line => ({ sourceLineId: line.sourceLineId, costCode: line.costCode, description: line.description, unit: line.unit || null, quantity: line.quantity, rate: line.rate, amount: round(line.amount), supplyResponsibility: line.supplyResponsibility })),
    allowances: workspace.budgetAllowances.map(row => ({ sourceAllowanceId: row.sourceAllowanceId, kind: row.kind, description: row.description, amount: round(row.amount) })),
    materials: workspace.materials.map(row => ({ key: row.key, material: row.material, unit: row.unit, quantity: row.quantity, sources: row.sources })),
  });
}

export async function fingerprintAppProjectApproval(workspace: StagedProjectWorkspace, details: ProjectApprovalDetails) {
  const bytes = new TextEncoder().encode(canonicalApproval(workspace, details));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map(value => value.toString(16).padStart(2, "0")).join("");
}

export async function buildCreateAppProjectFromEstimateRpcArgs(input: { companyId: string; workspace: StagedProjectWorkspace; details: ProjectApprovalDetails }): Promise<CreateAppProjectFromEstimateRpcArgs> {
  const companyId = input.companyId.trim();
  if (!companyId) throw new Error("Company ID is required.");
  const issues = validateAppProjectApproval(input.workspace, input.details);
  if (issues.length) throw new Error(issues.join(" "));
  const w = input.workspace;
  return {
    target_company: companyId,
    source_workspace_id: w.workspaceId,
    source_estimate_id: w.sourceEstimateId,
    source_version: 1,
    source_fingerprint: await fingerprintAppProjectApproval(w, input.details),
    project_name: w.project.name.trim(),
    project_location: input.details.location.trim(),
    project_code: optional(input.details.projectCode),
    project_client_name: optional(input.details.clientName),
    project_type: optional(input.details.projectType),
    project_start_date: optional(input.details.startDate),
    project_expected_end_date: optional(input.details.expectedEndDate),
    project_description: optional(input.details.description),
    budget_currency_code: w.project.currency.toUpperCase(),
    budget_direct_cost: round(w.internalDirectCost),
    budget_allowance_total: round(w.budgetBaseline.allowanceTotal),
    budget_internal_cost: round(w.project.internalCostBudget!),
    budget_contract_value_snapshot: w.project.contractValue == null ? null : round(w.project.contractValue),
    budget_lines: w.budgetLines.map(line => ({ source_line_id: line.sourceLineId, cost_code: line.costCode, description: line.description, unit: line.unit || null, quantity: line.quantity, rate: line.rate, amount: round(line.amount), supply_responsibility: line.supplyResponsibility })),
    budget_allowances: w.budgetAllowances.map(row => ({ source_allowance_id: row.sourceAllowanceId, kind: row.kind, description: row.description, amount: round(row.amount) })),
    budget_materials: w.materials.map(row => ({ material_key: row.key, material: row.material, unit: row.unit, quantity: row.quantity, sources: row.sources })),
  };
}
