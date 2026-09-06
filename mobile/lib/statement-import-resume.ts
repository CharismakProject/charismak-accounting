import { sha256 } from "js-sha256";
import { supabase } from "./supabase";

export async function findExistingStatementImport(companyId: string, fileBytes: ArrayBuffer) {
  const fileHash = sha256(new Uint8Array(fileBytes));
  const { data: document, error: documentError } = await supabase
    .from("source_documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("document_type", "bank_statement")
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();
  if (documentError) throw documentError;
  if (!document) return null;
  const { data: imported, error: importError } = await supabase
    .from("statement_imports")
    .select("id,financial_account_id")
    .eq("document_id", document.id)
    .limit(1)
    .maybeSingle();
  if (importError) throw importError;
  if (!imported) return null;
  const { data: rows, error: rowsError } = await supabase
    .from("statement_rows")
    .select("id,row_index")
    .eq("import_id", imported.id)
    .limit(20000);
  if (rowsError) throw rowsError;
  const idByIndex = new Map<number, string>();
  for (const row of rows ?? []) idByIndex.set(Number((row as any).row_index), String((row as any).id));
  return { importId: String(imported.id), documentId: String(document.id), sourceAccountId: String(imported.financial_account_id), idByIndex, fileHash };
}
