"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "../../lib/supabase/client";
import { validateUploadBatch } from "../../lib/accounting/guards";

type ProjectOption = { id: string; project_code: string; name: string };
type Result = { name: string; state: "queued"|"processing"|"done"|"review"|"failed"|"duplicate"; type?: string; project?: string; message: string; href?: string };
type DocumentHint = "auto"|"bank_statement"|"invoice"|"bill"|"quotation"|"receipt"|"boq"|"other";
type IntakeAction = "analyse"|"analyse_keywords"|"store_only";

const MAX_FILE_BYTES = 20 * 1024 * 1024;
const allowedMimeByExt: Record<string, string[]> = {
  pdf: ["application/pdf"],
  csv: ["text/csv", "application/csv", "text/plain", "application/vnd.ms-excel"],
  xlsx: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "application/octet-stream"],
  xls: ["application/vnd.ms-excel", "application/octet-stream"],
  docx: ["application/vnd.openxmlformats-officedocument.wordprocessingml.document", "application/octet-stream"],
  jpg: ["image/jpeg"], jpeg: ["image/jpeg"], png: ["image/png"], webp: ["image/webp"],
};

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
function mimeCompatible(file: File, ext: string) { if (!file.type) return true; return Boolean(allowedMimeByExt[ext]?.includes(file.type)); }
function keywordList(value: string) { return Array.from(new Set(value.split(/[\n,;]+/).map((v) => v.trim()).filter((v) => v.length >= 2))).slice(0, 30); }

async function functionErrorMessage(error: unknown) {
  const fallback = error instanceof Error ? error.message : "The document analysis service could not complete this file.";
  try {
    const context = (error as { context?: Response } | null)?.context;
    if (context && typeof context.clone === "function") {
      if (context.status === 401) return "Your secure session needs to be refreshed. Sign in again, then retry this file.";
      if (context.status === 404) return "The document analysis service is not available on this deployment yet.";
      if (context.status >= 500) return context.status === 546
        ? "This workbook exceeded the analyser's compute limit. The upload is safe; use the stored-file retry instead of uploading another copy."
        : "Charismak could not finish analysing this file. The upload is safe; retry the stored copy after the service recovers.";
      const payload = await context.clone().json().catch(() => null) as { error?: string; message?: string } | null;
      if (payload?.error) return payload.error;
      if (payload?.message) return payload.message;
    }
  } catch {}
  return fallback === "Edge Function returned a non-2xx status code" ? "Charismak could not finish analysing this file. The upload is safe; retry the stored copy." : fallback;
}

const safe = (name: string) => name.replace(/[^a-zA-Z0-9._-]/g, "_");
const label = (v: string) => v.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());

