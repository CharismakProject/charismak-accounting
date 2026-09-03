import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "../../../../lib/supabase/server";
import { buildProjectCostControl } from "../../../../lib/project-cost/project-cost-control";
import type { CostCode } from "../../../../lib/project-cost/cost-codes";

const money=(value:number|null|undefined,currency="NGN")=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);
const percent=(value:number|null)=>value==null?"—":`${value.toLocaleString("en-NG",{maximumFractionDigits:1})}%`;
const label=(value:string)=>value.replaceAll("_"," ").replace(/\b\w/g,c=>c.toUpperCase());

export default async function ProjectCostControlPage({params}:{params:Promise<{id:string}>}){
  const {id}=await params;const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();if(!user)redirect("/login");
  const {data:project}=await supabase.from("projects").select("id,name,location,status,contract_value").eq("id",id).maybeSingle();if(!project)notFound();
  const enabled=process.env.PROJECT_COST_BRIDGE_ENABLED==="true";
  if(!enabled)return <Shell id={id} name={project.name}><section className="compact-card" style={{background:"#fff4ce",color:"#775c18"}}><small style={eye}>BUDGET VS ACTUAL</small><h2 style={title}>Project-cost bridge not activated yet</h2><p style={copy}>The Cost Control screen is ready, but the reviewed project-cost migration is deliberately disabled. No partial budget or guessed actual-by-trade position will be shown. The existing Money records remain untouched.</p></section></Shell>;

  const {data:budget,error:budgetError}=await supabase.from("project_cost_budgets").select("id,currency_code,direct_cost,allowance_total,internal_cost_budget,contract_value_snapshot,budget_version,status").eq("project_id",id).eq("status","approved").maybeSingle();
  if(budgetError)return <Shell id={id} name={project.name}><Unavailable text="The approved Budget Baseline is not available to this account. The bridge may still be pending migration or your role may not permit internal-cost visibility."/></Shell>;
  if(!budget)return <Shell id={id} name={project.name}><Unavailable text="This live project does not have an approved Budget Baseline yet."/></Shell>;

  const [{data:lines,error:lineError},{data:allowances,error:allowanceError},{data:transactions,error:txError}]=await Promise.all([
    supabase.from("project_cost_budget_lines").select("cost_code,amount").eq("budget_id",budget.id),
    supabase.from("project_cost_budget_allowances").select("kind,amount").eq("budget_id",budget.id),
    supabase.from("transactions").select("id,amount,cost_code").eq("project_id",id).eq("kind","expense").eq("status","posted"),
  ]);
  if(lineError||allowanceError||txError)return <Shell id={id} name={project.name}><Unavailable text="Cost Control could not read the complete approved budget and posted expense set. Nothing was estimated from partial data."/></Shell>;

  const control=buildProjectCostControl({
    budgets:(lines??[]).map((row:any)=>({costCode:row.cost_code as CostCode,amount:Number(row.amount)})),
    allowances:(allowances??[]).map((row:any)=>({kind:row.kind as "contingency"|"other",amount:Number(row.amount)})),
    actuals:(transactions??[]).map((row:any)=>({transactionId:row.id,costCode:row.cost_code??null,amount:Number(row.amount)})),
    commitments:null,
    contractValue:project.contract_value==null?budget.contract_value_snapshot==null?null:Number(budget.contract_value_snapshot):Number(project.contract_value),
    forecastCostToComplete:null,
  });
  const c=budget.currency_code||"NGN";const visible=control.position.byCostCode.filter(row=>row.budget>0||row.actual>0||row.committed>0);
  return <Shell id={id} name={project.name}>
    <header style={{background:"#082945",borderRadius:18,padding:18,color:"#fff"}}><small style={{fontSize:8,fontWeight:900,letterSpacing:".12em",color:"#9ec5df"}}>PROJECT COST CONTROL</small><h1 style={{margin:"6px 0 3px",fontSize:24}}>Budget vs Actual</h1><p style={{margin:0,fontSize:10,color:"#d7e5ef"}}>Approved Budget Baseline compared only with posted project expenses. Income and transfers are excluded from Actual Cost.</p><div style={heroGrid}><Hero label="Internal Budget" value={money(control.position.internalCostBudget,c)}/><Hero label="Actual Spend" value={money(control.position.actual,c)}/><Hero label="Remaining Budget" value={money(control.position.remainingBudget,c)}/><Hero label="Cost Health" value={label(control.health)}/></div></header>
    <section style={metricGrid}><Metric label="Classified Actual" value={money(control.position.classifiedActual,c)}/><Metric label="Unclassified Actual" value={money(control.position.unclassifiedActual,c)}/><Metric label="Unpaid Commitments" value={control.commitmentsStatus==="connected"?money(control.position.unpaidCommitment,c):"—"}/><Metric label="Forecast Final Cost" value={money(control.forecastFinalCost,c)}/><Metric label="Expected Profit at Budget" value={money(control.expectedProfitAtBudget,c)}/><Metric label="Forecast Profit" value={money(control.forecastProfit,c)}/></section>
    {control.warnings.length>0&&<section style={{background:"#fff4ce",borderRadius:12,padding:12,color:"#775c18",fontSize:10,lineHeight:1.5}}><b>Cost-control attention</b><ul style={{margin:"5px 0 0",paddingLeft:18}}>{control.warnings.map(w=><li key={w}>{w}</li>)}</ul></section>}
    <section className="compact-card"><small style={eye}>COST CODE POSITION</small><h2 style={title}>Approved budget compared with confirmed actual spend</h2><div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}><thead><tr><Th>Code</Th><Th>Cost group</Th><Th right>Budget</Th><Th right>Actual</Th><Th right>Exposure</Th><Th right>Remaining</Th><Th right>Consumed</Th><Th>Status</Th></tr></thead><tbody>{visible.map(row=><tr key={row.costCode} style={{borderTop:"1px solid #e5ecef"}}><Td>{row.costCode}</Td><Td>{row.name}</Td><Td right>{money(row.budget,c)}</Td><Td right>{money(row.actual,c)}</Td><Td right>{money(row.exposure,c)}</Td><Td right>{money(row.remainingBeforeUncommittedSpend,c)}</Td><Td right>{percent(row.budgetConsumedPercent)}</Td><Td>{label(row.status)}</Td></tr>)}</tbody></table></div>{visible.length===0&&<p style={copy}>No budget or actual cost-code rows are available.</p>}</section>
    {control.position.unclassifiedTransactionIds.length>0&&<section className="compact-card"><small style={eye}>NEEDS CLASSIFICATION</small><h2 style={title}>{control.position.unclassifiedTransactionIds.length} expense transaction{control.position.unclassifiedTransactionIds.length===1?"":"s"} are outside the trade comparison</h2><p style={copy}>These expenses still count in total Actual Spend and Remaining Budget, but Charismak does not force them into a cost code. The next review layer will let an authorised user confirm the appropriate cost code.</p></section>}
    <section className="compact-card"><small style={eye}>FORECAST DISCIPLINE</small><h2 style={title}>Forecast remains “—” until a reviewed cost-to-complete exists</h2><p style={copy}>Remaining Budget is not automatically treated as Forecast Cost to Complete. That avoids presenting a circular or optimistic profit forecast as fact.</p></section>
  </Shell>;
}

