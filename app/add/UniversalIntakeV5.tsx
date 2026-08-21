"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";
import { validateUploadBatch } from "../../lib/accounting/guards";
import { readVisualDocument, needsOcrFallback } from "./client-ocr";
import { optionalFileHash, readFileArrayBuffer } from "./file-read";

type Project = { id: string; project_code: string; name: string };
type Hint = "auto" | "bank_statement" | "invoice" | "bill" | "quotation" | "receipt" | "boq" | "other";
type Action = "analyse" | "analyse_keywords" | "store_only";
type State = "queued" | "working" | "done" | "review" | "duplicate" | "failed" | "removed";
type Result = { name: string; state: State; message: string; href?: string; type?: string; documentId?: string; statementImportId?: string; intakeItemId?: string };

const MAX = 20 * 1024 * 1024;
const supported = new Set(["pdf", "csv", "xlsx", "xls", "docx", "jpg", "jpeg", "png", "webp"]);
const safe = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
const label = (s: string) => s.replaceAll("_", " ").replace(/\b\w/g, c => c.toUpperCase());
const wordsFrom = (s: string) => Array.from(new Set(s.split(/[\n,;]+/).map(v => v.trim()).filter(v => v.length >= 2))).slice(0, 40);

async function readableFunctionError(error: any) {
  try {
    const response = error?.context as Response | undefined;
    if (response) {
      if (response.status === 401) return "Your session expired. Sign in again and retry.";
      const payload = await response.clone().json().catch(() => null);
      if (payload?.error) return payload.error;
      if (payload?.message) return payload.message;
    }
  } catch {}
  return error?.message || "This file could not be analysed.";
}

