"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { SectionedBoq } from "../../../lib/estimate/sectioned-boq";
import type { EstimateSummary } from "../../../lib/estimate/estimate-summary";
import type { ReviewedBoqDecisionMap } from "../../../lib/estimate/review-decision";
import { buildProjectCreationPreview, serializeProjectCreationPreview, type ContractValueBasis, type InternalBudgetBasis } from "../../../lib/estimate/project-creation-preview";
import { buildStagedProjectWorkspace } from "../../../lib/estimate/staged-project-workspace";
import { saveStagedProjectWorkspace } from "../../../lib/estimate/staged-project-storage";

const money=(value:number|null,currency:string)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);
const numeric=(value:string)=>{if(!value.trim())return null;const parsed=Number(value.replace(/[,₦$€£\s]/g,""));return Number.isFinite(parsed)&&parsed>=0?parsed:null;};
const safeName=(value:string)=>value.trim().replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"project";

export default function BoqProjectPreviewClient({boq,summary,decisions}:{boq:SectionedBoq;summary:EstimateSummary;decisions:ReviewedBoqDecisionMap}){
  const router=useRouter();
  const [open,setOpen]=useState(false);
  const [projectName,setProjectName]=useState(boq.name);
  const [internalBasis,setInternalBasis]=useState<InternalBudgetBasis|null>(null);
  const [contractBasis,setContractBasis]=useState<ContractValueBasis|null>(null);
  const [explicitBudget,setExplicitBudget]=useState("");
  const [explicitContract,setExplicitContract]=useState("");

  const preview=useMemo(()=>buildProjectCreationPreview({boq,summary,decisions,choice:{projectName,internalBudgetBasis:internalBasis,contractValueBasis:contractBasis,explicitInternalBudget:numeric(explicitBudget),explicitContractValue:numeric(explicitContract)}}),[boq,summary,decisions,projectName,internalBasis,contractBasis,explicitBudget,explicitContract]);

  function downloadSnapshot(){if(!preview.readyToStage)return;const blob=new Blob([serializeProjectCreationPreview(preview)],{type:"application/json;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${safeName(projectName)}-project-stage.json`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);}
  function stageWorkspace(){if(!preview.readyToStage)return;try{const workspace=buildStagedProjectWorkspace(preview);saveStagedProjectWorkspace(workspace);router.push(`/projects/draft/${encodeURIComponent(workspace.workspaceId)}`);}catch(error){window.alert(error instanceof Error?error.message:"Could not stage this project workspace.");}}

  return <section style={{marginTop:14,border:"1px solid #cbdde7",borderRadius:14,overflow:"hidden",background:"#fff"}}>
    <div style={{padding:15,display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",background:"#eef5f9"}}><div><small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#0b668f"}}>CREATE PROJECT · REVIEW STAGE</small><h3 style={{margin:"5px 0 3px",fontSize:16,color:"#173f5a"}}>Use this estimate as a project foundation</h3><p style={{margin:0,fontSize:10,lineHeight:1.5,color:"#687d8c",maxWidth:700}}>Nothing is live yet. Choose the contractor cost budget and client contract value separately; client-supplied items stay commercial but are excluded from contractor cost.</p></div><button type="button" onClick={()=>setOpen(value=>!value)} style={open?secondary:primary}>{open?"Close review":"Prepare Project"}</button></div>

    {open&&<div style={{padding:15,display:"grid",gap:13}}>
      <label style={field}><span style={label}>PROJECT NAME</span><input value={projectName} onChange={event=>setProjectName(event.target.value)} style={input}/></label>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))",gap:12}}>
        <div style={choiceCard}><span style={label}>INTERNAL COST BUDGET</span><strong style={choiceTitle}>What should the contractor be allowed to cost?</strong><select value={internalBasis??""} onChange={event=>setInternalBasis((event.target.value||null) as InternalBudgetBasis|null)} style={input}><option value="">Choose explicitly…</option><option value="direct_cost">Contractor Direct Cost · {money(preview.internalDirectCost,summary.currency)}</option><option value="direct_plus_contingency">Contractor Direct + contingency · {money(preview.internalDirectCost+preview.internalContingencyAllowance,summary.currency)}</option><option value="explicit">Enter another reviewed internal budget</option></select>{internalBasis==="explicit"&&<input inputMode="decimal" value={explicitBudget} onChange={event=>setExplicitBudget(event.target.value)} placeholder="Internal budget amount" style={{...input,marginTop:7}}/>}<small style={note}>Client-supplied BOQ value is excluded. Overhead, profit, discount and tax remain commercial terms.</small></div>
        <div style={choiceCard}><span style={label}>CONTRACT VALUE</span><strong style={choiceTitle}>What should the project recognise as client revenue?</strong><select value={contractBasis??""} onChange={event=>setContractBasis((event.target.value||null) as ContractValueBasis|null)} style={input}><option value="">Choose explicitly…</option><option value="grand_total">Grand Total / tax-inclusive · {money(summary.grandTotal,summary.currency)}</option><option value="subtotal_before_tax">Subtotal before tax · {money(summary.subtotalBeforeTax,summary.currency)}</option><option value="explicit">Enter signed/approved contract value</option><option value="none">No contract value yet</option></select>{contractBasis==="explicit"&&<input inputMode="decimal" value={explicitContract} onChange={event=>setExplicitContract(event.target.value)} placeholder="Contract value amount" style={{...input,marginTop:7}}/>}<small style={note}>Use the signed commercial basis that applies. Charismak does not assume whether VAT sits inside or outside the contract sum.</small></div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:8}}><Metric label="Contractor Direct" value={money(preview.internalDirectCost,summary.currency)}/><Metric label="Client-supplied excluded" value={money(preview.clientSuppliedExcludedValue,summary.currency)}/><Metric label="Internal Budget" value={money(preview.project.internalCostBudget,summary.currency)}/><Metric label="Contract Value" value={money(preview.project.contractValue,summary.currency)}/><Metric label="Forecast Profit" value={money(preview.forecastProfit,summary.currency)}/><Metric label="Budget Lines" value={String(preview.budgetLines.length)}/></div>

      {preview.budgetAllowances.length>0&&<div style={{border:"1px solid #dce6ec",borderRadius:10,padding:10}}><span style={label}>REVIEWED BUDGET ALLOWANCES</span>{preview.budgetAllowances.map(allowance=><div key={allowance.sourceAllowanceId} style={{display:"flex",justifyContent:"space-between",gap:10,paddingTop:7,fontSize:10,color:"#5e7484"}}><span>{allowance.description}</span><b style={{color:"#173f5a"}}>{money(allowance.amount,summary.currency)}</b></div>)}</div>}

      {preview.issues.length>0?<div style={{background:"#fff4ce",borderRadius:10,padding:11,color:"#775c18",fontSize:10,lineHeight:1.55}}><b>Before this can be staged:</b><ul style={{margin:"5px 0 0",paddingLeft:18}}>{preview.issues.slice(0,12).map(issue=><li key={issue}>{issue}</li>)}{preview.issues.length>12&&<li>+ {preview.issues.length-12} more review issues</li>}</ul></div>:<div style={{background:"#e7f6ef",borderRadius:10,padding:11,color:"#176247",fontSize:10,lineHeight:1.5}}><b>Ready for Project.</b> Reviewed BOQ cost codes, contractor budget, allowances and materials can now become a local Draft Workspace. Money remains unlinked.</div>}

      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap",borderTop:"1px solid #e5ecef",paddingTop:12}}><small style={{fontSize:9,lineHeight:1.45,color:"#718391",maxWidth:650}}>Staging saves a reviewed draft on this browser and shows it inside Projects. It does not insert a database project, apply a migration or post to Money/Accounting.</small><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" disabled={!preview.readyToStage} onClick={downloadSnapshot} style={{...secondary,opacity:preview.readyToStage?1:.45}}>Download review JSON</button><button type="button" disabled={!preview.readyToStage} onClick={stageWorkspace} style={{...primary,opacity:preview.readyToStage?1:.45}}>Stage Project Workspace</button></div></div>
    </div>}
  </section>;
}

function Metric({label,value}:{label:string;value:string}){return <div style={{border:"1px solid #dfe8ed",borderRadius:10,padding:10,background:"#f9fbfc"}}><span style={labelStyle}>{label.toUpperCase()}</span><b style={{display:"block",fontSize:14,color:"#173f5a",marginTop:4}}>{value}</b></div>}
const field:React.CSSProperties={display:"grid",gap:5};
const label:React.CSSProperties={fontSize:8,fontWeight:900,letterSpacing:".08em",color:"#6a7e8c"};
const labelStyle=label;
const input:React.CSSProperties={width:"100%",border:"1px solid #cbd8e0",borderRadius:9,padding:"9px 10px",fontSize:11,background:"#fff",color:"#28495f",boxSizing:"border-box"};
const choiceCard:React.CSSProperties={border:"1px solid #dce6ec",borderRadius:12,padding:12,background:"#fbfcfd"};
const choiceTitle:React.CSSProperties={display:"block",fontSize:12,color:"#173f5a",margin:"5px 0 8px"};
const note:React.CSSProperties={display:"block",fontSize:8,lineHeight:1.45,color:"#7b8c98",marginTop:6};
const primary:React.CSSProperties={border:0,borderRadius:9,padding:"9px 12px",background:"#0b668f",color:"#fff",fontSize:9,fontWeight:900,cursor:"pointer"};
const secondary:React.CSSProperties={...primary,background:"#fff",color:"#0b668f",border:"1px solid #9fc3d7"};
