"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

const parseKeywords=(value:string)=>Array.from(new Set(value.split(/[\n,;]+/).map(v=>v.trim()).filter(v=>v.length>=2))).slice(0,30);

export default function DiscoverProjectsButton({ importId, compact = false }: { importId: string; compact?: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [open,setOpen]=useState(false);
  const [keywordText,setKeywordText]=useState("");

  async function discover(useKeywords=false) {
    setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) { router.push("/login"); return; }
      const keywords=parseKeywords(keywordText);
      if(useKeywords&&!keywords.length){setError("Enter at least one keyword, project name or site tag.");return;}
      const { error: rpcError } = useKeywords
        ? await supabase.rpc("discover_statement_projects_with_keywords", { target_import: importId, target_keywords: keywords })
        : await supabase.rpc("discover_statement_projects", { target_import: importId });
      if (rpcError) throw new Error(rpcError.message);
      router.push(`/statements/${importId}/projects`);
      router.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Project discovery failed.");
    } finally { setBusy(false); }
  }

  return (
    <div style={{ display: "grid", gap: 7, minWidth: compact?190:230 }}>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
        <button type="button" className={compact ? "secondary-button" : "primary-action compact-button"} onClick={()=>discover(false)} disabled={busy}>
          {busy ? "Searching statement…" : compact ? "Refresh automatic signals" : "Find automatic signals"}
        </button>
        <button type="button" className="secondary-button" onClick={()=>setOpen(v=>!v)} disabled={busy}>{open?"Close keyword search":"Search my keywords"}</button>
      </div>
      {open&&<div style={{display:"grid",gap:6,padding:9,border:"1px solid #dbe5ec",borderRadius:10,background:"#f8fbfd"}}>
        <label style={{display:"grid",gap:4,fontSize:10,fontWeight:800,color:"#52697b"}}>Project / site / client keywords
          <textarea rows={3} value={keywordText} onChange={e=>setKeywordText(e.target.value)} placeholder="e.g. Jahi, COCO, PCC, KMSTEEL" style={{width:"100%",border:"1px solid #cbd9e3",borderRadius:8,padding:8,font:"inherit",resize:"vertical"}}/>
        </label>
        <small style={{fontSize:9,lineHeight:1.45,color:"#708295"}}>Charismak will search narration, counterparty and reference. Matches become reviewable signals with transaction count and money in/out; they are not turned into projects until you create or link them.</small>
        <button type="button" className="primary-action compact-button" onClick={()=>discover(true)} disabled={busy}>{busy?"Searching…":"Search these keywords"}</button>
      </div>}
      {error && <small style={{ color: "#b42318", fontSize: 10 }}>{error}</small>}
    </div>
  );
}
