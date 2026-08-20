"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";

type ProjectOption = { id: string; project_code: string; name: string };
type Result = { name: string; state: "queued"|"processing"|"done"|"review"|"failed"|"duplicate"; type?: string; project?: string; message: string; href?: string };

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
const safe = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");

export default function UniversalAddClient({ companyId, projects }: { companyId: string; projects: ProjectOption[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [files, setFiles] = useState<File[]>([]);
  const [projectHint, setProjectHint] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");

  function update(index: number, patch: Partial<Result>) {
    setResults((prev) => prev.map((r, i) => i === index ? { ...r, ...patch } : r));
  }

  async function processFiles() {
    if (!files.length || busy) return;
    setBusy(true);
    setSummary("");
    setResults(files.map((f) => ({ name: f.name, state: "queued", message: "Waiting…" })));
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Your session expired. Sign in again.");
      const { data: batch, error: batchError } = await supabase.from("intake_batches").insert({ company_id: companyId, created_by: auth.user.id, total_files: files.length }).select("id").single();
      if (batchError || !batch) throw new Error(batchError?.message || "Could not create intake batch.");

      let done = 0, review = 0, failed = 0, duplicates = 0;
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        update(i, { state: "processing", message: "Reading file…" });
        if (file.size > 20 * 1024 * 1024) { failed++; update(i, { state: "failed", message: "File is over the 20 MB limit." }); continue; }
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (!["pdf","csv","xlsx","xls","docx","jpg","jpeg","png","webp"].includes(ext)) { failed++; update(i, { state: "failed", message: "Unsupported file type." }); continue; }
        const hash = await sha256(file);
        const { data: duplicate } = await supabase.from("source_documents").select("id,project_id,document_type,file_name").eq("company_id", companyId).eq("file_hash", hash).limit(1).maybeSingle();
        if (duplicate) { duplicates++; update(i, { state: "duplicate", type: String(duplicate.document_type), message: "Already uploaded before. Nothing was counted twice.", href: duplicate.project_id ? `/projects/${duplicate.project_id}/documents` : "/statements" }); continue; }

        const path = `${companyId}/intake/${new Date().getUTCFullYear()}/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${safe(file.name)}`;
        update(i, { message: "Uploading securely…" });
        const { error: storageError } = await supabase.storage.from("universal-intake").upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (storageError) { failed++; update(i, { state: "failed", message: storageError.message }); continue; }
        const { data: doc, error: docError } = await supabase.from("source_documents").insert({ company_id: companyId, project_id: projectHint || null, document_type: "other", file_name: file.name, storage_path: path, file_hash: hash, metadata: { bucket: "universal-intake", extension: ext, mime_type: file.type || null, original_size: file.size, intake_project_hint: projectHint || null }, uploaded_by: auth.user.id }).select("id").single();
        if (docError || !doc) { await supabase.storage.from("universal-intake").remove([path]); failed++; update(i, { state: "failed", message: docError?.message || "Could not register file." }); continue; }
        const { data: item, error: itemError } = await supabase.from("intake_items").insert({ batch_id: batch.id, company_id: companyId, document_id: doc.id, detected_project_id: projectHint || null }).select("id").single();
        if (itemError || !item) { failed++; update(i, { state: "failed", message: itemError?.message || "Could not create intake item." }); continue; }
        update(i, { message: "Understanding the document…" });
        const { data: analysed, error: analyseError } = await supabase.functions.invoke("analyse-intake-document", { body: { documentId: doc.id, batchId: batch.id } });
        if (analyseError) { review++; update(i, { state: "review", message: analyseError.message || "Uploaded, but needs review." }); continue; }
        const type = String(analysed?.type || "document").replaceAll("_", " ");
        const projectName = analysed?.projectName ? String(analysed.projectName) : undefined;
        const needsReview = analysed?.status === "needs_review";
        if (needsReview) review++; else done++;
        update(i, {
          state: needsReview ? "review" : "done",
          type,
          project: projectName,
          message: analysed?.message || (needsReview ? "I need one confirmation." : "Understood and processed."),
          href: analysed?.statementImportId ? `/statements/${analysed.statementImportId}` : analysed?.projectId ? `/projects/${analysed.projectId}/documents` : undefined,
        });
      }
      const processed = done + review + duplicates;
      await supabase.from("intake_batches").update({ processed_files: processed, needs_review_count: review, status: failed === files.length ? "failed" : review ? "needs_review" : "completed", summary: { processed: done, needs_review: review, duplicates, failed } }).eq("id", batch.id);
      setSummary(`${done} processed automatically · ${review} need your help · ${duplicates} already known · ${failed} failed`);
    } catch (e) {
      setSummary(e instanceof Error ? e.message : "The batch could not be processed.");
    } finally {
      setBusy(false);
    }
  }

  return <div className="universal-add">
    <section className="add-hero">
      <span>ADD TO CHARISMAK ACCOUNTING</span>
      <h1>Upload what you already use.</h1>
      <p>Statements, invoices, BOQs, quotations, receipts and project documents can be selected together. The app decides what each file is and where it belongs.</p>
    </section>

    <section className="add-card">
      <label className="add-drop">
        <input type="file" multiple accept=".pdf,.csv,.xlsx,.xls,.docx,.jpg,.jpeg,.png,.webp" onChange={(e) => setFiles(Array.from(e.target.files || []))} />
        <strong>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose files"}</strong>
        <span>Mix different document types in the same upload · up to 20 MB each</span>
      </label>
      <div className="add-hint-row">
        <label><span>Optional shortcut</span><select value={projectHint} onChange={(e) => setProjectHint(e.target.value)}><option value="">Let Charismak detect the project</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
        <button className="add-primary" disabled={!files.length || busy} onClick={processFiles}>{busy ? "Understanding files…" : "Add & organise"}</button>
      </div>
    </section>

    {!!results.length && <section className="intake-results">
      <div className="intake-summary"><h2>What I understood</h2><p>{summary || "Processing your files…"}</p></div>
      {results.map((r, i) => <article key={`${r.name}-${i}`} className={`intake-result ${r.state}`}>
        <div className="intake-icon">{r.state === "done" ? "✓" : r.state === "review" ? "?" : r.state === "duplicate" ? "↺" : r.state === "failed" ? "!" : "…"}</div>
        <div className="intake-copy"><strong>{r.name}</strong><div className="intake-tags">{r.type && <span>{r.type}</span>}{r.project && <span>{r.project}</span>}</div><p>{r.message}</p></div>
        {r.href && <Link href={r.href} className="intake-open">Open →</Link>}
      </article>)}
    </section>}
  </div>;
}