export default function UniversalIntakeV5({ companyId, projects, onboarding = false, defaultProjectId = "" }: { companyId: string; projects: Project[]; onboarding?: boolean; defaultProjectId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [hint, setHint] = useState<Hint>("auto");
  const [action, setAction] = useState<Action>("analyse");
  const [keywordText, setKeywordText] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [summary, setSummary] = useState("");
  const [busy, setBusy] = useState(false);

  const update = (i: number, p: Partial<Result>) => setResults(prev => prev.map((r, x) => x === i ? { ...r, ...p } : r));

  async function storeOriginal(path: string, file: File) {
    let stored = await supabase.storage.from("universal-intake").upload(path, file, { contentType: file.type || undefined, upsert: false });
    if (!stored.error) return;
    const firstMessage = stored.error.message || "The file could not be uploaded.";
    if (/permission|unauthor|row.level|bucket|too large|payload|limit/i.test(firstMessage)) throw new Error(`Upload failed: ${firstMessage}`);
    try {
      const bytes = await readFileArrayBuffer(file);
      const blob = new Blob([bytes], { type: file.type || "application/octet-stream" });
      await supabase.storage.from("universal-intake").remove([path]).catch(() => undefined);
      stored = await supabase.storage.from("universal-intake").upload(path, blob, { contentType: file.type || "application/octet-stream", upsert: true });
      if (!stored.error) return;
    } catch {}
    throw new Error(`Upload failed: ${stored.error?.message || firstMessage}`);
  }

  async function signals(importIds: string[], terms: string[]) {
    let candidates = 0, autoPosted = 0, pending = 0;
    for (const importId of importIds) {
      const discovery = terms.length
        ? await supabase.rpc("discover_statement_projects_with_keywords", { target_import: importId, target_keywords: terms })
        : await supabase.rpc("discover_statement_projects", { target_import: importId });
      if (!discovery.error) candidates += Number((discovery.data as any)?.candidate_count ?? 0);
      const post = await supabase.rpc("auto_post_statement_matches", { target_import: importId, minimum_confidence: 94 });
      if (!post.error) {
        autoPosted += Number((post.data as any)?.autoPosted ?? 0) + Number((post.data as any)?.companyAutoPosted ?? 0);
        pending += Number((post.data as any)?.pendingReview ?? 0);
      }
    }
    return { candidates, autoPosted, pending };
  }

  async function applyResult(i: number, documentId: string, intakeItemId: string, analysed: any, terms: string[]) {
    const ids: string[] = Array.isArray(analysed?.statementImportIds) && analysed.statementImportIds.length
      ? analysed.statementImportIds.map(String)
      : analysed?.statementImportId ? [String(analysed.statementImportId)] : [];
    if (ids.length) {
      const s = await signals(ids, terms);
      const base = analysed?.message || "Financial statement understood.";
      update(i, {
        state: analysed?.status === "needs_review" ? "review" : "done",
        type: "Financial statement",
        message: `${base} ${s.autoPosted} high-confidence row${s.autoPosted === 1 ? "" : "s"} posted; ${s.pending} still need review.${s.candidates ? ` ${s.candidates} possible new project/site signal${s.candidates === 1 ? "" : "s"} found.` : ""}`,
        documentId, intakeItemId, statementImportId: ids[0], href: `/statements/${ids[0]}`
      });
      return;
    }
    if (analysed?.projectId && analysed?.status === "ready") {
      const applied = await supabase.functions.invoke("auto-apply-project-document", { body: { documentId, projectId: analysed.projectId } });
      if (!applied.error && applied.data?.applied) {
        update(i, { state: "done", type: label(analysed?.type || hint), message: "I understood this record and safely updated the matched project.", documentId, intakeItemId, href: `/projects/${analysed.projectId}/documents` });
        return;
      }
    }
    const review = analysed?.status === "needs_review";
    update(i, {
      state: review ? "review" : "done",
      type: label(String(analysed?.type || hint || "document")),
      message: analysed?.message || (review ? "I read this record, but one decision is needed before it changes accounting." : "Record understood and organised."),
      documentId, intakeItemId,
      href: review ? `/review/${intakeItemId}` : (analysed?.projectId ? `/projects/${analysed.projectId}/documents` : "/documents")
    });
  }

  async function ocrAnalyse(i: number, file: File, documentId: string, batchId: string, intakeItemId: string, terms: string[]) {
    update(i, { state: "working", message: "This is a photo/scan. Reading the text on your device…" });
    const ocr = await readVisualDocument(file, m => update(i, { message: m }));
    if (!ocr.text.trim()) throw new Error("I could not read enough text from this scan. Try a clearer photo or higher-resolution scan.");
    update(i, { message: `Scan read (${ocr.pages} page${ocr.pages === 1 ? "" : "s"}). Understanding the accounting information…` });
    const res = await supabase.functions.invoke("analyse-ocr-document", { body: { documentId, batchId, ocrText: ocr.text, ocrConfidence: ocr.confidence, documentTypeHint: hint, keywords: terms, projectId } });
    if (res.error || res.data?.error) throw new Error(res.data?.error || await readableFunctionError(res.error));
    return res.data;
  }

  async function removeResult(i: number) {
    const r = results[i];
    if (!r?.documentId || r.state === "removed") return;
    if (!window.confirm("Delete this uploaded record? The audit history will still show that it was deleted.")) return;
    try {
      let data: any = null;
      if (r.statementImportId) {
        const x = await supabase.rpc("delete_statement_import_with_audit", { target_import: r.statementImportId });
        if (x.error) throw x.error;
        data = x.data;
      } else {
        const x = await supabase.rpc("delete_source_document_with_audit", { target_document: r.documentId });
        if (x.error) throw x.error;
        data = x.data;
      }
      if (data?.storage_path && !data?.virtual_sheet) await supabase.storage.from(data.bucket || "universal-intake").remove([data.storage_path]);
      update(i, { state: "removed", message: "Deleted from active records; deletion remains in the audit trail.", href: undefined });
      router.refresh();
    } catch (e: any) {
      update(i, { message: e?.message || "Could not delete this record." });
    }
  }

  async function processFiles(files: File[]) {
    if (!files.length || busy) return;
    setSummary("");
    const terms = wordsFrom(keywordText);
    try {
      validateUploadBatch(files.length, files.reduce((n, f) => n + f.size, 0));
      for (const file of files) {
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (!supported.has(ext)) throw new Error(`${file.name}: use PDF, Excel, CSV, Word, JPG, PNG or WEBP.`);
        if (file.size > MAX) throw new Error(`${file.name}: file is over the 20 MB limit.`);
      }
    } catch (e: any) {
      setSummary(e?.message || "The selected files could not be accepted.");
      return;
    }

    setBusy(true);
    setResults(files.map(file => ({ name: file.name, state: "queued", message: "Waiting…" })));
    let done = 0, review = 0, duplicate = 0, failed = 0;
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Your session expired. Sign in again.");
      const { data: batch, error: be } = await supabase.from("intake_batches").insert({ company_id: companyId, created_by: user.id, total_files: files.length }).select("id").single();
      if (be || !batch) throw new Error(be?.message || "Could not start this upload.");

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        let documentId: string | undefined;
        let intakeItemId: string | undefined;
        let storagePath: string | undefined;
        try {
          const path = `${companyId}/intake/${new Date().getUTCFullYear()}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safe(file.name)}`;
          storagePath = path;
          update(i, { state: "working", message: "Uploading the original file securely…" });
          await storeOriginal(path, file);

          update(i, { message: "Checking whether this exact file is already known…" });
          const fileHash = await optionalFileHash(file);
          if (fileHash) {
            const { data: existing } = await supabase.from("source_documents").select("id,project_id,document_type").eq("company_id", companyId).eq("file_hash", fileHash).limit(1).maybeSingle();
            if (existing) {
              await supabase.storage.from("universal-intake").remove([path]);
              duplicate++;
              update(i, { state: "duplicate", message: "This exact file is already stored. Nothing was counted twice.", documentId: existing.id, href: existing.project_id ? `/projects/${existing.project_id}/documents` : existing.document_type === "bank_statement" ? "/statements" : "/documents" });
              continue;
            }
          }

          const selectedType = hint === "auto" ? "other" : hint;
          const doc = await supabase.from("source_documents").insert({
            company_id: companyId,
            project_id: projectId || null,
            document_type: selectedType,
            file_name: file.name,
            storage_path: path,
            file_hash: fileHash,
            metadata: { bucket: "universal-intake", extension: ext, mime_type: file.type || null, original_size: file.size, intake_project_hint: projectId || null, intake_document_type_hint: hint, intake_action: action, intake_keywords: terms, android_direct_upload: true },
            uploaded_by: user.id
          }).select("id").single();
          if (doc.error || !doc.data) {
            await supabase.storage.from("universal-intake").remove([path]);
            throw new Error(doc.error?.message || "Could not register the uploaded file.");
          }
          const currentDocumentId = String(doc.data.id);
          documentId = currentDocumentId;

          const item = await supabase.from("intake_items").insert({ batch_id: batch.id, company_id: companyId, document_id: currentDocumentId, detected_project_id: projectId || null }).select("id").single();
          if (item.error || !item.data) throw new Error(item.error?.message || "Could not prepare the file for analysis.");
          const currentIntakeItemId = String(item.data.id);
          intakeItemId = currentIntakeItemId;

          if (action === "store_only") {
            await supabase.from("intake_items").update({ detected_type: selectedType, confidence: 100, status: "applied", suggested_action: { action: "stored_only" }, message: "Stored as evidence without changing accounting." }).eq("id", currentIntakeItemId);
            done++;
            update(i, { state: "done", type: label(selectedType), message: "Stored safely. No accounting figures were changed.", documentId: currentDocumentId, intakeItemId: currentIntakeItemId, href: projectId ? `/projects/${projectId}/documents` : "/documents" });
            continue;
          }

          let analysed: any = null;
          const isImage = ["jpg", "jpeg", "png", "webp"].includes(ext);
          if (isImage) {
            analysed = await ocrAnalyse(i, file, currentDocumentId, batch.id, currentIntakeItemId, terms);
          } else {
            update(i, { message: "Reading and understanding the file…" });
            const normal = await supabase.functions.invoke("analyse-intake-document-v3", { body: { documentId: currentDocumentId, batchId: batch.id, documentTypeHint: hint, action, keywords: terms } });
            const normalMessage = normal.data?.error || normal.data?.message || (normal.error ? await readableFunctionError(normal.error) : "");
            if (ext === "pdf" && (normal.error || normal.data?.status === "needs_review") && needsOcrFallback(normalMessage)) {
              analysed = await ocrAnalyse(i, file, currentDocumentId, batch.id, currentIntakeItemId, terms);
            } else {
              if (normal.error || normal.data?.error) throw new Error(normal.data?.error || normalMessage);
              analysed = normal.data;
            }
          }

          await applyResult(i, currentDocumentId, currentIntakeItemId, analysed, terms);
          if (analysed?.status === "needs_review") review++; else done++;
        } catch (e: any) {
          const msg = e?.message || "This file could not be processed.";
          if (intakeItemId) {
            await supabase.from("intake_items").update({ status: "needs_review", message: `The original file is safe. ${msg}` }).eq("id", intakeItemId);
            review++;
            update(i, { state: "review", message: `The original file is safe. ${msg}`, documentId, intakeItemId, href: `/review/${intakeItemId}` });
          } else {
            failed++;
            if (storagePath) await supabase.storage.from("universal-intake").remove([storagePath]).catch(() => undefined);
            update(i, { state: "failed", message: msg, documentId });
          }
        }
      }

      await supabase.from("intake_batches").update({ processed_files: done + review + duplicate, needs_review_count: review, status: failed === files.length ? "failed" : review ? "needs_review" : "completed", summary: { processed: done, needs_review: review, duplicates: duplicate, failed } }).eq("id", batch.id);
      setSummary(`${done} organised automatically · ${review} need a decision · ${duplicate} already known · ${failed} failed.`);
      router.refresh();
    } catch (e: any) {
      setSummary(e?.message || "The upload could not start.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="universal-add">
    <section className="add-hero">
      <span>{onboarding ? "START WITH WHAT YOU ALREADY HAVE" : "SMART RECORD INTAKE"}</span>
      <h1>You choose it. Charismak uploads and understands it.</h1>
      <p>No accounting knowledge is required. Choose a statement, Excel sheet, PDF, BOQ, invoice, receipt, phone photo or scan. Upload starts immediately, then Charismak connects what it finds to your company and projects.</p>
    </section>

    <section className="add-card">
      <div style={{ padding: 12, borderRadius: 12, background: "#f2f8fb", fontSize: 11, lineHeight: 1.55, color: "#456276", marginBottom: 12 }}>
        <b style={{ color: "#153c57" }}>Recommended: leave everything on automatic.</b> You only need to choose the file. If Charismak is unsure, it sends the item to Needs decision instead of guessing.
      </div>

      <div className="add-hint-row" style={{ marginBottom: 12 }}>
        <label><span>Which project? <small>Optional</small></span><select value={projectId} disabled={busy} onChange={e => setProjectId(e.target.value)}><option value="">I don't know / let Charismak suggest</option>{projects.map(p => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
      </div>

      <details style={{ marginBottom: 12, border: "1px solid #e2e9ee", borderRadius: 10, padding: 10 }}>
        <summary style={{ cursor: "pointer", fontSize: 11, fontWeight: 800, color: "#31566e" }}>Advanced options (usually not needed)</summary>
        <div style={{ display: "grid", gap: 10, marginTop: 10 }}>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#536879" }}>Document type<select value={hint} disabled={busy} onChange={e => setHint(e.target.value as Hint)}><option value="auto">Detect automatically</option><option value="bank_statement">Bank statement</option><option value="invoice">Invoice</option><option value="bill">Bill</option><option value="quotation">Quotation</option><option value="boq">BOQ</option><option value="receipt">Receipt</option><option value="other">Other</option></select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#536879" }}>Action<select value={action} disabled={busy} onChange={e => setAction(e.target.value as Action)}><option value="analyse">Analyse and organise</option><option value="analyse_keywords">Analyse using my keywords</option><option value="store_only">Store only</option></select></label>
          <label style={{ display: "grid", gap: 5, fontSize: 10, fontWeight: 800, color: "#536879" }}>Project/site/client words you know<textarea rows={2} disabled={busy} value={keywordText} onChange={e => setKeywordText(e.target.value)} placeholder="Optional: COCO, Wandel, Jahi, Transcorp…" style={{ border: "1px solid #ccd9e2", borderRadius: 10, padding: 10, font: "inherit" }} /><small style={{ fontWeight: 500 }}>These help matching; they never silently create a project.</small></label>
        </div>
      </details>

      <label className="add-drop">
        <input type="file" multiple disabled={busy} accept=".pdf,.csv,.xlsx,.xls,.docx,.jpg,.jpeg,.png,.webp,image/*" onChange={e => { const input = e.currentTarget; const files = Array.from(input.files || []); input.value = ""; void processFiles(files); }} />
        <strong>{busy ? "Uploading and understanding your records…" : "Choose files or take a photo"}</strong>
        <span>{busy ? "Please keep this page open while the files are processed." : "Upload starts immediately · PDF · Excel · CSV · Word · JPG/PNG/WEBP · scans · 20 MB each"}</span>
      </label>

      {summary && <div className="info-strip" style={{ marginTop: 12 }}><b>What happened</b><span>{summary}</span></div>}
    </section>

    {!!results.length && <section className="intake-results">
      <div className="intake-summary"><h2>What Charismak did</h2><p>{summary || "Processing…"}</p></div>
      {results.map((r, i) => <article key={`${r.name}-${i}`} className={`intake-result ${r.state}`}>
        <div className="intake-icon">{r.state === "done" ? "✓" : r.state === "review" ? "?" : r.state === "duplicate" ? "↺" : r.state === "failed" ? "!" : r.state === "removed" ? "×" : "…"}</div>
        <div className="intake-copy"><strong>{r.name}</strong>{r.type && <div className="intake-tags"><span>{r.type}</span></div>}<p>{r.message}</p></div>
        <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>{r.href && r.state !== "removed" && <Link href={r.href} className="intake-open">{r.state === "review" ? "Review decision →" : "Open →"}</Link>}{r.documentId && !["working", "queued", "removed", "duplicate"].includes(r.state) && <button type="button" className="secondary-button" onClick={() => removeResult(i)}>Delete</button>}</div>
      </article>)}
    </section>}
  </div>;
}
