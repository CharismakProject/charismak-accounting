"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
      const response = await fetch(`/api/statements/${importId}/analyse`, { method: "POST" });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "PDF analysis failed.");
      setMessage(`Found ${result.rows ?? 0} transaction row(s). Refreshing review…`);
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
        <strong>PDF uploaded, transaction extraction pending</strong>
        <span>The original file is safe. Run the OPay parser to populate dates, debit/credit amounts, balances and references.</span>
      </div>
      <button type="button" className="primary-action compact-button" disabled={busy} onClick={analyse}>
        {busy ? "Analysing…" : "Analyse PDF now"}
      </button>
      {message && <small className="analyse-message">{message}</small>}
      {error && <small className="analyse-error">{error}</small>}
    </div>
  );
}
