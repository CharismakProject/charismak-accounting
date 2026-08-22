export const INTAKE_SUPPORTED_EXTENSIONS = ["pdf", "xlsx", "xls", "docx", "jpg", "jpeg"] as const;

export type IntakeExtension = (typeof INTAKE_SUPPORTED_EXTENSIONS)[number];
export type IntakeRoute = "pdf" | "spreadsheet" | "word" | "image";

const supported = new Set<string>(INTAKE_SUPPORTED_EXTENSIONS);

export const INTAKE_ACCEPT = ".pdf,.xlsx,.xls,.docx,.jpg,.jpeg,application/pdf,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.wordprocessingml.document,image/jpeg";
export const INTAKE_FORMAT_HELP = "PDF / scanned PDF · Excel XLSX/XLS · Word DOCX · JPG/JPEG · 20 MB each";

export function extensionFromFileName(name: string): string {
  const clean = String(name || "").split(/[?#]/)[0];
  const ext = clean.includes(".") ? clean.split(".").pop() || "" : "";
  return ext.trim().toLowerCase();
}

export function isSupportedIntakeExtension(ext: string): ext is IntakeExtension {
  return supported.has(String(ext || "").toLowerCase());
}

export function isSupportedIntakeFileName(name: string): boolean {
  return isSupportedIntakeExtension(extensionFromFileName(name));
}

export function intakeRouteForExtension(ext: string): IntakeRoute | null {
  switch (String(ext || "").toLowerCase()) {
    case "pdf": return "pdf";
    case "xlsx":
    case "xls": return "spreadsheet";
    case "docx": return "word";
    case "jpg":
    case "jpeg": return "image";
    default: return null;
  }
}

export function intakeTypeLabel(ext: string): string {
  switch (intakeRouteForExtension(ext)) {
    case "pdf": return "PDF / scanned PDF";
    case "spreadsheet": return "Excel";
    case "word": return "Word";
    case "image": return "JPG image / scan";
    default: return "Unsupported file";
  }
}

export function safeUploadFileName(name: string): string {
  const clean = String(name || "file").replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_");
  return clean.slice(-140) || "file";
}

export function isDuplicateConstraintError(error: unknown): boolean {
  const e = error as { code?: string; message?: string; details?: string } | null | undefined;
  const text = `${e?.code || ""} ${e?.message || ""} ${e?.details || ""}`.toLowerCase();
  return text.includes("23505") || text.includes("duplicate key") || text.includes("source_documents_company_id_file_hash_key");
}
