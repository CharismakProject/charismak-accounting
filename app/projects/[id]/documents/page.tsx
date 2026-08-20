import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { confirmProjectDocument, retryProjectDocumentAnalysis, uploadProjectDocuments } from "./actions";

const money=(value:number|string|null|undefined)=>value==null||value===""?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}).format(Number(value));
const label=(v:string|null|undefined)=>String(v||"unknown").replaceAll("_"," ");
const effectOptions=[
  ["reference_only","Evidence / reference only"],
  ["contract_baseline","Client contract / commercial baseline"],
  ["client_invoice","Client invoice / amount invoiced"],
  ["variation","Variation / additional work"],
  ["internal_cost_budget","Internal cost budget"],
  ["funding_reconciliation_evidence","Funding / retirement evidence"],
  ["funding_request_evidence","Funding request evidence"],
  ["supporting_evidence","Other supporting evidence"],
] as const;

export default async function ProjectDocumentsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const {id}=await params;const query=await searchParams;const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("id,company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!membership)redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,company_id,project_code,name,location,status").eq("id",id).eq("company_id",membership.company_id).maybeSingle();if(!project)notFound();

  const [{data:documents},{data:intelligence},{data:applications},{data:positionLinks},{data:permissions}]=await Promise.all([
    supabase.from("source_documents").select("id,document_type,file_name,storage_path,file_hash,document_date,source_name,amount,metadata,uploaded_at").eq("project_id",id).neq("document_type","bank_statement").order("uploaded_at",{ascending:false}).limit(100),
    supabase.from("project_document_intelligence").select("*").eq("project_id",id).order("created_at",{ascending:false}),
    supabase.from("project_document_applications").select("document_id,effect,amount,applied_at").eq("project_id",id),
    supabase.from("membership_positions").select("position_id").eq("membership_id",membership.id),
    supabase.from("permissions").select("id,code").in("code",["documents.upload","documents.confirm"]),
  ]);
  const permissionIds=(permissions??[]).map((p:any)=>p.id);const positionIds=(positionLinks??[]).map((p:any)=>p.position_id);
  const [{data:rolePermissions},{data:overrides}]=await Promise.all([
    positionIds.length&&permissionIds.length?supabase.from("position_permissions").select("permission_id").in("position_id",positionIds).in("permission_id",permissionIds):Promise.resolve({data:[]} as any),
    permissionIds.length?supabase.from("membership_permission_overrides").select("permission_id,allowed").eq("membership_id",membership.id).in("permission_id",permissionIds):Promise.resolve({data:[]} as any),
  ]);
  const permissionMap=new Map((permissions??[]).map((p:any)=>[p.code,p.id]));
  const has=(code:string)=>{if(membership.is_owner)return true;const pid=permissionMap.get(code);if(!pid)return false;const override=(overrides??[]).find((o:any)=>o.permission_id===pid);if(override)return Boolean(override.allowed);return (rolePermissions??[]).some((r:any)=>r.permission_id===pid)};
  const canUpload=has("documents.upload"),canConfirm=has("documents.confirm");
  const intelMap=new Map((intelligence??[]).map((x:any)=>[x.document_id,x]));const appMap=new Map((applications??[]).map((x:any)=>[x.document_id,x]));
  const docs=await Promise.all((documents??[]).map(async(doc:any)=>{let url:string|null=null;if(doc.storage_path){const bucket=String(doc.metadata?.bucket||"project-documents");const {data}=await supabase.storage.from(bucket).createSignedUrl(doc.storage_path,3600);url=data?.signedUrl??null}return{...doc,url,intel:intelMap.get(doc.id),application:appMap.get(doc.id)}}));

  return <main className="page-shell project-doc-page"><div className="page-wrap">
    <div className="page-actions"><Link href={`/projects/${id}`}>← Project</Link><Link href="/projects">All Projects</Link><Link href="/">Dashboard</Link></div>
    <header className="document-hero"><div><small>PROJECT DOCUMENT INTELLIGENCE</small><h1>{project.name}</h1><p>{project.project_code} · {project.location||"Location not set"}. Upload several project documents; the app analyses each one separately and never changes the official project position until an authorised person confirms it.</p></div><div className="document-hero-stat"><b>{docs.length}</b><span>documents attached</span></div></header>

    {(query.uploaded||query.confirmed||query.retry)&&<div className="document-status-banner">{query.uploaded&&<span>{query.uploaded} uploaded · {query.analysed||0} analysed · {query.duplicates||0} duplicate(s) skipped · {query.failed||0} need attention</span>}{query.confirmed&&<span>Document interpretation confirmed and applied.</span>}{query.retry&&<span>Analysis retry: {query.retry}.</span>}</div>}

    <section className="data-card document-upload-card"><div className="section-title"><small>ADD EVIDENCE</small><h2>Upload project documents</h2><p>PDF, Excel, CSV, Word and image files can live under the same project. Text PDF, Excel/CSV and DOCX are analysed automatically in this version; image/scanned files stay attached even when automated extraction needs further visual processing.</p></div>
      {canUpload?<form action={uploadProjectDocuments} encType="multipart/form-data" className="document-upload-form"><input type="hidden" name="project_id" value={id}/><label className="document-drop"><input type="file" name="documents" multiple required accept=".pdf,.xlsx,.xls,.csv,.docx,.jpg,.jpeg,.png,.webp"/><b>Select one or several files</b><span>Up to 10 at a time · maximum 20 MB each</span></label><button type="submit" className="primary-button">Upload & analyse</button></form>:<p className="document-permission-note">You can review documents for this project, but your current permission set does not allow uploads.</p>}
    </section>

    <section className="document-explainer"><article><b>1. Keep original</b><span>The uploaded file remains project evidence.</span></article><article><b>2. Interpret</b><span>Type, dates, references, totals and scope are suggested.</span></article><article><b>3. Review</b><span>You correct or choose what the document means.</span></article><article><b>4. Apply</b><span>Only authorised confirmation changes project records.</span></article></section>

    <section className="document-list-head"><div><small>PROJECT FILE</small><h2>Documents & extracted information</h2></div><span>{docs.filter((d:any)=>d.intel?.review_status==="pending").length} awaiting review</span></section>
    {!docs.length&&<section className="data-card"><p className="empty-state">No project document has been uploaded yet.</p></section>}
    <div className="document-list">{docs.map((doc:any)=>{const intel=doc.intel;const app=doc.application;const warnings=Array.isArray(intel?.warnings)?intel.warnings:[];const lines=Array.isArray(intel?.extracted_line_items)?intel.extracted_line_items:[];return <article className="document-card" key={doc.id}>
      <div className="document-card-head"><div><div className="document-badges"><span>{label(intel?.detected_subtype||doc.document_type)}</span>{intel?.confidence!=null&&<span>{Number(intel.confidence).toFixed(0)}% confidence</span>}{app&&<span className="confirmed">confirmed</span>}</div><h3>{intel?.title||doc.file_name}</h3><p>{doc.file_name} · uploaded {new Date(doc.uploaded_at).toLocaleDateString("en-NG")}</p></div>{doc.url&&<a href={doc.url} target="_blank" rel="noreferrer" className="secondary-button">Open original</a>}</div>
      {intel?.analysis_status==="failed"&&<div className="document-warning"><b>Automatic extraction needs attention</b><span>{warnings[0]||"The original file is safe and still attached."}</span>{canUpload&&<form action={retryProjectDocumentAnalysis}><input type="hidden" name="project_id" value={id}/><input type="hidden" name="document_id" value={doc.id}/><button type="submit">Retry analysis</button></form>}</div>}
      {intel?.analysis_status==="ready"&&<>
        <div className="document-fields"><Info k="Detected type" v={label(intel.detected_subtype)}/><Info k="Reference" v={intel.document_reference||"—"}/><Info k="Related document" v={intel.related_reference||"—"}/><Info k="Document date" v={intel.document_date||"—"}/><Info k="Client / source" v={intel.client_name||doc.source_name||"—"}/><Info k="Suggested effect" v={label(intel.suggested_effect)}/><Info k="Subtotal" v={money(intel.subtotal)}/><Info k="Discount" v={money(intel.discount_amount)}/><Info k="VAT" v={money(intel.vat_amount)}/><Info k="Detected total" v={money(intel.grand_total)}/></div>
        {warnings.length>0&&<div className="document-warning"><b>Review note</b>{warnings.map((w:string,i:number)=><span key={i}>{w}</span>)}</div>}
        {lines.length>0&&<div className="document-lines"><div className="document-lines-head"><b>Extracted scope / line items</b><span>{lines.length} detected</span></div>{lines.slice(0,6).map((r:any,i:number)=><div className="document-line" key={i}><div><b>{r.item_code?`${r.item_code} · `:""}{String(r.description||"Item").slice(0,150)}</b><small>{r.section||"No section"}{r.unit?` · ${r.unit}`:""}</small></div><strong>{money(r.amount)}</strong></div>)}{lines.length>6&&<p>+ {lines.length-6} more extracted rows. They remain part of the review data.</p>}</div>}
        {app?<div className="document-applied"><b>Applied as {label(app.effect)}</b><span>{money(app.amount)} · {new Date(app.applied_at).toLocaleDateString("en-NG")}</span></div>:canConfirm?<form action={confirmProjectDocument} className="document-confirm-form"><input type="hidden" name="project_id" value={id}/><input type="hidden" name="document_id" value={doc.id}/><label>What should this document do?<select name="effect" defaultValue={intel.suggested_effect||"reference_only"}>{effectOptions.map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label><label>Confirmed amount<input name="confirmed_amount" inputMode="decimal" defaultValue={intel.grand_total??""} placeholder="Leave blank if evidence only"/></label>{lines.length>0&&<label className="check-row"><input type="checkbox" name="import_line_items"/><span>Also import these extracted line items when this is confirmed as a contract baseline or internal cost budget.</span></label>}<label className="full">Confirmation note<textarea name="confirmation_notes" rows={2} placeholder="Optional correction, context or approval note"/></label><div className="full document-confirm-foot"><span>Nothing above is posted until you press Confirm & apply.</span><button type="submit" className="primary-button">Confirm & apply</button></div></form>:<p className="document-permission-note">Analysis is available for review. Final application requires document-confirmation authority.</p>}
      </>}
      {!intel&&<div className="document-warning"><b>Analysis has not started</b><span>The file is attached. Retry from this page if the analysis record does not appear.</span></div>}
    </article>})}</div>
  </div></main>;
}

function Info({k,v}:{k:string;v:string}){return <div><small>{k}</small><b>{v}</b></div>}
