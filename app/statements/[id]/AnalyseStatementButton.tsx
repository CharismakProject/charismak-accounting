"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

const SUPABASE_URL = "https://qezwpaeqbkoxrprohall.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_b0_8qUaf9pC7Js2pOOOKDA_JiiBdPaQ";

export default function AnalyseStatementButton({ importId }: { importId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function analyse() {
    setBusy(true);
    setError("");
    setMessage("Extracting and comparing statement transactions…");

    try {
      const supabase = createClient();
      const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (sessionError || !accessToken) {
        await supabase.auth.signOut();
        router.push("/login");
        return;
      }

      const response = await fetch(`${SUPABASE_URL}/functions/v1/analyse-statement`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, apikey: SUPABASE_PUBLISHABLE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ importId }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result?.error || `Statement analyser returned ${response.status}.`);

      setMessage("Transactions extracted. Matching existing and possible new projects…");
      const { error: discoveryError } = await supabase.rpc("discover_statement_projects", { target_import: importId });
      if (discoveryError) throw new Error(`Project discovery failed: ${discoveryError.message}`);

      setMessage("Project signals found. Posting unique high-confidence existing-project matches…");
      const { data: posting, error: postingError } = await supabase.rpc("auto_post_statement_matches", { target_import: importId, minimum_confidence: 94 });
      if (postingError) throw new Error(`Automatic posting failed: ${postingError.message}`);

      const posted = Number(posting?.autoPosted ?? 0);
      const pending = Number(posting?.pendingReview ?? 0);
      setMessage(`Analysis complete: ${posted.toLocaleString()} transaction${posted === 1 ? "" : "s"} auto-posted; ${pending.toLocaleString()} left for review.`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Statement analysis failed.");
      setMessage("");
    } finally {
      setBusy(false);
    }
  }

  return <div className="analyse-box">
    <div><strong>Statement uploaded — analysis pending</strong><span>Extract transactions, detect projects, auto-post confident matches, then leave only unresolved rows for review.</span></div>
    <button type="button" className="primary-action compact-button" disabled={busy} onClick={analyse}>{busy ? "Analysing…" : "Analyse statement"}</button>
    {message && <small className="analyse-message">{message}</small>}
    {error && <small className="analyse-error">{error}</small>}
  </div>;
}
