import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { uploadProjectDocuments, retryProjectDocumentAnalysis, confirmProjectDocument } from "./actions";
import { acceptDocumentInterpretation } from "./simple-actions";

const money=(v:any)=>v==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:2}).format(Number(v));
const label=(v:any)=>String(v??"other").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

function humanMeaning(intel:any,app:any){
  if(app){
    if(app.commercial_role==="base_scope")return "Base project scope";
    if(app.commercial_role==="additional_scope")return "Additional / new project scope";
    if(app.commercial_role==="variation")return "Variation to an existing scope";
    if(app.billing_role==="client_invoice")return "Client invoice";
    if(app.effect==="funding_reconciliation_evidence")return "Funding / retirement evidence";
    if(app.effect==="funding_request_evidence")return "Funding request evidence";
    return "Project evidence";
  }
  const k=String(intel?.detected_subtype||"");const t=String(intel?.raw_text_preview||"").toLowerCase();
  if(k==="boq"||k==="quotation")return "Likely base project scope / commercial proposal";
  if(k==="variation")return intel?.related_reference?"Likely variation to an earlier scope":"Likely additional / new project scope";
  if(k==="invoice"&&/additional|new scope|extra work|variation|revised scope/.test(t))return "Likely additional scope and client invoice";
  if(k==="invoice")return "Likely client invoice";
  if(k==="fund_retirement")return "Likely project funding / retirement evidence";
  if(k==="fund_request")return "Likely project funding request";
  if(k==="receipt"||k==="bill")return "Likely project cost evidence";
  return "Project document";
}

