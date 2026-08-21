"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../lib/supabase/client";

export default function DeleteAnyDocumentButton({documentId,statementImportId}:{documentId:string;statementImportId?:string|null}){
  const router=useRouter();const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  async function remove(){if(busy)return;if(!window.confirm("Delete this uploaded record? Active accounting created only by this statement/document will be cleaned where safe, and the deletion will remain in the audit trail."))return;setBusy(true);setError("");try{const supabase=createClient();const result=statementImportId?await supabase.rpc("delete_statement_import_with_audit",{target_import:statementImportId}):await supabase.rpc("delete_source_document_with_audit",{target_document:documentId});if(result.error)throw result.error;const data:any=result.data||{};if(data.storage_path&&!data.virtual_sheet)await supabase.storage.from(data.bucket||"universal-intake").remove([data.storage_path]);router.refresh();}catch(e:any){setError(e?.message||"Record could not be deleted.");}finally{setBusy(false);}}
  return <span style={{display:"inline-flex",flexDirection:"column",gap:3,alignItems:"flex-end"}}><button type="button" onClick={remove} disabled={busy} className="secondary-button" style={{color:"#a33d3d",borderColor:"#e7caca"}}>{busy?"Deleting…":"Delete"}</button>{error&&<small style={{color:"#a33d3d",maxWidth:260,textAlign:"right"}}>{error}</small>}</span>;
}
