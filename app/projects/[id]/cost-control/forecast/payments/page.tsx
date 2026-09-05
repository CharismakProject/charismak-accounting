import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../../../lib/supabase/server";
import { buildCommitmentPaymentReview } from "../../../../../../lib/project-cost/commitment-payment-link";
import { isValidCostCode, type CostCode } from "../../../../../../lib/project-cost/cost-codes";
import CommitmentPaymentReviewClient from "./review-client";

export default async function CommitmentPaymentPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,name").eq("id",id).maybeSingle();if(!project)notFound();
  const enabled=process.env.PROJECT_COST_BRIDGE_ENABLED==="true"&&process.env.PROJECT_COST_FORECAST_ENABLED==="true"&&process.env.PROJECT_COST_PAYMENT_LINK_ENABLED==="true";
  if(!enabled)return <Shell id={id} name={project.name}><section className="compact-card" style={{background:"#fff4ce",color:"#775c18"}}><b>Commitment payment linking is separately disabled.</b><p style={{fontSize:10,lineHeight:1.5}}>This screen is ready, but it will not query or write payment-link tables until the reviewed payment-link migration and feature flag are explicitly enabled.</p></section></Shell>;
  const [{data:budget},{data:commitments,error:ce},{data:transactions,error:te},{data:links,error:le}]=await Promise.all([
    supabase.from("project_cost_budgets").select("currency_code").eq("project_id",id).eq("status","approved").maybeSingle(),
    (supabase as any).from("project_cost_commitments").select("id,description,cost_code,committed_amount,paid_amount,status").eq("project_id",id).order("created_at"),
    (supabase as any).from("transactions").select("id,amount,transaction_date,title,description,cost_code").eq("project_id",id).eq("kind","expense").eq("status","posted").order("transaction_date",{ascending:false}),
    (supabase as any).from("project_cost_commitment_payment_links").select("id,transaction_id,commitment_id,allocated_amount,status,created_at").eq("project_id",id).eq("status","active").order("created_at",{ascending:false}),
  ]);
  if(ce||te||le)return <Shell id={id} name={project.name}><section className="compact-card"><b>Payment-link data is unavailable.</b><p style={{fontSize:10,color:"#718391"}}>No partial allocation view is shown.</p></section></Shell>;
  const commitmentRows=(commitments??[]).map((r:any)=>({id:r.id,description:r.description,costCode:r.cost_code as CostCode,committedAmount:Number(r.committed_amount),paidAmount:Number(r.paid_amount),status:r.status}));
  const allocationRows=(links??[]).map((r:any)=>({id:r.id,transactionId:r.transaction_id,commitmentId:r.commitment_id,allocatedAmount:Number(r.allocated_amount),status:r.status as "active"|"void"}));
  const rows=buildCommitmentPaymentReview({transactions:(transactions??[]).map((r:any)=>({transactionId:r.id,amount:Number(r.amount),transactionDate:r.transaction_date,title:r.title,description:r.description,costCode:isValidCostCode(r.cost_code)?r.cost_code:null})),commitments:commitmentRows,allocations:allocationRows});
  const txMap=new Map<string,any>((transactions??[]).map((r:any)=>[String(r.id),r]));const commitmentMap=new Map<string,any>((commitments??[]).map((r:any)=>[String(r.id),r]));
  const activeLinks=(links??[]).map((r:any)=>({id:r.id,transactionId:r.transaction_id,transactionTitle:txMap.get(String(r.transaction_id))?.title??"Money payment",commitmentId:r.commitment_id,commitmentDescription:commitmentMap.get(String(r.commitment_id))?.description??"Commitment",allocatedAmount:Number(r.allocated_amount)}));
  return <Shell id={id} name={project.name}><CommitmentPaymentReviewClient projectId={id} currency={budget?.currency_code||"NGN"} rows={rows} activeLinks={activeLinks}/></Shell>;
}
function Shell({id,name,children}:{id:string;name:string;children:React.ReactNode}){return <main className="page-canvas"><div className="page-wrap" style={{display:"grid",gap:14}}><div className="page-toolbar"><Link href={`/projects/${id}/cost-control/forecast`} className="back-link">← Commitments</Link><span style={{fontSize:9,fontWeight:900,color:"#16825c"}}>{name}</span></div><header className="page-heading compact"><p className="page-eyebrow">Money → Commitment</p><h1>Link confirmed payments</h1><p>Allocate existing posted expenses to commitments without creating another payment or changing Money records.</p></header>{children}</div></main>}
