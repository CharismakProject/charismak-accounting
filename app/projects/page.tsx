import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../lib/supabase/server";

const money=(value:number|string|null|undefined)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(value));

export default async function ProjectsPage(){
  const supabase=await createClient();const {data:authData}=await supabase.auth.getUser();if(!authData.user)redirect("/login");
  const [{data:projects,error},{data:commercialRows}]=await Promise.all([
    supabase.from("projects").select("id,project_code,name,location,status,progress_percent,client:clients(name),summary:project_financial_summaries(funding_received,confirmed_expenditure,cash_balance,outstanding_commitments,funding_surplus_shortfall,forecast_profit)").neq("status","archived").order("created_at",{ascending:false}),
    supabase.from("project_commercial_positions").select("project_id,base_scope,additional_scope,variations,identified_commercial_value,documented_client_invoices,documents_needing_review"),
  ]);if(error)throw new Error(error.message);
  const cmap=new Map((commercialRows??[]).map((r:any)=>[r.project_id,r]));
  const rows=(projects??[]).map((project:any)=>({...project,summary:Array.isArray(project.summary)?project.summary[0]:project.summary,client:Array.isArray(project.client)?project.client[0]:project.client,commercial:cmap.get(project.id)}));
  const totals=rows.reduce((a:any,p:any)=>{a.commercial+=Number(p.commercial?.identified_commercial_value??0);a.funding+=Number(p.summary?.funding_received??0);a.expenditure+=Number(p.summary?.confirmed_expenditure??0);a.commitments+=Number(p.summary?.outstanding_commitments??0);a.position+=Number(p.summary?.funding_surplus_shortfall??0);a.review+=Number(p.commercial?.documents_needing_review??0);return a},{commercial:0,funding:0,expenditure:0,commitments:0,position:0,review:0});
  const active=rows.filter((p:any)=>p.status==="active"||p.status==="on_hold").length;
  return <main className="page-canvas"><div className="page-wrap">
    <div className="page-toolbar project-toolbar"><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link href="/" className="back-link">← Home</Link><Link href="/add" className="secondary-link">+ Add records</Link></div><Link href="/projects/new" className="md-button">+ New Project</Link></div>
    <header className="page-heading compact project-list-heading"><p className="page-eyebrow">Projects</p><h1>Your Project Portfolio</h1><p>Open a project to see its commercial scope, money, documents, commitments and decisions in one place.</p></header>
    <section className="project-summary-strip">
      <div><small>Visible projects</small><b>{rows.length}</b><span>{active} active / on hold</span></div>
      <div><small>Identified commercial value</small><b>{money(totals.commercial)}</b><span>Base + additions + variations</span></div>
      <div><small>Client project funding</small><b>{money(totals.funding)}</b><span>Across permitted projects</span></div>
      <div><small>Confirmed expenditure</small><b>{money(totals.expenditure)}</b><span>Recorded project cost</span></div>
      <div><small>Still committed</small><b>{money(totals.commitments)}</b><span>{totals.review?`${totals.review} document(s) need review`:"No document review pending"}</span></div>
    </section>
    <section className="project-list-grid">{rows.map((project:any)=>{const summary=project.summary,client=project.client,commercial=project.commercial;const shortfall=Number(summary?.funding_surplus_shortfall??0);const forecast=Number(summary?.forecast_profit??0);const additions=Number(commercial?.additional_scope??0)+Number(commercial?.variations??0);return <article key={project.id} className="project-list-card project-list-card-actions">
      <div className="project-list-top"><div><span className="project-code-pill">{project.project_code}</span><h2>{project.name}</h2><p>{client?.name??"No client"} · {project.location??"Location not set"}</p></div><div className="project-list-position"><small>Current commercial value</small><strong>{money(commercial?.identified_commercial_value)}</strong><span>{Number(project.progress_percent??0).toFixed(0)}% progress</span></div></div>
      <div className="project-list-kpis">{[["Base scope",commercial?.base_scope],["Additional / variations",additions],["Funding",summary?.funding_received],["Expenditure",summary?.confirmed_expenditure]].map(([label,value])=><div key={String(label)}><small>{String(label)}</small><b>{money(value as any)}</b></div>)}</div>
      <div className="project-list-footer project-list-footer-actions"><span>Status: {String(project.status).replaceAll("_"," ")}</span><span className={shortfall<0?"negative":""}>Funding position: {money(shortfall)}</span><span className={forecast<0?"negative":""}>Forecast profit: {money(forecast)}</span><div><Link href={`/projects/${project.id}/overview`} className="project-open-link">Open project →</Link><Link href={`/projects/${project.id}/documents`} className="project-doc-link">Documents {Number(commercial?.documents_needing_review||0)>0?`(${commercial.documents_needing_review})`:""}</Link></div></div>
    </article>})}{rows.length===0&&<article className="compact-card"><b>No projects yet.</b><p style={{marginBottom:0,color:"#718195"}}>Create a project or use Add to let Charismak organise existing records.</p></article>}</section>
  </div></main>;
}