function Shell({id,name,children}:{id:string;name:string;children:React.ReactNode}){return <main className="page-canvas"><div className="page-wrap" style={{display:"grid",gap:14}}><div className="page-toolbar"><Link href={`/projects/${id}/overview`} className="back-link">← {name}</Link><Link href="/projects" className="secondary-link">Projects</Link></div>{children}</div></main>}
function Unavailable({text}:{text:string}){return <section className="compact-card"><small style={eye}>BUDGET VS ACTUAL</small><h2 style={title}>Cost Control unavailable</h2><p style={copy}>{text}</p></section>}
function Hero({label,value}:{label:string;value:string}){return <div style={{border:"1px solid rgba(255,255,255,.22)",borderRadius:10,padding:9}}><small style={{fontSize:7,color:"#b9d4e5"}}>{label.toUpperCase()}</small><b style={{display:"block",fontSize:14,marginTop:3}}>{value}</b></div>}
function Metric({label,value}:{label:string;value:string}){return <div style={{border:"1px solid #dce6ec",borderRadius:11,padding:11,background:"#fff"}}><small style={{fontSize:7,color:"#718391"}}>{label.toUpperCase()}</small><b style={{display:"block",fontSize:13,color:"#173f5a",marginTop:3}}>{value}</b></div>}
function Th({children,right=false}:{children:React.ReactNode;right?:boolean}){return <th style={{textAlign:right?"right":"left",padding:"7px 6px",color:"#6d7f8c",fontSize:8}}>{children}</th>}
function Td({children,right=false}:{children:React.ReactNode;right?:boolean}){return <td style={{textAlign:right?"right":"left",padding:"9px 6px",color:"#35566b",whiteSpace:right?"nowrap":"normal"}}>{children}</td>}
const eye:React.CSSProperties={fontSize:8,fontWeight:900,letterSpacing:".1em",color:"#0b668f"};const title:React.CSSProperties={fontSize:15,color:"#173f5a",margin:"5px 0 8px"};const copy:React.CSSProperties={fontSize:10,lineHeight:1.55,color:"#718391",margin:0};const heroGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginTop:14};const metricGrid:React.CSSProperties={display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(165px,1fr))",gap:8};
