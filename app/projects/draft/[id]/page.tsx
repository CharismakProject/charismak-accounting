"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { getStagedProjectWorkspace } from "../../../../lib/estimate/staged-project-storage";
import type { StagedProjectWorkspace } from "../../../../lib/estimate/staged-project-workspace";
import ApprovalClient from "./approval-client";

const money=(value:number|null,currency:string)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);
const qty=(n:number)=>n.toLocaleString("en-NG",{maximumFractionDigits:3});

export default function DraftProjectWorkspacePage(){
  const params=useParams<{id:string}>();const [draft,setDraft]=useState<StagedProjectWorkspace|null|undefined>(undefined);
  useEffect(()=>{const raw=Array.isArray(params.id)?params.id[0]:params.id;setDraft(getStagedProjectWorkspace(decodeURIComponent(raw||"")));},[params.id]);
  if(draft===undefined)return <main className="page-canvas"><div className="page-wrap"><p>Loading draft workspace…</p></div></main>;
  if(!draft)return <main className="page-canvas"><div className="page-wrap"><Link href="/projects" className="back-link">← Projects</Link><div className="compact-card" style={{marginTop:16}}><b>Draft workspace not found.</b><p style={{marginBottom:0,color:"#718195"}}>This local draft may have been created on another browser or device.</p></div></div></main>;
  const c=draft.project.currency;
  return <main className="page-canvas"><div className="page-wrap" style={{display:"grid",gap:14}}>
    <div className="page-toolbar"><Link href="/projects" className="back-link">← Projects</Link><span style={{fontSize:9,fontWeight:900,color:"#16825c"}}>REVIEWED DRAFT · NOT LIVE</span></div>
    <header style={{background:"#082945",borderRadius:18,padding:18,color:"#fff"}}><small style={{fontSize:8,fontWeight:900,letterSpacing:".12em",color:"#9ec5df"}}>PROJECT WORKSPACE</small><h1 style={{margin:"6px 0 3px",fontSize:24}}>{draft.project.name}</h1><p style={{margin:0,fontSize:10,color:"#d7e5ef"}}>Estimate → reviewed Budget Baseline → Project. Money/Accounting is not linked yet.</p><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:8,marginTop:14}}><Hero label="Internal Budget" value={money(draft.project.internalCostBudget,c)}/><Hero label="Contract Value" value={money(draft.project.contractValue,c)}/><Hero label="Forecast Profit" value={money(draft.forecastProfit,c)}/><Hero label="Cost Groups" value={String(draft.costGroups.length)}/></div></header>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:8}}><Metric label="Contractor Direct Cost" value={money(draft.internalDirectCost,c)}/><Metric label="Budget Allowances" value={money(draft.budgetBaseline.allowanceTotal,c)}/><Metric label="Client-supplied excluded" value={money(draft.clientSuppliedExcludedValue,c)}/><Metric label="Baseline reconciliation" value={money(draft.budgetBaseline.reconciliationDifference,c)}/></section>

    <ApprovalClient draft={draft}/>

    <section className="compact-card"><small style={eye}>BUDGET BASELINE BY COST GROUP</small><h2 style={title}>Expected project cost before actual spending starts</h2>{draft.costGroups.length?draft.costGroups.map(group=><div key={group.costCode} style={row}><span><b>{group.costCode} · {group.name}</b><small style={sub}>{group.lineCount} BOQ line{group.lineCount===1?"":"s"}</small></span><strong>{money(group.amount,c)}</strong></div>):<p style={{color:"#718195"}}>No cost groups available.</p>}{draft.budgetAllowances.map(allowance=><div key={allowance.sourceAllowanceId} style={row}><span><b>Allowance · {allowance.description}</b><small style={sub}>Separate from trade cost groups</small></span><strong>{money(allowance.amount,c)}</strong></div>)}</section>

    <section className="compact-card"><small style={eye}>MATERIAL SCHEDULE</small><h2 style={title}>{draft.materials.length} reviewed material total{draft.materials.length===1?"":"s"}</h2>{draft.materials.slice(0,40).map(item=><div key={item.key} style={row}><span><b>{item.material}</b><small style={sub}>{item.sources.length} BOQ source item{item.sources.length===1?"":"s"}</small></span><strong>{qty(item.quantity)} {item.unit}</strong></div>)}{draft.materials.length===0&&<p style={{color:"#718195"}}>No contractor material totals were generated for this estimate.</p>}</section>

    <section style={{background:"#fff4ce",borderRadius:13,padding:13,color:"#775c18"}}><small style={{fontSize:8,fontWeight:900,letterSpacing:".1em"}}>MONEY / ACCOUNTING</small><h2 style={{fontSize:15,margin:"5px 0"}}>Not linked yet</h2><p style={{fontSize:10,lineHeight:1.5,margin:0}}>{draft.moneyConnection.note} Confirmed spend and commitments therefore remain “—”, not zero.</p></section>
  </div></main>;
}
function Hero({label,value}:{label:string;value:string}){return <div style={{border:"1px solid rgba(255,255,255,.22)",borderRadius:10,padding:9}}><small style={{fontSize:7,color:"#b9d4e5"}}>{label.toUpperCase()}</small><b style={{display:"block",fontSize:14,marginTop:3}}>{value}</b></div>}
function Metric({label,value}:{label:string;value:string}){return <div style={{border:"1px solid #dce6ec",borderRadius:11,padding:11,background:"#fff"}}><small style={{fontSize:7,color:"#718391"}}>{label.toUpperCase()}</small><b style={{display:"block",fontSize:13,color:"#173f5a",marginTop:3}}>{value}</b></div>}
const eye:React.CSSProperties={fontSize:8,fontWeight:900,letterSpacing:".1em",color:"#0b668f"};
const title:React.CSSProperties={fontSize:15,color:"#173f5a",margin:"5px 0 8px"};
const row:React.CSSProperties={display:"flex",justifyContent:"space-between",alignItems:"center",gap:12,borderTop:"1px solid #e5ecef",padding:"9px 0",fontSize:10,color:"#35566b"};
const sub:React.CSSProperties={display:"block",fontSize:8,fontWeight:400,color:"#7a8b97",marginTop:2};
