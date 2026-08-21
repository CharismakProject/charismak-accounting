"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function DeleteStatementButton({ importId, compact = false }: { importId: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function remove() {
    if (busy) return;
    if (!window.confirm("Delete this statement import? Its statement-generated transactions will be removed where safe, but the deletion itself remains in the audit trail.")) return;
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { data, error: rpcError } = await supabase.rpc("delete_statement_import_with_audit", { target_import: importId });
      if (rpcError) throw rpcError;
      const result: any = data || {};
      if (!result.virtual_sheet && result.storage_path) {
        await supabase.storage.from(result.bucket || "universal-intake").remove([result.storage_path]);
      }
      router.push("/statements?deleted=1");
      router.refresh();
    } catch (e: any) {
      setError(e?.message || "Statement could not be deleted.");
    } finally { setBusy(false); }
  }

  return <span style={{display:"inline-flex",flexDirection:"column",gap:4,alignItems:"flex-start"}}>
    <button type="button" onClick={remove} disabled={busy} className={compact ? "secondary-button" : "secondary-button"} style={{color:"#a33d3d",borderColor:"#e6caca"}}>{busy ? "Deleting…" : "Delete"}</button>
    {error && <small style={{color:"#a33d3d",maxWidth:260}}>{error}</small>}
  </span>;
}
