import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { recordProgress } from "./actions";

const money=(v:number|string|null|undefined)=>v==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v));

export default async function ProjectProgressPage({params,searchParams}:{params:Promise<{id:string}>;searchParams:Promise<{saved?:string}>}){
  const {id}=await params; const query=await searchParams; const supabase=await createClient();
  const {data:authData}=await supabase.auth.getUser(); if(!authData.user)redirect("/login");
  const {data:project,error}=await supabase.from("projects").select("id,project_code,name,location,progress_percent,status,summary:project_financial_summaries(forecast_cost_to_complete,forecast_final_cost,confirmed_expenditure,revised_budget)").eq("id",id).single();
  if(error||!project)notFound();
  const {data:updates}=await supabase.from("project_progress_updates").select("id,progress_percent,work_summary,cost_to_complete_override,update_date,created_at").eq("project_id",id).order("created_at",{ascending:false}).limit(20);
  const summary:any=Array.isArray((project as any).summary)?(project as any).summary[0]:(project as any).summary;
  return <main className="page-canvas"><div className="page-wrap" style={{maxWidth:820}}>
    <div className="page-toolbar"><Link href={`/projects/${id}`} className="back-link">← Project</Link><Link href="/" className="secondary-link">Dashboard</Link></div>
    <header className="page-heading compact"><p className="page-eyebrow">Site & project control</p><h1>{project.name}</h1><p>{project.project_code} · {project.location||"Location not set"} · record progress without changing commercial baseline data.</p></header>
    {query.saved&&<div className="notice notice-green" style={{marginBottom:12}}><b>Progress saved.</b> The update is recorded in the audit trail.</div>}
    <section className="role-kpis" style={{marginBottom:10}}><article className="role-kpi"><span>Current progress</span><strong>{Number(project.progress_percent||0).toFixed(0)}%</strong><small>{project.status}</small></article><article className="role-kpi"><span>Confirmed expenditure</span><strong>{money(summary?.confirmed_expenditure)}</strong><small>Posted project cost</small></article><article className="role-kpi"><span>Forecast cost to complete</span><strong>{money(summary?.forecast_cost_to_complete)}</strong><small>Can be revised with progress</small></article><article className="role-kpi"><span>Forecast final cost</span><strong>{money(summary?.forecast_final_cost)}</strong><small>Actual + forecast remaining</small></article></section>
    <section className="access-layout"><article className="data-card"><div className="section-title"><small>Progress history</small><h2>Recent Site Updates</h2></div>{(updates??[]).length?(updates??[]).map((u:any)=><div className="role-data-line" key={u.id}><div><b>{u.progress_percent}% · {u.work_summary||"Progress update"}</b><small>{u.update_date}</small></div><strong>{u.cost_to_complete_override==null?"—":money(u.cost_to_complete_override)}</strong></div>):<p className="empty-state">No progress update has been recorded yet.</p>}</article>
    <aside className="data-card"><div className="section-title"><small>New update</small><h2>Record Site Progress</h2><p>Use cost-to-complete only when you have a meaningful updated forecast. Leave blank otherwise.</p></div><form action={recordProgress} className="access-form-stack"><input type="hidden" name="project_id" value={id}/><label>Progress %<input name="progress_percent" type="number" min="0" max="100" step="0.1" required defaultValue={project.progress_percent??0}/></label><label>Work summary<textarea name="work_summary" rows={4} placeholder="What has been completed / current site status" required/></label><label>Updated cost to complete<input name="cost_to_complete" type="number" step="0.01" min="0" placeholder="Optional" defaultValue={summary?.forecast_cost_to_complete||""}/></label><button type="submit">Save Progress Update</button></form></aside></section>
  </div></main>;
}
