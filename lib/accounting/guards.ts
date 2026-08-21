export const STATEMENT_CLASSIFICATIONS = [
  "project_expense",
  "project_funding",
  "company_expense",
  "company_income",
  "company_financing",
  "personal_non_business",
  "internal_transfer",
] as const;

export const PROJECT_CLASSIFICATIONS = new Set(["project_expense", "project_funding"]);
export const CATEGORISED_EXPENSE_CLASSIFICATIONS = new Set(["project_expense", "company_expense"]);

export function parseRequiredMoney(value: unknown, label: string, options: { allowZero?: boolean } = {}) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) throw new Error(`${label} must be a valid number.`);
  if (options.allowZero ? amount < 0 : amount <= 0) {
    throw new Error(`${label} must be ${options.allowZero ? "zero or greater" : "greater than zero"}.`);
  }
  return amount;
}

export function parseOptionalNonNegativeMoney(value: unknown, label: string) {
  if (value === null || value === undefined || String(value).trim() === "") return null;
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} must be zero or greater.`);
  return amount;
}

export function validateApprovalDecision(action: string, requestAmountRaw: unknown, approvedAmountRaw?: unknown) {
  const requestAmount = parseRequiredMoney(requestAmountRaw, "Request amount");
  if (action === "approve") return { approvedAmount: requestAmount, status: "approved" };
  if (action === "reject") return { approvedAmount: 0, status: "rejected" };
  if (action === "return") return { approvedAmount: 0, status: "returned" };
  if (action !== "partial_approve") throw new Error("Unsupported approval decision.");

  const approvedAmount = parseRequiredMoney(approvedAmountRaw, "Partial approval", { allowZero: false });
  if (approvedAmount >= requestAmount) {
    throw new Error("Partial approval must be less than the original request amount. Use Approve for the full amount.");
  }
  return { approvedAmount, status: "partially_approved" };
}

export function validateInternalTransfer(input: {
  amount: unknown;
  fromAccountId?: string | null;
  toAccountId?: string | null;
}) {
  const amount = parseRequiredMoney(input.amount, "Transfer amount", { allowZero: false });
  const fromAccountId = String(input.fromAccountId || "").trim();
  const toAccountId = String(input.toAccountId || "").trim();
  if (!fromAccountId || !toAccountId) throw new Error("Choose both the source and destination financial accounts.");
  if (fromAccountId === toAccountId) throw new Error("Source and destination accounts must be different.");
  return { amount, fromAccountId, toAccountId };
}

export function validateProgressInput(percentRaw: unknown, costToCompleteRaw?: unknown) {
  const percent = Number(percentRaw);
  if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new Error("Progress must be between 0 and 100.");
  const costToComplete = parseOptionalNonNegativeMoney(costToCompleteRaw, "Cost to complete");
  return { percent, costToComplete };
}

export function validateStatementClassification(value: unknown) {
  const classification = String(value || "").trim();
  if (!(STATEMENT_CLASSIFICATIONS as readonly string[]).includes(classification)) {
    throw new Error("Choose a valid accounting classification before confirming this transaction.");
  }
  return classification;
}

export function categoryForClassification(classification: string, rawCategory: unknown) {
  if (!CATEGORISED_EXPENSE_CLASSIFICATIONS.has(classification)) return null;
  const category = String(rawCategory || "").trim();
  return category || "Uncategorised";
}

export function inferFinancialAccountType(institutionName: unknown, accountName: unknown) {
  const identity = `${String(institutionName || "")} ${String(accountName || "")}`.toLowerCase();
  return /\b(opay|owealth|palmpay|moniepoint|wallet|fintech)\b/.test(identity) ? "fintech_wallet" : "bank";
}

export function validateUploadBatch(fileCount: number, totalBytes: number, limits = { maxFiles: 20, maxTotalBytes: 100 * 1024 * 1024 }) {
  if (!Number.isInteger(fileCount) || fileCount < 1) throw new Error("Choose at least one file.");
  if (fileCount > limits.maxFiles) throw new Error(`Upload up to ${limits.maxFiles} files in one batch.`);
  if (!Number.isFinite(totalBytes) || totalBytes < 0) throw new Error("The selected upload size is invalid.");
  if (totalBytes > limits.maxTotalBytes) throw new Error("This batch is too large. Keep the combined upload at 100 MB or less.");
  return true;
}
