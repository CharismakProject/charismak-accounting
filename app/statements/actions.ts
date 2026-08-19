"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

type CsvRow = Record<string, string>;

type ParsedStatementRow = {
  rowIndex: number;
  transactionDate: string | null;
  valueDate: string | null;
  narration: string;
  reference: string;
  counterparty: string;
  debit: number | null;
  credit: number | null;
  signedAmount: number | null;
  runningBalance: number | null;
  fingerprint: string;
  raw: CsvRow;
};

function normalise(value: string | null | undefined) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 ._\-/]/g, "");
}

function parseMoney(value: string | null | undefined) {
  const cleaned = String(value ?? "")
    .replace(/[₦,$\s]/g, "")
    .replace(/\(([^)]+)\)/, "-$1")
    .trim();
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseDate(value: string | null | undefined) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct.toISOString().slice(0, 10);

  const match = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/);
  if (!match) return null;
  const [, d, m, y] = match;
  const year = y.length === 2 ? `20${y}` : y;
  const date = new Date(`${year}-${m.padStart(2, "0")}-${d.padStart(2, "0")}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    if (char === '"') {
      if (quoted && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
}

function parseCsv(text: string): CsvRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) return [];
  const headers = splitCsvLine(lines[0]).map((h) => normalise(h));
  return lines.slice(1).map((line) => {
    const values = splitCsvLine(line);
    return Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
  });
}

function first(row: CsvRow, keys: string[]) {
  for (const key of keys) {
    const found = row[key];
    if (found !== undefined && String(found).trim() !== "") return found;
  }
  return "";
}

function mapCsvRows(rows: CsvRow[]): ParsedStatementRow[] {
  return rows.map((row, index) => {
    const transactionDate = parseDate(first(row, ["transaction date", "date", "trans date", "posting date", "posted date"]));
    const valueDate = parseDate(first(row, ["value date", "effective date"]));
    const narration = first(row, ["narration", "description", "transaction details", "details", "remarks", "memo"]);
    const reference = first(row, ["reference", "reference no", "reference number", "ref", "transaction reference"]);
    const counterparty = first(row, ["counterparty", "beneficiary", "payer", "payee", "sender", "recipient"]);
    const debit = parseMoney(first(row, ["debit", "debit amount", "withdrawal", "withdrawals", "money out"]));
    const credit = parseMoney(first(row, ["credit", "credit amount", "deposit", "deposits", "money in"]));
    let signedAmount = parseMoney(first(row, ["amount", "transaction amount"]));
    if (signedAmount === null) signedAmount = credit !== null ? credit : debit !== null ? -Math.abs(debit) : null;
    const runningBalance = parseMoney(first(row, ["balance", "running balance", "closing balance"]));
    const fingerprintSource = [transactionDate ?? "", normalise(reference), signedAmount ?? "", normalise(narration), normalise(counterparty)].join("|");
    const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex");
    return { rowIndex: index + 1, transactionDate, valueDate, narration, reference, counterparty, debit, credit, signedAmount, runningBalance, fingerprint, raw: row };
  }).filter((row) => row.transactionDate || row.narration || row.signedAmount !== null);
}

async function getContext() {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;
  if (!userId) redirect("/login");

  const { data: membership, error } = await supabase
    .from("company_memberships")
    .select("id, company_id, is_owner")
    .eq("user_id", userId)
    .eq("status", "active")
    .limit(1)
    .single();

  if (error || !membership) redirect("/login?message=No+active+company+membership");
  return { supabase, userId, membership };
}

export async function uploadStatement(formData: FormData) {
  const { supabase, userId, membership } = await getContext();
  const file = formData.get("statement") as File | null;
  if (!file || file.size === 0) throw new Error("Select a statement file first.");

  const allowedExt = ["csv", "pdf", "xls", "xlsx"];
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (!allowedExt.includes(ext)) throw new Error("Use CSV, PDF, XLS or XLSX for bank statements.");
  if (file.size > 20 * 1024 * 1024) throw new Error("File exceeds the 20 MB upload limit.");

  const bytes = Buffer.from(await file.arrayBuffer());
  const fileHash = createHash("sha256").update(bytes).digest("hex");

  const { data: existingDocument } = await supabase
    .from("source_documents")
    .select("id, statement:statement_imports(id)")
    .eq("company_id", membership.company_id)
    .eq("document_type", "bank_statement")
    .eq("file_hash", fileHash)
    .maybeSingle();

  if (existingDocument) {
    const existingStatement = Array.isArray(existingDocument.statement) ? existingDocument.statement[0] : existingDocument.statement;
    const existingId = existingStatement?.id;
    if (existingId) redirect(`/statements/${existingId}?duplicate=1`);
    throw new Error("This exact statement file has already been uploaded.");
  }

  const institutionName = String(formData.get("institution_name") || "").trim();
  const accountName = String(formData.get("account_name") || "").trim();
  const accountMasked = String(formData.get("account_number_masked") || "").trim();
  if (!accountName) throw new Error("Enter an account name/label so recurring statements can be matched correctly.");

  let accountQuery = supabase
    .from("financial_accounts")
    .select("id, institution_name, account_name, account_number_masked")
    .eq("company_id", membership.company_id)
    .eq("account_type", "bank")
    .eq("account_name", accountName);
  if (institutionName) accountQuery = accountQuery.eq("institution_name", institutionName);
  if (accountMasked) accountQuery = accountQuery.eq("account_number_masked", accountMasked);
  const { data: existingAccount } = await accountQuery.limit(1).maybeSingle();

  let accountId = existingAccount?.id as string | undefined;
  const newAccount = !accountId;
  if (!accountId) {
    const { data: createdAccount, error: accountError } = await supabase
      .from("financial_accounts")
      .insert({
        company_id: membership.company_id,
        account_type: "bank",
        institution_name: institutionName || null,
        account_name: accountName,
        account_number_masked: accountMasked || null,
        created_by: userId,
      })
      .select("id")
      .single();
    if (accountError) throw new Error(accountError.message);
    accountId = createdAccount.id;
  }

  const storagePath = `${membership.company_id}/bank-statements/${new Date().getUTCFullYear()}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  const { error: storageError } = await supabase.storage.from("financial-documents").upload(storagePath, bytes, {
    contentType: file.type || "application/octet-stream",
    upsert: false,
  });
  if (storageError) throw new Error(storageError.message);

  const { data: document, error: documentError } = await supabase
    .from("source_documents")
    .insert({
      company_id: membership.company_id,
      document_type: "bank_statement",
      file_name: file.name,
      storage_path: storagePath,
      file_hash: fileHash,
      source_name: institutionName || accountName,
      metadata: { original_size: file.size, extension: ext, mime_type: file.type || null },
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (documentError) throw new Error(documentError.message);

  let parsedRows: ParsedStatementRow[] = [];
  if (ext === "csv") parsedRows = mapCsvRows(parseCsv(bytes.toString("utf8")));

  const datedRows = parsedRows.filter((row) => row.transactionDate).map((row) => row.transactionDate as string).sort();
  const periodStart = datedRows[0] ?? null;
  const periodEnd = datedRows[datedRows.length - 1] ?? null;

  let overlappingImportId: string | null = null;
  if (periodStart && periodEnd && accountId) {
    const { data: overlap } = await supabase
      .from("statement_imports")
      .select("id, period_start, period_end")
      .eq("company_id", membership.company_id)
      .eq("financial_account_id", accountId)
      .lte("period_start", periodEnd)
      .gte("period_end", periodStart)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    overlappingImportId = overlap?.id ?? null;
  }

  const { data: statementImport, error: importError } = await supabase
    .from("statement_imports")
    .insert({
      document_id: document.id,
      company_id: membership.company_id,
      financial_account_id: accountId,
      detected_institution_name: institutionName || null,
      detected_account_name: accountName,
      detected_account_number_masked: accountMasked || null,
      period_start: periodStart,
      period_end: periodEnd,
      status: ext === "csv" ? "needs_review" : "uploaded",
      overlapping_import_id: overlappingImportId,
      detected_as_new_account: newAccount,
      rows_total: parsedRows.length,
    })
    .select("id")
    .single();
  if (importError) throw new Error(importError.message);

  let knownCount = 0;
  let newCount = 0;
  let reviewCount = 0;

  const { data: projects } = await supabase
    .from("projects")
    .select("id, project_code, name, aliases")
    .eq("company_id", membership.company_id)
    .in("status", ["draft", "active", "on_hold"]);

  for (const row of parsedRows) {
    const { data: knownTransaction } = await supabase
      .from("canonical_transactions")
      .select("id")
      .eq("company_id", membership.company_id)
      .eq("normalized_fingerprint", row.fingerprint)
      .limit(1)
      .maybeSingle();

    const detectionStatus = knownTransaction ? "already_known" : row.signedAmount === null || !row.transactionDate ? "needs_review" : "new";
    if (detectionStatus === "already_known") knownCount += 1;
    else if (detectionStatus === "new") newCount += 1;
    else reviewCount += 1;

    const { data: statementRow, error: rowError } = await supabase
      .from("statement_rows")
      .insert({
        import_id: statementImport.id,
        row_index: row.rowIndex,
        transaction_date: row.transactionDate,
        value_date: row.valueDate,
        narration: row.narration || null,
        reference: row.reference || null,
        counterparty: row.counterparty || null,
        debit: row.debit,
        credit: row.credit,
        signed_amount: row.signedAmount,
        running_balance: row.runningBalance,
        normalized_fingerprint: row.fingerprint,
        comparison_key: `${row.transactionDate ?? ""}|${row.signedAmount ?? ""}|${normalise(row.reference)}`,
        detection_status: detectionStatus,
        raw_payload: row.raw,
      })
      .select("id")
      .single();
    if (rowError) throw new Error(rowError.message);

    if (knownTransaction) {
      await supabase.from("statement_row_transaction_links").insert({
        statement_row_id: statementRow.id,
        canonical_transaction_id: knownTransaction.id,
        confidence: 100,
        reason: { matched_by: "normalized_fingerprint" },
      });
    }

    const searchable = normalise([row.narration, row.reference, row.counterparty].filter(Boolean).join(" "));
    const matches = (projects ?? []).map((project: any) => {
      const terms = [project.project_code, project.name, ...(project.aliases ?? [])]
        .map(normalise)
        .filter((term) => term.length >= 3);
      const hits = terms.filter((term) => searchable.includes(term));
      const codeHit = normalise(project.project_code) && searchable.includes(normalise(project.project_code));
      const confidence = codeHit ? 98 : hits.length ? Math.min(92, 68 + hits.length * 8) : 0;
      return { project, confidence, hits };
    }).filter((match) => match.confidence > 0).sort((a, b) => b.confidence - a.confidence);

    for (const match of matches.slice(0, 3)) {
      await supabase.from("statement_project_matches").insert({
        statement_row_id: statementRow.id,
        project_id: match.project.id,
        confidence: match.confidence,
        reasons: [{ type: "project_identity", matched_terms: match.hits }],
      });
    }
  }

  await supabase.from("statement_imports").update({
    rows_new: newCount,
    rows_already_known: knownCount,
    rows_need_review: reviewCount,
    updated_at: new Date().toISOString(),
  }).eq("id", statementImport.id);

  revalidatePath("/statements");
  redirect(`/statements/${statementImport.id}`);
}
