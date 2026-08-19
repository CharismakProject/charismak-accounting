"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

export default function DiscoverProjectsButton({ importId, compact = false }: { importId: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function discover() {
    setBusy(true);
    setError("");
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) {
        router.push("/login");
        return;
      }
      const { error: rpcError } = await supabase.rpc("discover_statement_projects", { target_import: importId });
      if (rpcError) throw new Error(rpcError.message);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project discovery failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 6 }}>
      <button type="button" className={compact ? "secondary-button" : "primary-action compact-button"} onClick={discover} disabled={busy}>
        {busy ? "Finding project signals…" : "Find projects & keywords"}
      </button>
      {error && <small style={{ color: "#b42318", fontSize: 10 }}>{error}</small>}
    </div>
  );
}
