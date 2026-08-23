"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function TransactionIntelligenceButton({ importId }: { importId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function run() {
    if (busy) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/transaction-intelligence", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ importId, maxRows: 24 }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || "Transaction intelligence could not complete.");
      setMessage(result?.message || "Transaction intelligence completed.");
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Transaction intelligence could not complete.");
    } finally {
      setBusy(false);
    }
  }

  return <div style={{ display: "grid", gap: 5 }}>
    <button type="button" className="primary-action compact-button" onClick={run} disabled={busy}>
      {busy ? "Understanding transaction meaning…" : "Run transaction intelligence"}
    </button>
    {message && <span className="analyse-message">{message}</span>}
    {error && <span className="analyse-error">{error}</span>}
  </div>;
}

