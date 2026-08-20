import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const money=(v:any)=>v==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v));
const nice=(v:any)=>String(v??"").replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default async function ReviewInbox(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:membership}=await supabase.from("company_memberships").select("company_id,is_owner").eq("user_id",user.id).eq("status","active").limit(1).maybeSingle();
  if(!membership)redirect("/login");

  const [{data:intake},{data:statements},{data:docs}]=await Promise.all([
    supabase.from("intake_items").select("id,document_id,detected_type,detected_project_id,confidence,status,message,suggested_action,created_at,document:source_documents(file_name),project:projects(name,project_code)").eq("company_id",membership.company_id).in("status",["needs_review","failed"]).order("created_at",{ascending:false}).limit(100),
    supabase.from("statement_imports").select("id,detected_institution_name,detected_account_name,rows_pending_review,rows_need_review,status,created_at").eq("company_id",membership.company_id).gt("rows_pending_review",0).order("created_at",{ascending:false}).limit(50),
    supabase.from("project_document_intelligence").select("id,document_id,project_id,detected_subtype,confidence,grand_total,title,warnings,created_at,project:projects(name,project_code),document:source_documents(file_name)").eq("company_id",membership.company_id).eq("review_status","pending").order("created_at",{ascending:false}).limit(100),
  ]);

  const projectDocIds=new Set((docs??[]).map((r:any)=>r.document_id));
  const intakeOnly=(intake??[]).filter((r:any)=>!projectDocIds.has(r.document_id));
  const total=intakeOnly.length+(statements??[]).length+(docs??[]).length;

  return <main className="simple-shell"><div className="simple-wrap">
    <div className="simple-top"><Link href="/">← Home</Link><Link href="/add">+ Add</Link></div>
    <header className="add-hero"><span>NEEDS YOUR DECISION</span><h1>{total?`${total} item${total===1?"":"s"} need your help`:"Nothing needs your help right now"}</h1><p>Charismak handles confident records automatically. This inbox contains only the items where a human decision is still useful.</p></header>

    {!total&&<section className="add-card"><h2 style={{marginTop:0}}>You're clear.</h2><p style={{marginBottom:0,color:"#70808d"}}>New documents, statements and project records that need confirmation will appear here automatically.</p></section>}

    {!!(statements??[]).length&&<section className="smart-section"><div className="smart-section-title"><span>MONEY ACTIVITY</span><h2>Statements with unresolved movements</h2><p>You do not need to review transactions that were confidently matched and posted.</p></div>{(statements??[]).map((s:any)=><article className="confirmed-doc-row" key={s.id}><div><b>{s.detected_institution_name||"Bank statement"}</b><span>{s.detected_account_name||"Account"} · {s.rows_pending_review||0} movement(s) need a decision</span></div><Link href={`/statements/${s.id}`}>Review →</Link></article>)}</section>}

    {!!(docs??[]).length&&<section className="smart-section"><div className="smart-section-title"><span>PROJECT DOCUMENTS</span><h2>Documents needing interpretation</h2><p>These documents were read, but Charismak is not confident enough to change the official project record without you.</p></div>{(docs??[]).map((d:any)=>{const p=Array.isArray(d.project)?d.project[0]:d.project;const f=Array.isArray(d.document)?d.document[0]:d.document;return <article className="confirmed-doc-row" key={d.id}><div><b>{d.title||f?.file_name||nice(d.detected_subtype)}</b><span>{p?`${p.project_code} · ${p.name}`:"Project not confirmed"} · {nice(d.detected_subtype)} · {Math.round(Number(d.confidence||0))}% confidence</span></div><div style={{display:"flex",alignItems:"center",gap:12}}><strong>{money(d.grand_total)}</strong>{d.project_id?<Link href={`/projects/${d.project_id}/documents`}>Review →</Link>:<Link href="/add">Open →</Link>}</div></article>})}</section>}

    {!!intakeOnly.length&&<section className="smart-section"><div className="smart-section-title"><span>UNMATCHED RECORDS</span><h2>Files Charismak could not place confidently</h2><p>Usually this means the project, account or document relationship is still ambiguous.</p></div>{intakeOnly.map((r:any)=>{const d=Array.isArray(r.document)?r.document[0]:r.document;const p=Array.isArray(r.project)?r.project[0]:r.project;const action:any=r.suggested_action||{};const href=action?.statement_import_id?`/statements/${action.statement_import_id}`:r.detected_project_id?`/projects/${r.detected_project_id}/documents`:"/add";return <article className="confirmed-doc-row" key={r.id}><div><b>{d?.file_name||nice(r.detected_type)||"Uploaded record"}</b><span>{p?`${p.project_code} · ${p.name} · `:""}{r.message||"Needs one confirmation"}</span></div><Link href={href}>Decide →</Link></article>})}</section>}
  </div></main>;
}
