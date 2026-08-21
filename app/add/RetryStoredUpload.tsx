"use client";

import Link from "next/link";
import { useState } from "react";
import { createClient } from "../../lib/supabase/client";

type Props = {
  documentId: string;
  batchId: string;
  fileName: string;
  message?: string | null;
};

export default function RetryStoredUpload({ documentId, batchId, fileName, message }: Props) {
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(message || "This upload is already stored safely. Retry the analyser without selecting the file again.");
  const [href, setHref] = useState<string | null>(null);

  async function retry() {
    if (busy) return;
    setBusy(true);
    setHref(null);
    setStatus("Re-analysing the stored workbook…");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.functions.invoke("analyse-intake-document-v3", {
        body: { documentId, batchId },
      });
      if (error) throw error;
      if (data?.statementImportId) setHref(`/statements/${data.statementImportId}`);
      setStatus(data?.message || (data?.status === "applied" ? "Statement processed successfully." : "Analysis completed and needs review."));
      window.setTimeout(() => window.location.reload(), 1200);
    } catch (error: any) {
      const response = error?.context as Response | undefined;
      let detail = "The stored file could not be analysed yet.";
      try {
        const payload = response ? await response.clone().json() : null;
        detail = payload?.error || payload?.message || error?.message || detail;
      } catch {
        detail = error?.message || detail;
      }
      setStatus(detail);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="stored-retry-card" style={{ margin: "0 0 14px", padding: 14, border: "1px solid #d8e3eb", borderRadius: 14, background: "#fff" }}>
      <small style={{ fontWeight: 900, letterSpacing: ".08em", color: "#0c6f65" }}>STORED UPLOAD READY TO RETRY</small>
      <strong style={{ display: "block", marginTop: 5, color: "#12344d", overflowWrap: "anywhere" }}>{fileName}</strong>
      <p style={{ margin: "6px 0 10px", fontSize: 12, lineHeight: 1.45, color: "#667987" }}>{status}</p>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        <button type="button" onClick={retry} disabled={busy} style={{ border: 0, borderRadius: 9, padding: "10px 14px", background: "#0b587f", color: "#fff", fontWeight: 850 }}>
          {busy ? "Analysing stored file…" : "Retry stored file"}
        </button>
        {href && <Link href={href} style={{ padding: "10px 12px", fontWeight: 800 }}>Open statement →</Link>}
      </div>
    </section>
  );
}
