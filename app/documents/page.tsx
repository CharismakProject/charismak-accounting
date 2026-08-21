import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";
import DeleteAnyDocumentButton from "./DeleteAnyDocumentButton";

const nice=(v:any)=>String(v??"other").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());
export default async function DocumentsPage(){
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();if(!membership)redirect("/login");
  const [{data:docs},{data:imports},{data:intake}]=await Promise.all([
    supabase.from("source_documents").select("id,file_name,document_type,project_id,source_name,uploaded_at,project:projects(project_code,name)").eq("company_id",membership.company_id).order("uploaded_at",{ascending:false}).limit(250),
    supabase.from("statement_imports").select("id,document_id,status,rows_total,rows_pending_review").eq("company_id",membership.company_id),
    supabase.from("intake_items").select("document_id,status,message").eq("company_id",membership.company_id),
  ]);
  const impBy=new Map((imports??[]).map((r:any)=>[r.document_id,r]));const intakeBy=new Map((intake??[]).map((r:any)=>[r.document_id,r]));
  return <main className="simple-shell"><div className="simple-wrap"><div className="simple-top"><Link href="/">← Home</Link><span style={{display:"flex",gap:12}}><Link href="/review">Needs decision</Link><Link href="/add">+ Add</Link></span></div><header className="add-hero"><span>DOCUMENT LIBRARY</span><h1>Everything you have uploaded.</h1><p>Statements, BOQs, quotations, invoices, bills, receipts and supporting records stay visible here whether or not they have already been attached to a project.</p></header>
    <section className="smart-section"><div className="smart-section-title"><span>ACTIVE RECORDS</span><h2>{(docs??[]).length} document{(docs??[]).length===1?"":"s"}</h2><p>You can open organised records, finish decisions, or delete an upload. Deletions remain in the audit trail.</p></div>{(docs??[]).length?(docs??[]).map((d:any)=>{const p=Array.isArray(d.project)?d.project[0]:d.project;const imp:any=impBy.get(d.id);const it:any=intakeBy.get(d.id);const href=imp?`/statements/${imp.id}`:d.project_id?`/projects/${d.project_id}/documents`:it&&["needs_review","failed"].includes(it.status)?`/review?document=${d.id}`:"/add";return <article className="confirmed-doc-row" key={d.id} style={{gap:10,alignItems:"center"}}><div style={{minWidth:0}}><b>{d.file_name}</b><span>{nice(d.document_type)}{p?` · ${p.project_code} · ${p.name}`:" · Not yet attached to a project"}{imp?` · ${imp.rows_total||0} statement rows`:""}</span>{it?.message&&<small style={{display:"block",marginTop:3,color:"#7b8b98"}}>{it.message}</small>}</div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><Link href={href}>{it&&["needs_review","failed"].includes(it.status)?"Decide →":"Open →"}</Link><DeleteAnyDocumentButton documentId={d.id} statementImportId={imp?.id}/></div></article>}):<div className="smart-empty">No uploaded documents yet.</div>}</section>
  </div></main>;
}
