import { sha256 } from "js-sha256";
import { supabase } from "./supabase";
import type { PriorStatementRow, ProjectStatementItem, StatementAccount, StatementRow, TransferPair } from "./statement-import";

function uuidFrom(value: string) {
  const hex = sha256(value).slice(0, 32).split("");
  hex[12] = "4";
  hex[16] = ["8", "9", "a", "b"][parseInt(hex[16], 16) % 4];
  const s = hex.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20)}`;
}

function minMaxDates(rows: StatementRow[]) {
  const dates = rows.map(r => r.date).sort();
  return { start: dates[0], end: dates[dates.length - 1] };
}

function dateOffset(date: string, days: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function loadPriorStatementRows(companyId: string, sourceAccountId: string, rows: StatementRow[]) {
  const { start, end } = minMaxDates(rows);
  const { data: imports, error: importsError } = await supabase
    .from("statement_imports")
    .select("id,financial_account_id")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (importsError) throw importsError;
  const importRows = imports ?? [];
  if (!importRows.length) return { priorRows: [] as PriorStatementRow[], knownFingerprints: new Set<string>() };
  const importIds = importRows.map((r: any) => r.id);
  const accountByImport = new Map(importRows.map((r: any) => [r.id, r.financial_account_id]));
  const { data: history, error: rowsError } = await supabase
    .from("statement_rows")
    .select("id,import_id,transaction_date,narration,reference,signed_amount,normalized_fingerprint")
    .in("import_id", importIds)
    .gte("transaction_date", dateOffset(start, -1))
    .lte("transaction_date", dateOffset(end, 1))
    .limit(20000);
  if (rowsError) throw rowsError;
  const known = new Set<string>();
  const priorRows: PriorStatementRow[] = [];
  for (const row of history ?? []) {
    const accountId = String(accountByImport.get((row as any).import_id) ?? "");
    if (!accountId || !(row as any).transaction_date || (row as any).signed_amount === null) continue;
    if (accountId === sourceAccountId && (row as any).normalized_fingerprint) known.add(String((row as any).normalized_fingerprint));
    priorRows.push({
      id: String((row as any).id),
      statementKey: String((row as any).import_id),
      accountId,
      date: String((row as any).transaction_date),
      signedAmount: Number((row as any).signed_amount),
      description: String((row as any).narration ?? ""),
      reference: String((row as any).reference ?? ""),
    });
  }
  return { priorRows, knownFingerprints: known };
}

export async function saveStatementImport(args: {
  companyId: string;
  userId: string;
  sourceAccount: StatementAccount;
  fileName: string;
  fileBytes: ArrayBuffer;
  rows: StatementRow[];
}) {
  const { companyId, userId, sourceAccount, fileName, fileBytes, rows } = args;
  const fileHash = sha256(new Uint8Array(fileBytes));
  const { data: existing, error: existingError } = await supabase
    .from("source_documents")
    .select("id")
    .eq("company_id", companyId)
    .eq("document_type", "bank_statement")
    .eq("file_hash", fileHash)
    .limit(1)
    .maybeSingle();
  if (existingError) throw existingError;
  if (existing) throw new Error("This exact statement has already been imported.");

  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const storagePath = `${companyId}/bank-statements/${new Date().getUTCFullYear()}/${Date.now()}-${safeName}`;
  const { error: storageError } = await supabase.storage.from("financial-documents").upload(storagePath, fileBytes, {
    contentType: fileName.toLowerCase().endsWith(".csv") ? "text/csv" : "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    upsert: false,
  });
  if (storageError) throw storageError;

  let documentId: string | null = null;
  let importId: string | null = null;
  try {
    const { data: document, error: documentError } = await supabase.from("source_documents").insert({
      company_id: companyId,
      document_type: "bank_statement",
      file_name: fileName,
      storage_path: storagePath,
      file_hash: fileHash,
      source_name: sourceAccount.institution || sourceAccount.name,
      metadata: { format: "charismak_statement_v1", source_account_id: sourceAccount.id, original_size: fileBytes.byteLength },
      uploaded_by: userId,
    }).select("id").single();
    if (documentError) throw documentError;
    documentId = document.id;

    const { start, end } = minMaxDates(rows);
    const { data: imported, error: importError } = await supabase.from("statement_imports").insert({
      document_id: documentId,
      company_id: companyId,
      financial_account_id: sourceAccount.id,
      detected_institution_name: sourceAccount.institution || null,
      detected_account_name: sourceAccount.name,
      detected_account_number_masked: sourceAccount.number || null,
      period_start: start,
      period_end: end,
      status: "needs_review",
      detected_as_new_account: false,
      rows_total: rows.length,
      rows_new: rows.length,
      rows_already_known: 0,
      rows_need_review: 0,
    }).select("id").single();
    if (importError) throw importError;
    importId = imported.id;

    const idByIndex = new Map<number, string>();
    for (let startAt = 0; startAt < rows.length; startAt += 250) {
      const chunk = rows.slice(startAt, startAt + 250);
      const payload = chunk.map(row => ({
        import_id: importId,
        row_index: row.rowIndex,
        transaction_date: row.date,
        value_date: row.valueDate,
        narration: row.description,
        reference: row.reference || null,
        debit: row.debit,
        credit: row.credit,
        signed_amount: row.signedAmount,
        running_balance: row.balance,
        normalized_fingerprint: row.fingerprint,
        comparison_key: `${row.date}|${row.signedAmount.toFixed(2)}|${row.reference.trim().toLowerCase()}`,
        detection_status: "new",
        raw_payload: {
          Date: row.date,
          "Value Date": row.valueDate,
          Description: row.description,
          Debit: row.debit,
          Credit: row.credit,
          Balance: row.balance,
          Reference: row.reference,
          charismak_format: "v1",
        },
      }));
      const { data, error } = await supabase.from("statement_rows").insert(payload).select("id,row_index");
      if (error) throw error;
      for (const saved of data ?? []) idByIndex.set(Number((saved as any).row_index), String((saved as any).id));
    }
    return { importId, documentId, idByIndex, storagePath, fileHash };
  } catch (error) {
    if (importId) await supabase.from("statement_imports").delete().eq("id", importId);
    if (documentId) await supabase.from("source_documents").delete().eq("id", documentId);
    await supabase.storage.from("financial-documents").remove([storagePath]);
    throw error;
  }
}

async function linkedRowIds(rowIds: string[]) {
  if (!rowIds.length) return new Set<string>();
  const { data, error } = await supabase.from("statement_row_transaction_links").select("statement_row_id").in("statement_row_id", rowIds);
  if (error) throw error;
  return new Set((data ?? []).map((r: any) => String(r.statement_row_id)));
}

async function linkRows(rowIds: string[], transactionId: string, reason: string) {
  const unique = Array.from(new Set(rowIds.filter(Boolean)));
  if (!unique.length) return;
  const { error } = await supabase.from("statement_row_transaction_links").upsert(unique.map(statementRowId => ({
    statement_row_id: statementRowId,
    canonical_transaction_id: transactionId,
    confidence: 100,
    reason: { matched_by: reason },
  })), { onConflict: "statement_row_id,canonical_transaction_id" });
  if (error) throw error;
}

export async function postProjectStatementItems(args: {
  importId: string;
  companyId: string;
  sourceAccountId: string;
  rowIdByIndex: Map<number, string>;
  items: ProjectStatementItem[];
  onProgress?: (done: number, total: number) => void;
}) {
  const { importId, companyId, sourceAccountId, rowIdByIndex, items, onProgress } = args;
  const allRowIds = items.flatMap(item => [rowIdByIndex.get(item.row.rowIndex) ?? "", ...item.fees.map(f => rowIdByIndex.get(f.row.rowIndex) ?? "")]).filter(Boolean);
  const linked = await linkedRowIds(allRowIds);
  let posted = 0;
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    const parentRowId = rowIdByIndex.get(item.row.rowIndex);
    if (!parentRowId || linked.has(parentRowId)) { onProgress?.(i + 1, items.length); continue; }
    const requestKey = uuidFrom(`${importId}|row:${item.row.rowIndex}|${item.kind}`);
    const { data, error } = await supabase.rpc("post_manual_transaction_atomic", {
      request_key: requestKey,
      target_company: companyId,
      target_account: sourceAccountId,
      target_project: item.projectId,
      entry_kind: item.kind,
      entry_date: item.row.date,
      entry_amount: item.amount,
      entry_narration: item.row.description,
      entry_reference: item.row.reference || null,
      entry_counterparty: null,
      entry_category: item.kind === "project_expense" ? (item.category || "Other project cost") : null,
      entry_funding_source: item.kind === "company_project_funding" ? "company" : item.kind === "project_funding" ? "client" : null,
      entry_notes: item.fees.length ? `Imported from bank statement. Includes ${item.fees.length} linked bank charge${item.fees.length === 1 ? "" : "s"}.` : "Imported from bank statement.",
      target_approval_request: null,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const transactionId = String((result as any)?.transaction_id ?? "");
    if (!transactionId) throw new Error("The accounting entry was posted but could not be linked back to the statement.");
    await linkRows([parentRowId, ...item.fees.map(f => rowIdByIndex.get(f.row.rowIndex) ?? "")], transactionId, "confirmed_statement_group");
    posted += 1;
    onProgress?.(i + 1, items.length);
  }
  return posted;
}

export async function postStatementTransferPairs(args: {
  importId: string;
  companyId: string;
  rowIdByIndex: Map<number, string>;
  pairs: TransferPair[];
  onProgress?: (done: number, total: number) => void;
}) {
  const { importId, companyId, rowIdByIndex, pairs, onProgress } = args;
  let posted = 0;
  for (let i = 0; i < pairs.length; i += 1) {
    const pair = pairs[i];
    const currentRowId = rowIdByIndex.get(pair.row.rowIndex);
    if (!currentRowId) { onProgress?.(i + 1, pairs.length); continue; }
    const already = await linkedRowIds([currentRowId, pair.otherRow.id]);
    if (already.has(currentRowId) || already.has(pair.otherRow.id)) { onProgress?.(i + 1, pairs.length); continue; }
    const requestKey = uuidFrom(`${importId}|transfer:${pair.row.rowIndex}|${pair.otherRow.id}`);
    const { data, error } = await supabase.rpc("post_manual_transfer_atomic", {
      request_key: requestKey,
      target_company: companyId,
      from_account: pair.fromAccountId,
      to_account: pair.toAccountId,
      from_project: null,
      to_project: null,
      transfer_date: pair.row.date,
      transfer_amount: pair.amount,
      transfer_description: pair.row.description,
      transfer_reference: pair.row.reference || pair.otherRow.reference || null,
    });
    if (error) throw error;
    const result = Array.isArray(data) ? data[0] : data;
    const debitId = String((result as any)?.debit_transaction_id ?? "");
    const creditId = String((result as any)?.credit_transaction_id ?? "");
    if (!debitId || !creditId) throw new Error("The transfer was posted but could not be linked back to both statements.");
    const currentTransactionId = pair.row.signedAmount < 0 ? debitId : creditId;
    const otherTransactionId = pair.row.signedAmount < 0 ? creditId : debitId;
    await linkRows([currentRowId], currentTransactionId, "matched_own_account_transfer");
    await linkRows([pair.otherRow.id], otherTransactionId, "matched_own_account_transfer");
    posted += 1;
    onProgress?.(i + 1, pairs.length);
  }
  return posted;
}
