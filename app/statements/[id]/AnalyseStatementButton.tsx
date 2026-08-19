"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

export default function AnalyseStatementButton({ importId }: { importId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function analyse() {
    setBusy(true);
    setError("");
    setMessage("Extracting transactions from the stored PDF…");
    try {
      const supabase = createClient();
      const { data, error: invokeError } = await supabase.functions.invoke("analyse-statement", {
        body: { importId },
      });
      if (invokeError) throw new Error(invokeError.message || "PDF analysis failed.");
      if (data?.error) throw new Error(data.error);
      setMessage(`Found ${data?.rows ?? 0} transaction row(s). Refreshing review…`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "PDF analysis failed.");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="analyse-box">
      <div>
        <strong>Statement uploaded — analysis pending</strong>
        <span>Run the secure statement processor to extract dates, debit/credit amounts, balances and references.</span>
      </div>
      <button type="button" className="primary-action compact-button" disabled={busy} onClick={analyse}>
        {busy ? "Analysing…" : "Analyse statement"}
      </button>
      {message && <small className="analyse-message">{message}</small>}
      {error && <small className="analyse-error">{error}</small>}
    </div>
  );
}
