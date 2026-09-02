"use client";

import { useMemo, useState } from "react";
import type { SectionedBoq } from "../../../lib/estimate/sectioned-boq";
import type { WorkingRateMap } from "../../../lib/estimate/estimate-summary";
import type { ReviewedBoqDecisionMap } from "../../../lib/estimate/review-decision";
import { buildEstimatePrintHtml, buildEstimateSpreadsheetXml, buildEstimateSummary, ZERO_COMMERCIAL_SETTINGS } from "../../../lib/estimate/estimate-summary";
import BoqProjectPreviewClient from "./boq-project-preview-client";

const money=(value:number,currency:string)=>new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);
const num=(value:string)=>{const parsed=Number(value);return Number.isFinite(parsed)&&parsed>=0?Math.min(parsed,100):0;};
const safeName=(value:string)=>value.trim().replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/^-+|-+$/g,"")||"estimate";

export default function BoqEstimateSummaryClient({boq,materializedBoq,workingRates,decisions,companyName}:{boq:SectionedBoq;materializedBoq:SectionedBoq|null;workingRates:WorkingRateMap;decisions:ReviewedBoqDecisionMap;companyName?:string}){
  const [settings,setSettings]=useState({...ZERO_COMMERCIAL_SETTINGS});
  const summary=useMemo(()=>buildEstimateSummary({boq,materializedBoq,workingRates,settings}),[boq,materializedBoq,workingRates,settings]);

  function setPercent(key:keyof typeof settings,value:string){setSettings(current=>({...current,[key]:num(value)}));}
  function openPdf(){
    const html=buildEstimatePrintHtml({boq,summary,companyName,projectName:boq.name});
    const win=window.open("","_blank","noopener,noreferrer");
    if(!win)return alert("Allow pop-ups for Charismak App to open the PDF/print preview.");
    win.document.open();win.document.write(html);win.document.close();win.focus();
    setTimeout(()=>win.print(),250);
  }
  function downloadExcel(){
    const xml=buildEstimateSpreadsheetXml({boq,summary});
    const blob=new Blob(["\ufeff",xml],{type:"application/vnd.ms-excel;charset=utf-8"});
    const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`${safeName(boq.name)}-estimate.xls`;document.body.appendChild(a);a.click();a.remove();URL.revokeObjectURL(url);
  }

  return <section className="data-card" style={{marginTop:14,overflow:"hidden"}}>
    <div style={{padding:17,background:"#082945",color:"#fff",display:"flex",justifyContent:"space-between",gap:16,alignItems:"flex-start",flexWrap:"wrap"}}>
      <div><small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#9ec5df"}}>ESTIMATE SUMMARY V1</small><h2 style={{margin:"5px 0 4px",fontSize:19}}>Turn the reviewed BOQ into a commercial estimate</h2><p style={{margin:0,maxWidth:720,fontSize:11,lineHeight:1.55,color:"#d7e5ef"}}>Direct Cost remains the construction-cost base. Contingency, overhead, profit, discount and tax are shown separately so the client price never becomes the internal project budget by accident.</p></div>
      <div style={{textAlign:"right"}}><small style={{display:"block",fontSize:9,color:"#b7ccda"}}>CLIENT PRICE / GRAND TOTAL</small><strong style={{fontSize:24}}>{money(summary.grandTotal,summary.currency)}</strong><small style={{display:"block",marginTop:3,color:summary.isCommercialTotalComplete?"#8de1bc":"#ffd47d"}}>{summary.isCommercialTotalComplete?"All BOQ items priced":`${summary.unpricedItems} unpriced · total provisional`}</small></div>
    </div>

    <div style={{padding:14,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(145px,1fr))",gap:8,background:"#f7fafc"}}>
      <Metric label="Direct Cost" value={money(summary.directCost,summary.currency)}/><Metric label="Contingency" value={money(summary.contingency,summary.currency)}/><Metric label="Overhead" value={money(summary.overhead,summary.currency)}/><Metric label="Profit" value={money(summary.profit,summary.currency)}/><Metric label="Tax / VAT" value={money(summary.tax,summary.currency)}/><Metric label="Materials Identified" value={String(summary.materials.length)}/>
    </div>

    {!summary.isCommercialTotalComplete&&<div style={{margin:"12px 14px 0",padding:"10px 12px",borderRadius:10,background:"#fff4ce",color:"#775c18",fontSize:10,lineHeight:1.5}}><b>Provisional total:</b> {summary.unpricedItems} BOQ item{summary.unpricedItems===1?" is":"s are"} still missing a working rate. Exports preserve those items as UNPRICED rather than pretending the estimate is complete.</div>}

    <div style={{padding:14,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))",gap:9}}>
      <Percent label="Contingency" value={settings.contingencyPercent} onChange={value=>setPercent("contingencyPercent",value)} note="Applied to Direct Cost"/>
      <Percent label="Overhead" value={settings.overheadPercent} onChange={value=>setPercent("overheadPercent",value)} note="Applied after contingency"/>
      <Percent label="Profit" value={settings.profitPercent} onChange={value=>setPercent("profitPercent",value)} note="Applied after overhead"/>
      <Percent label="Discount" value={settings.discountPercent} onChange={value=>setPercent("discountPercent",value)} note="Deducted before tax"/>
      <Percent label="Tax / VAT" value={settings.taxPercent} onChange={value=>setPercent("taxPercent",value)} note="Applied to taxable subtotal"/>
    </div>

    <div style={{padding:"0 14px 14px",display:"grid",gridTemplateColumns:"minmax(0,1fr) minmax(260px,.7fr)",gap:14}}>
      <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",fontSize:10}}><thead><tr style={{background:"#edf4f8",color:"#657a89",fontSize:8,textTransform:"uppercase"}}><th style={th}>Section</th><th style={{...th,textAlign:"right"}}>Priced Amount</th><th style={{...th,textAlign:"right"}}>Unpriced</th></tr></thead><tbody>{summary.sections.map(section=><tr key={section.sectionId} style={{borderTop:"1px solid #e7edf1"}}><td style={td}>{section.title}</td><td style={{...td,textAlign:"right",fontWeight:900,color:"#173f5a"}}>{money(section.pricedAmount,summary.currency)}</td><td style={{...td,textAlign:"right",color:section.unpricedItems?"#8b6512":"#176247"}}>{section.unpricedItems}</td></tr>)}</tbody></table></div>
      <div style={{background:"#f8fbfd",borderRadius:12,padding:12}}><SummaryRow label="Direct Cost" value={money(summary.directCost,summary.currency)}/><SummaryRow label={`Contingency (${settings.contingencyPercent}%)`} value={money(summary.contingency,summary.currency)}/><SummaryRow label={`Overhead (${settings.overheadPercent}%)`} value={money(summary.overhead,summary.currency)}/><SummaryRow label={`Profit (${settings.profitPercent}%)`} value={money(summary.profit,summary.currency)}/><SummaryRow label={`Discount (${settings.discountPercent}%)`} value={`-${money(summary.discount,summary.currency)}`}/><SummaryRow label="Subtotal before tax" value={money(summary.subtotalBeforeTax,summary.currency)}/><SummaryRow label={`Tax / VAT (${settings.taxPercent}%)`} value={money(summary.tax,summary.currency)}/><div style={{borderTop:"2px solid #173f5a",marginTop:6,paddingTop:8,display:"flex",justifyContent:"space-between",gap:8,fontSize:13,fontWeight:900,color:"#173f5a"}}><span>Grand Total</span><span>{money(summary.grandTotal,summary.currency)}</span></div></div>
    </div>

    <div style={{padding:14,borderTop:"1px solid #e3e9ed",background:"#fbfcfd",display:"flex",gap:8,alignItems:"center",justifyContent:"space-between",flexWrap:"wrap"}}>
      <div style={{fontSize:9,lineHeight:1.45,color:"#6d7f8c",maxWidth:650}}><b>Export snapshot:</b> PDF/Print and Excel include the commercial summary, every BOQ line with its reviewed working rate, and the reviewed material schedule. Exporting does not create a project or post anything to Accounting.</div>
      <div style={{display:"flex",gap:7,flexWrap:"wrap"}}><button type="button" onClick={openPdf} style={secondary}>PDF / Print</button><button type="button" onClick={downloadExcel} style={primary}>Download Excel</button></div>
    </div>

    <div style={{padding:14,borderTop:"1px solid #e3e9ed",background:"#fff"}}><BoqProjectPreviewClient boq={boq} summary={summary} decisions={decisions}/></div>
  </section>;
}

function Metric({label,value}:{label:string;value:string}){return <div style={{background:"#fff",border:"1px solid #dfe8ed",borderRadius:10,padding:10}}><small style={{fontSize:8,color:"#738592",fontWeight:900}}>{label.toUpperCase()}</small><strong style={{display:"block",fontSize:15,color:"#173f5a",marginTop:4}}>{value}</strong></div>}
function Percent({label,value,onChange,note}:{label:string;value:number;onChange:(value:string)=>void;note:string}){return <label style={{display:"block",border:"1px solid #dce5ea",borderRadius:11,padding:10,background:"#fff"}}><span style={{display:"block",fontSize:9,fontWeight:900,color:"#526c7d"}}>{label}</span><div style={{display:"flex",alignItems:"center",gap:5,marginTop:5}}><input type="number" min="0" max="100" step="0.1" value={value} onChange={event=>onChange(event.target.value)} style={{width:80,border:"1px solid #cbd8e0",borderRadius:8,padding:"7px 8px",fontSize:11}}/><b style={{fontSize:11,color:"#718391"}}>%</b></div><small style={{display:"block",fontSize:8,color:"#81909b",marginTop:4}}>{note}</small></label>}
function SummaryRow({label,value}:{label:string;value:string}){return <div style={{display:"flex",justifyContent:"space-between",gap:8,padding:"5px 0",fontSize:10,color:"#5f7484"}}><span>{label}</span><b style={{color:"#28495f"}}>{value}</b></div>}
const th:React.CSSProperties={padding:"8px 9px",textAlign:"left",fontWeight:900};
const td:React.CSSProperties={padding:"8px 9px",verticalAlign:"top",color:"#627786"};
const primary:React.CSSProperties={border:0,borderRadius:9,padding:"9px 12px",background:"#0b668f",color:"#fff",fontSize:9,fontWeight:900,cursor:"pointer"};
const secondary:React.CSSProperties={...primary,background:"#fff",color:"#0b668f",border:"1px solid #9fc3d7"};
