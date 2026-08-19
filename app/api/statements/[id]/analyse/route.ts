import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { createClient } from "../../../../../lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

type PdfTextItem = { str?: string; transform?: number[] };

type ParsedRow = {
  transactionDate: string;
  valueDate: string | null;
  narration: string;
  reference: string | null;
  signedAmount: number;
  runningBalance: number | null;
  rawLine: string;
};

const MONTHS: Record<string, string> = {
  jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
  jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
};

function normalise(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 ._\-/]/g, "");
}

function parseOpayDate(value: string) {
  const match = value.trim().match(/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/);
  if (!match) return null;
  const month = MONTHS[match[2].toLowerCase()];
  if (!month) return null;
  return `${match[3]}-${month}-${match[1].padStart(2, "0")}`;
}

function parseAmount(value: string) {
  const cleaned = value.replace(/₦/g, "").replace(/,/g, "").replace(/\s/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
}

function linesFromTextContent(items: PdfTextItem[]) {
  const rows = new Map<number, { x: number; text: string }[]>();
  for (const item of items) {
    const text = String(item.str ?? "").trim();
    if (!text) continue;
    const transform = item.transform ?? [];
    const x = Number(transform[4] ?? 0);
    const y = Math.round(Number(transform[5] ?? 0) * 2) / 2;
    const list = rows.get(y) ?? [];
    list.push({ x, text });
    rows.set(y, list);
  }
  return [...rows.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([, parts]) => parts.sort((a, b) => a.x - b.x).map((part) => part.text).join(" ").replace(/\s+/g, " ").trim());
}

function parseOpayLines(lines: string[]): ParsedRow[] {
  const datePattern = /(\d{1,2}\s+(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4})/gi;
  const signedAmountPattern = /([+-]\s*₦?\s*[\d,]+\.\d{2})/;
  const balancePattern = /₦?\s*([\d,]+\.\d{2})/;
  const referencePattern = /(\d{14,})\s*$/;
  const parsed: ParsedRow[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    let combined = lines[i];
    let dates = [...combined.matchAll(datePattern)];

    // Some OPay PDFs wrap description/reference onto a following visual line.
    if (dates.length >= 1 && !signedAmountPattern.test(combined) && i + 1 < lines.length) {
      combined = `${combined} ${lines[i + 1]}`.replace(/\s+/g, " ");
      dates = [...combined.matchAll(datePattern)];
    }

    if (dates.length < 2) continue;
    const firstDateText = dates[0][1];
    const secondDateText = dates[1][1];
    const transactionDate = parseOpayDate(firstDateText);
    const valueDate = parseOpayDate(secondDateText);
    if (!transactionDate) continue;

    const secondDateEnd = (dates[1].index ?? 0) + dates[1][0].length;
    const tail = combined.slice(secondDateEnd).trim();
    const amountMatch = tail.match(signedAmountPattern);
    if (!amountMatch || amountMatch.index === undefined) continue;

    const signedAmount = parseAmount(amountMatch[1]);
    if (signedAmount === null) continue;

    const narration = tail.slice(0, amountMatch.index).trim().replace(/^[-–—|]+|[-–—|]+$/g, "").trim() || "OPay transaction";
    const afterAmount = tail.slice(amountMatch.index + amountMatch[0].length).trim();
    const balanceMatch = afterAmount.match(balancePattern);
    const runningBalance = balanceMatch ? parseAmount(balanceMatch[1]) : null;
    const referenceMatch = combined.match(referencePattern);

    parsed.push({
      transactionDate,
      valueDate,
      narration,
      reference: referenceMatch?.[1] ?? null,
      signedAmount,
      runningBalance,
      rawLine: combined,
    });
  }

  // Remove repeated page-header/table rows or accidental duplicate extraction.
  const unique = new Map<string, ParsedRow>();
  for (const row of parsed) {
    const key = [row.transactionDate, row.reference ?? "", row.signedAmount, normalise(row.narration)].join("|");
    if (!unique.has(key)) unique.set(key, row);
  }
  return [...unique.values()];
}

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) return NextResponse.json({ error: "Sign in again before analysing this statement." }, { status: 401 });

  const { data: statement, error: statementError } = await supabase
    .from("statement_imports")
    .select("id, company_id, document_id, financial_account_id, document:source_documents(id, file_name, storage_path, metadata)")
    .eq("id", id)
    .single();
  if (statementError || !statement) return NextResponse.json({ error: statementError?.message || "Statement import not found." }, { status: 404 });

  const { data: membership } = await supabase
    .from("company_memberships")
    .select("id")
    .eq("company_id", statement.company_id)
    .eq("user_id", authData.user.id)
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!membership) return NextResponse.json({ error: "You do not have access to this company statement." }, { status: 403 });

  const document = Array.isArray((statement as any).document) ? (statement as any).document[0] : (statement as any).document;
  if (!document?.storage_path) return NextResponse.json({ error: "The original statement file is missing from storage." }, { status: 422 });
  const extension = String(document.file_name ?? "").split(".").pop()?.toLowerCase();
  if (extension !== "pdf") return NextResponse.json({ error: "This analyser currently supports the uploaded OPay PDF format. CSV analysis remains handled separately." }, { status: 422 });

  await supabase.from("statement_imports").update({ status: "parsing", updated_at: new Date().toISOString() }).eq("id", id);

  try {
    const { data: blob, error: downloadError } = await supabase.storage.from("financial-documents").download(document.storage_path);
    if (downloadError || !blob) throw new Error(downloadError?.message || "Could not download the stored PDF.");

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const { getDocument } = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const loadingTask = getDocument({ data: bytes });
    const pdf = await loadingTask.promise;
    const allLines: string[] = [];

    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      allLines.push(...linesFromTextContent(textContent.items as PdfTextItem[]));
      page.cleanup();
    }
    await pdf.destroy();

    const extractedRows = parseOpayLines(allLines);
    if (extractedRows.length === 0) {
      await supabase.from("statement_imports").update({ status: "needs_review", rows_total: 0, rows_need_review: 0, updated_at: new Date().toISOString() }).eq("id", id);
      return NextResponse.json({ error: "The PDF text was extracted, but no OPay transaction rows matched the expected table structure yet.", extractedLineCount: allLines.length }, { status: 422 });
    }

    const { data: currentRows } = await supabase.from("statement_rows").select("id").eq("import_id", id).limit(1);
    if ((currentRows ?? []).length > 0) {
      return NextResponse.json({ ok: true, alreadyAnalysed: true, rows: extractedRows.length });
    }

    const { data: projects } = await supabase
      .from("projects")
      .select("id, project_code, name, aliases")
      .eq("company_id", statement.company_id)
      .in("status", ["draft", "active", "on_hold"]);

    let newCount = 0;
    let knownCount = 0;
    let reviewCount = 0;
    const dates: string[] = [];

    for (let index = 0; index < extractedRows.length; index += 1) {
      const row = extractedRows[index];
      dates.push(row.transactionDate);
      const fingerprintSource = [row.transactionDate, normalise(row.reference), row.signedAmount, normalise(row.narration)].join("|");
      const fingerprint = createHash("sha256").update(fingerprintSource).digest("hex");

      const { data: knownTransaction } = await supabase
        .from("canonical_transactions")
        .select("id")
        .eq("company_id", statement.company_id)
        .eq("normalized_fingerprint", fingerprint)
        .limit(1)
        .maybeSingle();

      const detectionStatus = knownTransaction ? "already_known" : "new";
      if (knownTransaction) knownCount += 1; else newCount += 1;

      const { data: insertedRow, error: rowError } = await supabase
        .from("statement_rows")
        .insert({
          import_id: id,
          row_index: index + 1,
          transaction_date: row.transactionDate,
          value_date: row.valueDate,
          narration: row.narration,
          reference: row.reference,
          debit: row.signedAmount < 0 ? Math.abs(row.signedAmount) : null,
          credit: row.signedAmount > 0 ? row.signedAmount : null,
          signed_amount: row.signedAmount,
          running_balance: row.runningBalance,
          normalized_fingerprint: fingerprint,
          comparison_key: `${row.transactionDate}|${row.signedAmount}|${normalise(row.reference)}`,
          detection_status: detectionStatus,
          raw_payload: { parser: "opay_pdf_v1", raw_line: row.rawLine },
        })
        .select("id")
        .single();
      if (rowError) throw new Error(rowError.message);

      if (knownTransaction) {
        await supabase.from("statement_row_transaction_links").insert({
          statement_row_id: insertedRow.id,
          canonical_transaction_id: knownTransaction.id,
          confidence: 100,
          reason: { matched_by: "normalized_fingerprint", parser: "opay_pdf_v1" },
          is_primary: true,
        });
      }

      const searchable = normalise(`${row.narration} ${row.reference ?? ""}`);
      for (const project of projects ?? []) {
        const terms = [project.project_code, project.name, ...(project.aliases ?? [])].map(normalise).filter((term) => term.length >= 3);
        const hits = terms.filter((term) => searchable.includes(term));
        if (!hits.length) continue;
        const codeHit = searchable.includes(normalise(project.project_code));
        await supabase.from("statement_project_matches").insert({
          statement_row_id: insertedRow.id,
          project_id: project.id,
          confidence: codeHit ? 98 : Math.min(92, 68 + hits.length * 8),
          reasons: [{ type: "project_identity", matched_terms: hits, parser: "opay_pdf_v1" }],
        });
      }
    }

    dates.sort();
    await supabase.from("statement_imports").update({
      period_start: dates[0] ?? null,
      period_end: dates[dates.length - 1] ?? null,
      status: "needs_review",
      rows_total: extractedRows.length,
      rows_new: newCount,
      rows_already_known: knownCount,
      rows_need_review: reviewCount,
      updated_at: new Date().toISOString(),
    }).eq("id", id);

    await supabase.from("source_documents").update({
      metadata: { ...(document.metadata ?? {}), parser: "opay_pdf_v1", extracted_line_count: allLines.length, extracted_transaction_count: extractedRows.length },
    }).eq("id", document.id);

    return NextResponse.json({ ok: true, rows: extractedRows.length, newRows: newCount, alreadyKnown: knownCount, periodStart: dates[0], periodEnd: dates[dates.length - 1] });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Statement analysis failed.";
    await supabase.from("statement_imports").update({ status: "failed", updated_at: new Date().toISOString() }).eq("id", id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
