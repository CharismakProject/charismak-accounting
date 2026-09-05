import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../../lib/supabase/server";
import { buildTransactionCostReviewRows } from "../../../../../lib/project-cost/transaction-cost-review";
import TransactionCostReviewClient from "./review-client";

export default async function TransactionCostClassificationPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,name").eq("id",id).maybeSingle();if(!project)notFound();
  const enabled=process.env.PROJECT_COST_BRIDGE_ENABLED==="true";
  if(!enabled)return <Shell id={id} name={project.name}><section className="compact-card" style={{background:"#fff4ce",color:"#775c18"}}><b>Actual Cost Classification is not activated yet.</b><p style={copy}>The reviewed project-cost migration remains disabled, so existing Money transactions cannot be given cost codes from this screen.</p></section></Shell>;
  const [{data:budget,error:budgetError},{data:transactions,error:txError}]=await Promise.all([
    supabase.from("project_cost_budgets").select("id,currency_code").eq("project_id",id).eq("status","approved").maybeSingle(),
    supabase.from("transactions").select("id,amount,transaction_date,title,description,cost_code").eq("project_id",id).eq("kind","expense").eq("status","posted").is("cost_code",null).order("transaction_date",{ascending:false}).limit(500),
  ]);
  if(budgetError||!budget)return <Shell id={id} name={project.name}><section className="compact-card"><b>Approved Budget Baseline required.</b><p style={copy}>Cost-code review becomes available after this project has an approved internal Budget Baseline.</p></section></Shell>;
  if(txError)return <Shell id={id} name={project.name}><section className="compact-card"><b>Could not read the complete unclassified expense set.</b><p style={copy}>Nothing was guessed or partially updated.</p></section></Shell>;
  const rows=buildTransactionCostReviewRows((transactions??[]).map((row:any)=>({transactionId:row.id,amount:Number(row.amount),transactionDate:row.transaction_date,title:row.title,description:row.description})));
  return <Shell id={id} name={project.name}><header style={{background:"#082945",borderRadius:18,padding:18,color:"#fff"}}><small style={{fontSize:8,fontWeight:900,letterSpacing:".12em",color:"#9ec5df"}}>ACTUAL COST CLASSIFICATION</small><h1 style={{margin:"6px 0 3px",fontSize:24}}>Review Money → Cost Codes</h1><p style={{margin:0,fontSize:10,color:"#d7e5ef",maxWidth:780}}>Charismak can suggest a construction cost group from the transaction wording, but only your confirmed choices change Actual Cost classification. Generic or ambiguous spend stays unclassified.</p></header><TransactionCostReviewClient projectId={id} currency={budget.currency_code||"NGN"} rows={rows}/></Shell>;
}
function Shell({id,name,children}:{id:string;name:string;children:React.ReactNode}){return <main className="page-canvas"><div className="page-wrap" style={{display:"grid",gap:14}}><div className="page-toolbar"><Link href={`/projects/${id}/cost-control`} className="back-link">← Budget vs Actual</Link><span style={{fontSize:9,fontWeight:900,color:"#16825c"}}>{name}</span></div>{children}</div></main>}
const copy:React.CSSProperties={fontSize:10,lineHeight:1.55,color:"#718391",margin:"5px 0 0"};
