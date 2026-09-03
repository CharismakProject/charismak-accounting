import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../../lib/supabase/server";
import CommitmentForecastReviewClient from "./review-client";

export default async function CommitmentForecastReviewPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,name").eq("id",id).maybeSingle();if(!project)notFound();
  const enabled=process.env.PROJECT_COST_BRIDGE_ENABLED==="true";
  if(!enabled)return <Shell id={id} name={project.name}><section className="compact-card" style={{background:"#fff4ce",color:"#775c18"}}><small style={{fontSize:8,fontWeight:900,letterSpacing:".1em"}}>COMMITMENTS + COST TO COMPLETE</small><h2 style={{fontSize:16,margin:"5px 0"}}>Review layer ready; bridge still disabled</h2><p style={{fontSize:10,lineHeight:1.55,margin:0}}>The App has the commitment and forecast workflow, but production does not yet contain the reviewed project-cost tables. Nothing is written until that migration is explicitly approved.</p></section></Shell>;

  const [{data:budget},{data:commitments,error:commitmentError},{data:forecast,error:forecastError}]=await Promise.all([
    supabase.from("project_cost_budgets").select("currency_code").eq("project_id",id).eq("status","approved").maybeSingle(),
    (supabase as any).from("project_cost_commitments").select("id,project_id,description,cost_code,committed_amount,paid_amount,status,due_date,note").eq("project_id",id).order("created_at"),
    (supabase as any).from("project_cost_forecasts").select("id,reviewed_at").eq("project_id",id).eq("status","approved").maybeSingle(),
  ]);
  if(commitmentError||forecastError)return <Shell id={id} name={project.name}><section className="compact-card"><b>Commitment / forecast data is unavailable.</b><p style={{color:"#718391",fontSize:10}}>No partial forecast is shown.</p></section></Shell>;
  let forecastLines:any[]=[];if(forecast?.id){const {data,error}=await (supabase as any).from("project_cost_forecast_lines").select("cost_code,forecast_cost_to_complete,note").eq("forecast_id",forecast.id);if(error)return <Shell id={id} name={project.name}><section className="compact-card"><b>Approved forecast lines could not be read.</b></section></Shell>;forecastLines=data??[];}
  return <Shell id={id} name={project.name}><CommitmentForecastReviewClient projectId={id} currency={budget?.currency_code||"NGN"} initialCommitments={(commitments??[]).map((r:any)=>({id:r.id,projectId:r.project_id,description:r.description,costCode:r.cost_code,committedAmount:Number(r.committed_amount),paidAmount:Number(r.paid_amount),status:r.status,dueDate:r.due_date,note:r.note}))} initialForecastLines={forecastLines.map((r:any)=>({costCode:r.cost_code,amount:Number(r.forecast_cost_to_complete),note:r.note}))} initialReviewedAt={forecast?.reviewed_at??null}/></Shell>;
}
function Shell({id,name,children}:{id:string;name:string;children:React.ReactNode}){return <main className="page-canvas"><div className="page-wrap" style={{display:"grid",gap:14}}><div className="page-toolbar"><Link href={`/projects/${id}/cost-control`} className="back-link">← Budget vs Actual</Link><span style={{fontSize:9,fontWeight:900,color:"#16825c"}}>{name}</span></div><header className="page-heading compact"><p className="page-eyebrow">Cost Control</p><h1>Commitments + Cost to Complete</h1><p>Track agreed unpaid cost separately from reviewed future cost, then forecast without double counting.</p></header>{children}</div></main>}
