import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "../../../lib/supabase/server";

const money=(v:any)=>new Intl.NumberFormat("en-NG",{style:"currency",currency:"NGN",maximumFractionDigits:0}).format(Number(v||0));

export default async function ProjectWorkspaceLayout({children,params}:{children:React.ReactNode;params:Promise<{id:string}>}){
  const {id}=await params;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const [{data:project},{data:commercial},{data:summary}]=await Promise.all([
    supabase.from("projects").select("id,project_code,name").eq("id",id).maybeSingle(),
    supabase.from("project_commercial_positions").select("base_scope,additional_scope,variations,identified_commercial_value,documented_client_invoices,approved_commercial_value,documents_needing_review").eq("project_id",id).maybeSingle(),
    supabase.from("project_financial_summaries").select("funding_received,confirmed_expenditure,outstanding_commitments").eq("project_id",id).maybeSingle(),
  ]);
  const additions=Number(commercial?.additional_scope||0)+Number(commercial?.variations||0);
  return <>
    <div className="project-workspace-nav">
      <div><small>{project?.project_code||"PROJECT"}</small><b>{project?.name||"Project workspace"}</b></div>
      <nav><Link href={`/projects/${id}`}>Overview</Link><Link href={`/projects/${id}/documents`}>Documents</Link><Link href={`/projects/${id}/progress`}>Progress</Link><Link href="/projects">All projects</Link></nav>
    </div>
    <section className="project-commercial-banner">
      <div className="commercial-main"><small>CURRENT IDENTIFIED COMMERCIAL VALUE</small><strong>{money(commercial?.identified_commercial_value)}</strong><span>Base scope + additional work + variations found in confirmed project documents.</span></div>
      <div className="commercial-breakdown">
        <div><small>Base scope</small><b>{money(commercial?.base_scope)}</b></div>
        <div><small>Additional / variations</small><b>{money(additions)}</b></div>
        <div><small>Client invoices</small><b>{money(commercial?.documented_client_invoices)}</b></div>
        <div><small>Funding received</small><b>{money(summary?.funding_received)}</b></div>
        <div><small>Confirmed spend</small><b>{money(summary?.confirmed_expenditure)}</b></div>
        <div><small>Still committed</small><b>{money(summary?.outstanding_commitments)}</b></div>
      </div>
      {Number(commercial?.documents_needing_review||0)>0&&<Link className="commercial-review" href={`/projects/${id}/documents`}>{commercial?.documents_needing_review} document{Number(commercial?.documents_needing_review)===1?"":"s"} need review →</Link>}
    </section>
    {children}
  </>;
}