export default function UniversalAddClient({ companyId, projects, defaultProjectId = "" }: { companyId: string; projects: ProjectOption[]; defaultProjectId?: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [files, setFiles] = useState<File[]>([]);
  const [projectHint, setProjectHint] = useState(defaultProjectId);
  const [documentHint, setDocumentHint] = useState<DocumentHint>("auto");
  const [intakeAction, setIntakeAction] = useState<IntakeAction>("analyse");
  const [keywordText, setKeywordText] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [busy, setBusy] = useState(false);
  const [summary, setSummary] = useState("");

  function update(index: number, patch: Partial<Result>) { setResults((prev) => prev.map((r, i) => i === index ? { ...r, ...patch } : r)); }

  async function discoverForStatement(analysed: any) {
    const ids: string[] = Array.isArray(analysed?.statementImportIds) && analysed.statementImportIds.length
      ? analysed.statementImportIds.map(String)
      : analysed?.statementImportId ? [String(analysed.statementImportId)] : [];
    const accounts: string[] = Array.isArray(analysed?.statementAccounts) ? analysed.statementAccounts.map(String) : [];
    const keywords = keywordList(keywordText);
    let candidateCount = 0;
    let bestImportId: string | null = null;

    for (let i = 0; i < ids.length; i++) {
      const importId = ids[i];
      const accountName = accounts[i] || "";
      if (/saving|owealth/i.test(accountName)) continue;
      const { data, error } = keywords.length
        ? await supabase.rpc("discover_statement_projects_with_keywords", { target_import: importId, target_keywords: keywords })
        : await supabase.rpc("discover_statement_projects", { target_import: importId });
      if (error) continue;
      const count = Number((data as any)?.candidate_count ?? 0);
      candidateCount += count;
      if (!bestImportId && count > 0) bestImportId = importId;
    }
    return { candidateCount, bestImportId, keywords };
  }

  async function processFiles() {
    if (!files.length || busy) return;
    const keywords = keywordList(keywordText);
    if (intakeAction === "analyse_keywords" && !keywords.length) {
      setSummary("Add at least one keyword or project/site name for the statement search.");
      return;
    }
    try { validateUploadBatch(files.length, files.reduce((sum, file) => sum + file.size, 0)); }
    catch (error) { setSummary(error instanceof Error ? error.message : "The selected upload batch is not valid."); return; }

    setBusy(true); setSummary("");
    setResults(files.map((f) => ({ name: f.name, state: "queued", message: "Waiting…" })));
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) throw new Error("Your session expired. Sign in again.");
      const { data: batch, error: batchError } = await supabase.from("intake_batches").insert({ company_id: companyId, created_by: auth.user.id, total_files: files.length }).select("id").single();
      if (batchError || !batch) throw new Error(batchError?.message || "Could not create intake batch.");
      let done = 0, review = 0, failed = 0, duplicates = 0;

      async function applyAnalysed(index: number, documentId: string, analysed: any) {
        const type = String(analysed?.type || documentHint || "document").replaceAll("_", " ");
        const projectName = analysed?.projectName ? String(analysed.projectName) : undefined;
        if (analysed?.statementImportId && analysed?.status === "applied") {
          const discovered = await discoverForStatement(analysed);
          done++;
          const signalText = discovered.candidateCount > 0 ? ` ${discovered.candidateCount} project/site signal${discovered.candidateCount === 1 ? "" : "s"} found.` : "";
          update(index, { state: "done", type: "bank statement", message: `${analysed?.message || "Statement understood and processed."}${signalText}`, href: discovered.bestImportId ? `/statements/${discovered.bestImportId}/projects` : `/statements/${analysed.statementImportId}` });
          return;
        }
        if (analysed?.projectId && analysed?.status === "ready") {
          update(index, { message: "Project understood. Applying the safe interpretation…" });
          const { data: applied, error: applyError } = await supabase.functions.invoke("auto-apply-project-document", { body: { documentId, projectId: analysed.projectId } });
          if (!applyError && applied?.applied) {
            done++;
            const meaning = String(applied?.commercialRole && applied.commercialRole !== "none" ? applied.commercialRole : applied?.effect || "project evidence").replaceAll("_", " ");
            update(index, { state: "done", type, project: projectName, message: `Understood and added automatically as ${meaning}.`, href: `/projects/${analysed.projectId}` });
            return;
          }
          review++; update(index, { state: "review", type, project: projectName, message: applied?.reason === "existing_base_scope" ? "I found an existing base contract. Confirm how this new commercial document relates to it." : "I know the project, but need one confirmation before changing the official record.", href: `/projects/${analysed.projectId}/documents` }); return;
        }
        const needsReview = analysed?.status === "needs_review";
        if (needsReview) review++; else done++;
        update(index, { state: needsReview ? "review" : "done", type, project: projectName, message: analysed?.message || (needsReview ? "I need one confirmation." : "Understood and organised."), href: analysed?.statementImportId ? `/statements/${analysed.statementImportId}` : analysed?.projectId ? `/projects/${analysed.projectId}/documents` : undefined });
      }

      for (let i = 0; i < files.length; i++) {
        const file = files[i]; update(i, { state: "processing", message: "Reading file…" });
        if (file.size > MAX_FILE_BYTES) { failed++; update(i, { state: "failed", message: "File is over the 20 MB limit." }); continue; }
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (!["pdf","csv","xlsx","xls","docx","jpg","jpeg","png","webp"].includes(ext)) { failed++; update(i, { state: "failed", message: "Unsupported file type." }); continue; }
        if (!mimeCompatible(file, ext)) { failed++; update(i, { state: "failed", message: "The file contents/type do not match the selected file extension." }); continue; }
        const hash = await sha256(file);
        const { data: duplicate } = await supabase.from("source_documents").select("id,project_id,document_type,file_name").eq("company_id", companyId).eq("file_hash", hash).limit(1).maybeSingle();
        if (duplicate) {
          const { data: previous } = await supabase.from("intake_items").select("id,batch_id,status,message").eq("document_id", duplicate.id).limit(1).maybeSingle();
          if (previous?.batch_id && ["processing","failed","needs_review"].includes(String(previous.status)) && String(duplicate.document_type) === "other") {
            update(i, { state: "processing", message: "Found the earlier upload. Retrying its stored copy instead of uploading it twice…" });
            const { data: analysed, error: retryError } = await supabase.functions.invoke("analyse-intake-document-v3", { body: { documentId: duplicate.id, batchId: previous.batch_id, documentTypeHint: documentHint, action: intakeAction, keywords } });
            if (retryError) { review++; update(i, { state: "review", message: await functionErrorMessage(retryError) }); continue; }
            await applyAnalysed(i, duplicate.id, analysed); continue;
          }
          duplicates++; update(i, { state: "duplicate", type: String(duplicate.document_type), message: "Already uploaded before. Nothing was counted twice.", href: duplicate.project_id ? `/projects/${duplicate.project_id}/documents` : "/statements" }); continue;
        }

        const path = `${companyId}/intake/${new Date().getUTCFullYear()}/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${safe(file.name)}`;
        update(i, { message: "Uploading securely…" });
        const { error: storageError } = await supabase.storage.from("universal-intake").upload(path, file, { contentType: file.type || undefined, upsert: false });
        if (storageError) { failed++; update(i, { state: "failed", message: storageError.message }); continue; }
        const selectedType = documentHint === "auto" ? "other" : documentHint;
        const { data: doc, error: docError } = await supabase.from("source_documents").insert({ company_id: companyId, project_id: projectHint || null, document_type: selectedType, file_name: file.name, storage_path: path, file_hash: hash, metadata: { bucket: "universal-intake", extension: ext, mime_type: file.type || null, original_size: file.size, intake_project_hint: projectHint || null, intake_document_type_hint: documentHint, intake_action: intakeAction, intake_keywords: keywords }, uploaded_by: auth.user.id }).select("id").single();
        if (docError || !doc) { await supabase.storage.from("universal-intake").remove([path]); failed++; update(i, { state: "failed", message: docError?.message || "Could not register file." }); continue; }
        const { data: item, error: itemError } = await supabase.from("intake_items").insert({ batch_id: batch.id, company_id: companyId, document_id: doc.id, detected_project_id: projectHint || null }).select("id").single();
        if (itemError || !item) { await supabase.from("source_documents").delete().eq("id", doc.id); await supabase.storage.from("universal-intake").remove([path]); failed++; update(i, { state: "failed", message: itemError?.message || "Could not create intake item." }); continue; }

        if (intakeAction === "store_only") {
          await supabase.from("intake_items").update({ detected_type: selectedType, detected_project_id: projectHint || null, confidence: 100, status: "applied", suggested_action: { action: "stored_only" }, message: `Stored as ${label(selectedType)} evidence without changing accounting.` }).eq("id", item.id);
          done++; update(i, { state: "done", type: label(selectedType), message: "Stored safely as evidence. No accounting values were changed.", href: projectHint ? `/projects/${projectHint}/documents` : undefined }); continue;
        }

        update(i, { message: intakeAction === "analyse_keywords" ? "Analysing the statement and searching your keywords…" : "Understanding the document…" });
        const { data: analysed, error: analyseError } = await supabase.functions.invoke("analyse-intake-document-v3", { body: { documentId: doc.id, batchId: batch.id, documentTypeHint: documentHint, action: intakeAction, keywords } });
        if (analyseError) {
          const message = await functionErrorMessage(analyseError); await supabase.from("intake_items").update({ status: "needs_review", message }).eq("id", item.id); review++; update(i, { state: "review", message }); continue;
        }
        await applyAnalysed(i, doc.id, analysed);
      }
      const processed = done + review + duplicates;
      await supabase.from("intake_batches").update({ processed_files: processed, needs_review_count: review, status: failed === files.length ? "failed" : review ? "needs_review" : "completed", summary: { processed: done, needs_review: review, duplicates, failed } }).eq("id", batch.id);
      setSummary(`${done} organised automatically · ${review} need your decision · ${duplicates} already known · ${failed} failed`);
    } catch (e) { setSummary(e instanceof Error ? e.message : "The batch could not be processed."); }
    finally { setBusy(false); }
  }

  const showKeywords = documentHint === "bank_statement" || intakeAction === "analyse_keywords";
  return <div className="universal-add">
    <section className="add-hero">
      <span>START WITH WHAT YOU ALREADY HAVE</span>
      <h1>Upload it. Tell Charismak what you want done.</h1>
      <p>You do not need to rebuild your records from scratch. Bring statements, invoices, BOQs, quotations, receipts or project files; choose the purpose, and Charismak will organise only what you asked it to.</p>
    </section>

    <section className="add-card">
      <label className="add-drop"><input type="file" multiple accept=".pdf,.csv,.xlsx,.xls,.docx,.jpg,.jpeg,.png,.webp" onChange={(e) => setFiles(Array.from(e.target.files || []))} /><strong>{files.length ? `${files.length} file${files.length === 1 ? "" : "s"} selected` : "Choose files"}</strong><span>Up to 20 files · 20 MB each · 100 MB combined</span></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))",gap:10,marginTop:12}}>
        <label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,color:"#536879"}}><span>What is this file?</span><select value={documentHint} onChange={(e)=>setDocumentHint(e.target.value as DocumentHint)} style={{height:42,border:"1px solid #ccd9e2",borderRadius:10,padding:"0 10px",background:"white"}}><option value="auto">Let Charismak detect it</option><option value="bank_statement">Bank / fintech statement</option><option value="invoice">Invoice</option><option value="bill">Bill</option><option value="quotation">Quotation</option><option value="boq">BOQ</option><option value="receipt">Receipt</option><option value="other">Other project / company document</option></select></label>
        <label style={{display:"grid",gap:5,fontSize:10,fontWeight:800,color:"#536879"}}><span>What should Charismak do?</span><select value={intakeAction} onChange={(e)=>setIntakeAction(e.target.value as IntakeAction)} style={{height:42,border:"1px solid #ccd9e2",borderRadius:10,padding:"0 10px",background:"white"}}><option value="analyse">Analyse and organise it</option><option value="analyse_keywords">Analyse statement + find my keywords</option><option value="store_only">Keep as evidence only</option></select></label>
      </div>
      {showKeywords&&intakeAction!=="store_only"&&<label style={{display:"grid",gap:5,marginTop:10,fontSize:10,fontWeight:800,color:"#536879"}}><span>Keywords / project or site names to look for <small style={{fontWeight:600}}>(comma or new line separated)</small></span><textarea value={keywordText} onChange={(e)=>setKeywordText(e.target.value)} placeholder="e.g. Jahi, COCO, PCC, KMSTEEL, Transcorp" rows={3} style={{border:"1px solid #ccd9e2",borderRadius:10,padding:10,resize:"vertical",font:"inherit"}}/><small style={{fontWeight:600,color:"#7b8b98"}}>Every matching keyword is shown with transaction count, money in/out and sample narrations, then you can create a new project or link it to an existing one.</small></label>}
      <div className="add-hint-row">
        <label><span>Already know the project? <small>Optional</small></span><select value={projectHint} onChange={(e) => setProjectHint(e.target.value)}><option value="">Let Charismak detect it</option>{projects.map((p) => <option key={p.id} value={p.id}>{p.project_code} · {p.name}</option>)}</select></label>
        <button className="add-primary" disabled={!files.length || busy} onClick={processFiles}>{busy ? "Working on your records…" : intakeAction === "store_only" ? "Save evidence" : "Add & analyse"}</button>
      </div>
    </section>

    {!!results.length && <section className="intake-results"><div className="intake-summary"><h2>What Charismak did</h2><p>{summary || "Processing your files…"}</p></div>{results.map((r, i) => <article key={`${r.name}-${i}`} className={`intake-result ${r.state}`}><div className="intake-icon">{r.state === "done" ? "✓" : r.state === "review" ? "?" : r.state === "duplicate" ? "↺" : r.state === "failed" ? "!" : "…"}</div><div className="intake-copy"><strong>{r.name}</strong><div className="intake-tags">{r.type && <span>{r.type}</span>}{r.project && <span>{r.project}</span>}</div><p>{r.message}</p></div>{r.href && <Link href={r.href} className="intake-open">Open →</Link>}</article>)}</section>}
  </div>;
}
