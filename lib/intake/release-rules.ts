export const RELEASE_UPLOAD_EXTENSIONS = ["xlsx", "xls", "docx", "pdf", "jpg", "jpeg"] as const;
export type ReleaseUploadExtension = (typeof RELEASE_UPLOAD_EXTENSIONS)[number];

export function extensionOf(name: string) {
  return (name.split(".").pop() || "").trim().toLowerCase();
}

export function isReleaseUploadSupported(nameOrExtension: string) {
  const ext = nameOrExtension.includes(".") ? extensionOf(nameOrExtension) : nameOrExtension.toLowerCase();
  return (RELEASE_UPLOAD_EXTENSIONS as readonly string[]).includes(ext);
}

export function releaseUploadRoute(nameOrExtension: string): "excel" | "word" | "pdf" | "image" | "unsupported" {
  const ext = nameOrExtension.includes(".") ? extensionOf(nameOrExtension) : nameOrExtension.toLowerCase();
  if (ext === "xlsx" || ext === "xls") return "excel";
  if (ext === "docx") return "word";
  if (ext === "pdf") return "pdf";
  if (ext === "jpg" || ext === "jpeg") return "image";
  return "unsupported";
}

export const PROJECT_SIGNAL_NOISE = new Set([
  "DATE","VALUE","CHQ","TRANS","TRANSACTION","TRANSFER","IFO","NIP","NIBSS","BANK","ACCOUNT","ACCT","CREDIT","DEBIT","BALANCE","OPENING","CLOSING","APR","JAN","FEB","MAR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC","NGN","NIG","NIGERIA","LTD","LIMITED","INTERNATIONAL","SITE","CONSTRUCTION","FUND","FUNDS","PAYMENT","REFUND","FEE","FEES","CHARGE","CHARGES","LEVY","VAT","WHT","POS","ATM","USSD","WEB","ONLINE","REFERENCE","NARRATION","REMARK"
]);

export function isProjectSignalNoise(value: string) {
  return PROJECT_SIGNAL_NOISE.has(value.trim().toUpperCase());
}

function normalText(value: unknown) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ._\-/]/g, "");
}
function normalMoney(value: unknown) {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  const n = Number(raw.replace(/,/g, ""));
  return Number.isFinite(n) ? String(n) : raw;
}

export type TransactionIdentityInput = {
  transactionDate?: string | null;
  valueDate?: string | null;
  reference?: string | null;
  signedAmount?: string | number | null;
  narration?: string | null;
  counterparty?: string | null;
  runningBalance?: string | number | null;
};

export function transactionIdentityKey(row: TransactionIdentityInput) {
  return [
    row.transactionDate || "",
    row.valueDate || "",
    normalText(row.reference),
    normalMoney(row.signedAmount),
    normalText(row.narration),
    normalText(row.counterparty),
    normalMoney(row.runningBalance),
  ].join("|");
}
