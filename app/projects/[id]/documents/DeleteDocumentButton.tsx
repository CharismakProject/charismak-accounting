"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../../lib/supabase/client";

export default function DeleteDocumentButton({ documentId, projectId }: { documentId: string; projectId: string }) {
  const router=useRouter();
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  async function remove(){
    if(busy)return;
    if(!window.confirm("Delete this document? The file will be removed from the active project record, but the audit trail will keep who deleted it and what record was removed."))return;
    setBusy(true);setError("");
    try{
      const supabase=createClient();
      const {data,error:rpcError}=await supabase.rpc("delete_source_document_with_audit",{target_document:documentId});
      if(rpcError)throw rpcError;
      const result:any=data||{};
      if(!result.virtual_sheet&&result.storage_path)await supabase.storage.from(result.bucket||"universal-intake").remove([result.storage_path]);
      router.push(`/projects/${projectId}/documents?deleted=1`);router.refresh();
    }catch(e:any){setError(e?.message||"Document could not be deleted.");}
    finally{setBusy(false);}
  }
  return <span style={{display:"inline-flex",flexDirection:"column",gap:3}}><button type="button" onClick={remove} disabled={busy} className="secondary-button" style={{color:"#a33d3d",borderColor:"#e6caca"}}>{busy?"Deleting…":"Delete"}</button>{error&&<small style={{color:"#a33d3d",maxWidth:260}}>{error}</small>}</span>;
}