export default async function ProjectDocumentsPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<Record<string,string|undefined>>}){
  const {id}=await params;const q=await searchParams;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,company_id,project_code,name").eq("id",id).maybeSingle();if(!project)notFound();
  const [{data:docs},{data:intelRows},{data:apps},{data:commercial}]=await Promise.all([
    supabase.from("source_documents").select("id,file_name,document_type,amount,uploaded_at,metadata").eq("project_id",id).order("uploaded_at",{ascending:false}),
    supabase.from("project_document_intelligence").select("*").eq("project_id",id).order("created_at",{ascending:false}),
    supabase.from("project_document_applications").select("*").eq("project_id",id).order("applied_at",{ascending:false}),
    supabase.from("project_commercial_positions").select("*").eq("project_id",id).maybeSingle(),
  ]);
  const intelBy=new Map((intelRows??[]).map((r:any)=>[r.document_id,r]));const appBy=new Map((apps??[]).map((r:any)=>[r.document_id,r]));
  const pending=(docs??[]).filter((d:any)=>intelBy.get(d.id)?.review_status!=="confirmed");
  const confirmed=(docs??[]).filter((d:any)=>intelBy.get(d.id)?.review_status==="confirmed");

  return <main className="simple-shell project-doc-page"><div className="simple-wrap">
    <div className="simple-top"><Link href={`/projects/${id}`}>← Project overview</Link><Link href="/add">+ Add anything</Link></div>
    <header className="document-page-head"><span>PROJECT DOCUMENTS</span><h1>{project.name}</h1><p>Upload what you already use. Charismak reads the documents, connects related scopes, and tells you what it thinks each one should change before it becomes official.</p></header>

    <section className="commercial-tree-card">
      <div><small>Current identified commercial value</small><strong>{money(commercial?.identified_commercial_value)}</strong><p>What the confirmed documents currently say this project is worth.</p></div>
      <div className="commercial-tree-grid"><span><b>{money(commercial?.base_scope)}</b><small>Base scope</small></span><span><b>{money(commercial?.additional_scope)}</b><small>Additional scope</small></span><span><b>{money(commercial?.variations)}</b><small>Variations</small></span><span><b>{money(commercial?.documented_client_invoices)}</b><small>Client invoices</small></span></div>
    </section>

    <form action={uploadProjectDocuments} encType="multipart/form-data" className="smart-doc-upload">
      <input type="hidden" name="project_id" value={id}/><label><input type="file" name="documents" multiple accept=".pdf,.csv,.xlsx,.xls,.docx,.jpg,.jpeg,.png,.webp"/><strong>Add project files</strong><span>Select several files together. PDF, Excel, Word and images are retained as evidence.</span></label><button type="submit">Upload & understand</button>
    </form>
    {(q.uploaded||q.accepted)&&<div className="smart-success">{q.accepted?"Document accepted and project position refreshed.":`${q.uploaded||0} document(s) uploaded. Review only the items Charismak could not apply confidently.`}</div>}

    {!!pending.length&&<section className="smart-section"><div className="smart-section-title"><span>NEEDS YOUR EYES</span><h2>{pending.length} item{pending.length===1?"":"s"} need confirmation</h2><p>You should mainly be confirming Charismak's interpretation—not doing the interpretation yourself.</p></div>{pending.map((doc:any)=>{const intel:any=intelBy.get(doc.id);const lines=Array.isArray(intel?.extracted_line_items)?intel.extracted_line_items:[];return <article key={doc.id} className="smart-doc-card">
      <div className="smart-doc-top"><div><small>{label(intel?.detected_subtype||doc.document_type)} · {Math.round(Number(intel?.confidence||0))}% confidence</small><h3>{intel?.title||doc.file_name}</h3><p>{doc.file_name}</p></div><strong>{money(intel?.grand_total??doc.amount)}</strong></div>
      {intel?.analysis_status==="failed"?<div className="smart-warning">{(intel?.warnings||[])[0]||"This file was retained, but automatic interpretation needs help."}</div>:<>
        <div className="what-understood"><span>I think this is</span><strong>{humanMeaning(intel,null)}</strong>{intel?.related_reference&&<p>It appears related to <b>{intel.related_reference}</b>.</p>}{intel?.document_reference&&<p>Reference: {intel.document_reference}</p>}</div>
        {!!lines.length&&<div className="scope-preview"><small>Scope found</small>{lines.slice(0,4).map((r:any,i:number)=><div key={i}><span>{r.description}</span><b>{money(r.amount)}</b></div>)}{lines.length>4&&<em>+ {lines.length-4} more line items</em>}</div>}
        <div className="smart-doc-actions"><form action={acceptDocumentInterpretation}><input type="hidden" name="project_id" value={id}/><input type="hidden" name="document_id" value={doc.id}/><button className="accept-meaning" type="submit">Yes, add this to {project.name}</button></form><details><summary>Change interpretation</summary><form action={confirmProjectDocument} className="advanced-doc-form"><input type="hidden" name="project_id" value={id}/><input type="hidden" name="document_id" value={doc.id}/><label>What should it do?<select name="effect" defaultValue={intel?.suggested_effect||"reference_only"}><option value="reference_only">Evidence only</option><option value="contract_baseline">Base / commercial scope</option><option value="client_invoice">Client invoice</option><option value="variation">Variation / additional work</option><option value="internal_cost_budget">Internal cost budget</option><option value="funding_reconciliation_evidence">Funding / retirement evidence</option><option value="funding_request_evidence">Funding request evidence</option><option value="supporting_evidence">Supporting evidence</option></select></label><label>Amount<input name="confirmed_amount" type="number" step="0.01" defaultValue={intel?.grand_total??""}/></label><label className="wide">Note<input name="confirmation_notes" placeholder="Why you changed Charismak's interpretation"/></label><button type="submit">Apply correction</button></form></details></div>
      </>}
      {intel?.analysis_status==="failed"&&<form action={retryProjectDocumentAnalysis}><input type="hidden" name="project_id" value={id}/><input type="hidden" name="document_id" value={doc.id}/><button type="submit">Try analysis again</button></form>}
    </article>})}</section>}

    <section className="smart-section"><div className="smart-section-title"><span>PROJECT RECORD</span><h2>Organised documents</h2><p>These files remain attached as evidence even if an interpretation is later corrected.</p></div>{confirmed.length?confirmed.map((doc:any)=>{const intel:any=intelBy.get(doc.id);const app:any=appBy.get(doc.id);return <article key={doc.id} className="confirmed-doc-row"><div><b>{humanMeaning(intel,app)}</b><span>{doc.file_name}{intel?.document_reference?` · ${intel.document_reference}`:""}</span></div><strong>{money(app?.amount??intel?.grand_total??doc.amount)}</strong></article>}):<div className="smart-empty">No confirmed project documents yet.</div>}</section>
  </div></main>;
}
