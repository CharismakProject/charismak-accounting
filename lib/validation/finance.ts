export const FINAL_TRANSACTION_CLASSIFICATIONS = new Set([
  "project_expense",
  "project_funding",
  "company_expense",
  "company_income",
  "personal_non_business",
  "internal_transfer",
]);

export const PROJECT_STATUSES = new Set(["draft", "active", "on_hold", "completed", "cancelled"]);
export const APPROVAL_URGENCIES = new Set(["normal", "urgent", "emergency"]);
export const APPROVAL_REQUEST_TYPES = new Set([
  "purchase",
  "labour",
  "subcontract",
  "imprest",
  "material_advance",
  "hire",
  "reimbursement",
  "salary",
  "project_funding",
  "supplier",
  "variation",
  "company_expense",
]);
export const FINANCIAL_ACCOUNT_TYPES = new Set(["bank", "fintech_wallet", "cash", "credit_card", "other"]);

export function requiredPositiveMoney(value: FormDataEntryValue | string | number | null | undefined, label = "Amount") {
  const raw = String(value ?? "").trim();
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed <= 0) throw new Error(`${label} must be greater than zero.`);
  return parsed;
}

export function optionalNonNegativeMoney(value: FormDataEntryValue | string | number | null | undefined, label = "Amount") {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error(`${label} must be zero or greater.`);
  return parsed;
}

export function requiredProgressPercent(value: FormDataEntryValue | string | number | null | undefined) {
  const raw = String(value ?? "").trim();
  const parsed = Number(raw);
  if (!raw || !Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error("Progress must be between 0 and 100%.");
  return parsed;
}

export function optionalProgressPercent(value: FormDataEntryValue | string | number | null | undefined, fallback = 0) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) throw new Error("Progress must be between 0 and 100%.");
  return parsed;
}

export function requireAllowed(value: string, allowed: Set<string>, label: string) {
  if (!allowed.has(value)) throw new Error(`${label} is not valid.`);
  return value;
}

export function optionalIsoDate(value: FormDataEntryValue | string | null | undefined, label = "Date") {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) throw new Error(`${label} must use YYYY-MM-DD format.`);
  const parsed = new Date(`${raw}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== raw) throw new Error(`${label} is not a real calendar date.`);
  return raw;
}

export function assertDateOrder(start: string | null, end: string | null) {
  if (start && end && end < start) throw new Error("Project end date cannot be earlier than the start date.");
}

export function boundedText(value: FormDataEntryValue | string | null | undefined, label: string, max: number, required = false) {
  const text = String(value ?? "").trim();
  if (required && !text) throw new Error(`${label} is required.`);
  if (text.length > max) throw new Error(`${label} must be ${max} characters or fewer.`);
  return text;
}
