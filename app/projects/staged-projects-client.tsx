"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { loadStagedProjectWorkspaces } from "../../lib/estimate/staged-project-storage";
import type { StagedProjectWorkspace } from "../../lib/estimate/staged-project-workspace";

const money=(value:number|null,currency:string)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);

export default function StagedProjectsClient(){
  const [drafts,setDrafts]=useState<StagedProjectWorkspace[]>([]);
  useEffect(()=>{setDrafts(loadStagedProjectWorkspaces());},[]);
  if(!drafts.length)return null;
  return <section style={{margin:"0 0 18px",display:"grid",gap:9}}><div><small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#0b668f"}}>FROM ESTIMATE · LOCAL DRAFTS</small><h2 style={{fontSize:17,margin:"5px 0 2px",color:"#173f5a"}}>Project Workspaces ready for review</h2><p style={{fontSize:10,color:"#718391",margin:0}}>These are reviewed budget foundations stored on this browser. They are not live Accounting projects yet.</p></div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))",gap:10}}>{drafts.map(draft=><article key={draft.workspaceId} style={{border:"1px solid #cbdde7",borderRadius:14,padding:13,background:"#f8fbfd"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"flex-start"}}><div><span style={{fontSize:8,fontWeight:900,color:"#16825c"}}>REVIEWED DRAFT</span><h3 style={{fontSize:15,margin:"4px 0 2px",color:"#173f5a"}}>{draft.project.name}</h3><p style={{fontSize:9,color:"#718391",margin:0}}>{draft.costGroups.length} cost groups · {draft.materials.length} material totals</p></div><strong style={{fontSize:13,color:"#173f5a"}}>{money(draft.project.internalCostBudget,draft.project.currency)}</strong></div><div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:6,marginTop:11}}><Mini label="Contract" value={money(draft.project.contractValue,draft.project.currency)}/><Mini label="Forecast" value={money(draft.forecastProfit,draft.project.currency)}/><Mini label="Money" value="Not linked"/></div><Link href={`/projects/draft/${encodeURIComponent(draft.workspaceId)}`} style={{display:"inline-block",marginTop:11,fontSize:9,fontWeight:900,color:"#0b668f"}}>Open draft workspace →</Link></article>)}</div></section>;
}
function Mini({label,value}:{label:string;value:string}){return <div style={{border:"1px solid #dce6ec",borderRadius:8,padding:7,background:"#fff"}}><small style={{fontSize:7,color:"#7a8b97"}}>{label.toUpperCase()}</small><b style={{display:"block",fontSize:9,color:"#28495f",marginTop:2}}>{value}</b></div>}
