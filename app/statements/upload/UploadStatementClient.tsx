"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type UploadState = "idle" | "checking" | "uploading" | "registering" | "done" | "error";

async function sha256(file: File) {
  const bytes = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_");
}

export default function UploadStatementClient() {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [institution, setInstitution] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<UploadState>("idle");
  const [status, setStatus] = useState("Ready to upload");
  const [error, setError] = useState("");

  const busy = state === "checking" || state === "uploading" || state === "registering";

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError("");

    if (!file) {
      setError("Choose a statement file first.");
      return;
    }
    if (!institution.trim() || !accountName.trim()) {
      setError("Bank / institution and account label are required.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("This file is larger than the 20 MB statement limit.");
      return;
    }

    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!["pdf", "csv", "xls", "xlsx"].includes(ext)) {
      setError("Use PDF, CSV, XLS or XLSX for bank statements.");
      return;
    }

    try {
      setState("checking");
      setStatus("Checking your session and company access…");

      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) {
        router.push("/login");
        return;
      }

      const { data: membership, error: membershipError } = await supabase
        .from("company_memberships")
        .select("id, company_id, is_owner")
        .eq("user_id", authData.user.id)
        .eq("status", "active")
        .limit(1)
        .maybeSingle();

      if (membershipError || !membership) {
        throw new Error(membershipError?.message || "No active company membership was found for this account.");
      }

      setStatus("Checking whether this exact file was uploaded before…");
      const fileHash = await sha256(file);

      const { data: duplicate, error: duplicateError } = await supabase
        .from("source_documents")
        .select("id")
        .eq("company_id", membership.company_id)
        .eq("document_type", "bank_statement")
        .eq("file_hash", fileHash)
        .maybeSingle();

      if (duplicateError) throw new Error(duplicateError.message);

      if (duplicate) {
        const { data: existingImport } = await supabase
          .from("statement_imports")
          .select("id")
          .eq("document_id", duplicate.id)
          .maybeSingle();

        if (existingImport?.id) {
          setState("done");
          setStatus("This exact statement is already in the app. Opening the existing import…");
          router.push(`/statements/${existingImport.id}?duplicate=1`);
          return;
        }
        throw new Error("This exact file is already stored, but its statement import needs repair.");
      }

      setStatus("Matching this statement to an existing bank account…");
      let accountQuery = supabase
        .from("financial_accounts")
        .select("id")
        .eq("company_id", membership.company_id)
        .eq("account_type", "bank")
        .ilike("account_name", accountName.trim());

      if (institution.trim()) accountQuery = accountQuery.ilike("institution_name", institution.trim());
      if (accountNumber.trim()) accountQuery = accountQuery.eq("account_number_masked", accountNumber.trim());

      const { data: existingAccount, error: accountLookupError } = await accountQuery.limit(1).maybeSingle();
      if (accountLookupError) throw new Error(accountLookupError.message);

      let accountId = existingAccount?.id as string | undefined;
      const isNewAccount = !accountId;

      if (!accountId) {
        const { data: createdAccount, error: accountError } = await supabase
          .from("financial_accounts")
          .insert({
            company_id: membership.company_id,
            account_type: "bank",
            institution_name: institution.trim(),
            account_name: accountName.trim(),
            account_number_masked: accountNumber.trim() || null,
            created_by: authData.user.id,
          })
          .select("id")
          .single();
        if (accountError) throw new Error(accountError.message);
        accountId = createdAccount.id;
      }

      setState("uploading");
      setStatus("Uploading the original statement securely…");
      const storagePath = `${membership.company_id}/bank-statements/${new Date().getUTCFullYear()}/${Date.now()}-${safeFileName(file.name)}`;
      const { error: storageError } = await supabase.storage
        .from("financial-documents")
        .upload(storagePath, file, { contentType: file.type || "application/octet-stream", upsert: false });

      if (storageError) throw new Error(`Secure file upload failed: ${storageError.message}`);

      setState("registering");
      setStatus("Registering the statement in the accounting record…");

      const { data: document, error: documentError } = await supabase
        .from("source_documents")
        .insert({
          company_id: membership.company_id,
          document_type: "bank_statement",
          file_name: file.name,
          storage_path: storagePath,
          file_hash: fileHash,
          source_name: institution.trim(),
          metadata: {
            original_size: file.size,
            extension: ext,
            mime_type: file.type || null,
            upload_method: "direct_browser_storage",
          },
          uploaded_by: authData.user.id,
        })
        .select("id")
        .single();

      if (documentError) {
        await supabase.storage.from("financial-documents").remove([storagePath]);
        throw new Error(`Statement registration failed: ${documentError.message}`);
      }

      const { data: statementImport, error: importError } = await supabase
        .from("statement_imports")
        .insert({
          document_id: document.id,
          company_id: membership.company_id,
          financial_account_id: accountId,
          detected_institution_name: institution.trim(),
          detected_account_name: accountName.trim(),
          detected_account_number_masked: accountNumber.trim() || null,
          status: "uploaded",
          detected_as_new_account: isNewAccount,
          rows_total: 0,
          rows_new: 0,
          rows_already_known: 0,
          rows_need_review: 0,
        })
        .select("id")
        .single();

      if (importError) throw new Error(`Import registration failed: ${importError.message}`);

      setState("done");
      setStatus(ext === "pdf" ? "Statement uploaded. Opening the import review; transaction parsing is the next step." : "Statement uploaded. Opening import review…");
      router.push(`/statements/${statementImport.id}?uploaded=1`);
      router.refresh();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The statement could not be uploaded.";
      setState("error");
      setStatus("Upload stopped");
      setError(message);
    }
  }

  return (
    <form className="statement-form" onSubmit={submit}>
      <div className="form-grid two-col">
        <label className="field">
          <span>Bank / institution</span>
          <input value={institution} onChange={(e) => setInstitution(e.target.value)} placeholder="e.g. OPay, Access Bank" autoComplete="organization" />
        </label>
        <label className="field">
          <span>Account label</span>
          <input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="e.g. OPay Business" />
          <small>Use the same label for future uploads from this account.</small>
        </label>
      </div>

      <label className="field">
        <span>Account number / identifier</span>
        <input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="Full or masked account number" inputMode="numeric" />
      </label>

      <label className="file-drop">
        <input type="file" accept=".pdf,.csv,.xls,.xlsx" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        <div>
          <strong>{file ? file.name : "Choose a bank statement"}</strong>
          <span>{file ? `${(file.size / 1024 / 1024).toFixed(2)} MB` : "PDF, CSV, XLS or XLSX · max 20 MB"}</span>
        </div>
        <b>{file ? "Change" : "Browse"}</b>
      </label>

      <div className={`upload-status ${state === "error" ? "error" : state === "done" ? "success" : ""}`}>
        <i aria-hidden="true">{state === "done" ? "✓" : state === "error" ? "!" : busy ? "…" : "↥"}</i>
        <div><strong>{status}</strong><span>Original file stays private. The app records the bank/account and prevents exact duplicate imports.</span></div>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <button className="primary-action" disabled={busy} type="submit">
        {busy ? "Working…" : "Upload statement"}
      </button>
    </form>
  );
}
