"use client";

import { useEffect, useMemo, useState } from "react";
import type { SectionedBoq } from "../../../lib/estimate/sectioned-boq";
import type { WorkingRateMap } from "../../../lib/estimate/estimate-summary";
import { priceBoqLine, reviewBoqRate } from "../../../lib/estimate/rate-engine";

type Draft = { value: string; source: "imported" | "manual" };

const money=(value:number|null|undefined,currency:string)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);
const number=(value:string)=>{const cleaned=value.replace(/[,₦$€£\s]/g,"");if(!cleaned.trim())return null;const parsed=Number(cleaned);return Number.isFinite(parsed)&&parsed>=0?parsed:null;};
const roundRate=(value:number)=>Math.round((value+Number.EPSILON)*10000)/10000;

export default function BoqRateClient({boq,onRatesChange}:{boq:SectionedBoq;onRatesChange?:(rates:WorkingRateMap)=>void}){
  const items=useMemo(()=>boq.sections.flatMap(section=>section.items.map(item=>({section,item}))),[boq]);
  const [drafts,setDrafts]=useState<Record<string,Draft>>(()=>Object.fromEntries(items.map(({item})=>[item.id,{value:item.rate==null?"":String(item.rate),source:item.rate==null?"manual":"imported"}])));
  const [showOnlyUnpriced,setShowOnlyUnpriced]=useState(false);

  const priced=useMemo(()=>items.map(({section,item})=>{
    const draft=drafts[item.id]??{value:"",source:"manual" as const};
    const selectedRate=number(draft.value);
    const review=reviewBoqRate({importedRate:item.rate??null,reference:null,selectedRate:draft.source==="manual"?selectedRate:null,selectedSource:draft.source==="manual"?"manual":null});
    const amount=priceBoqLine(item.quantity,review);
    const sourceAmount=item.amount!=null&&Number.isFinite(item.amount)?item.amount:null;
    const sourceMismatch=draft.source==="imported"&&amount!=null&&sourceAmount!=null&&Math.abs(amount-sourceAmount)>.05;
    return {section,item,draft,review,amount,sourceAmount,sourceMismatch};
  }),[drafts,items]);

  useEffect(()=>{onRatesChange?.(Object.fromEntries(priced.map(({item,review})=>[item.id,{rate:review.workingRate,source:review.workingRateSource==="imported"?"imported":review.workingRateSource==="manual"?"manual":review.workingRateSource==="charismak_reference"?"reference":null}])));},[onRatesChange,priced]);

  const unpricedCount=priced.filter(row=>row.review.workingRate===null).length;
  const mismatchCount=priced.filter(row=>row.sourceMismatch).length;
  const directTotal=priced.reduce((sum,row)=>sum+(row.amount??0),0);
  const sourceTotal=priced.reduce((sum,row)=>sum+(row.sourceAmount??0),0);
  const visible=showOnlyUnpriced?priced.filter(row=>row.review.workingRate===null):priced;

  function update(itemId:string,value:string){setDrafts(current=>({...current,[itemId]:{value,source:"manual"}}));}
  function restore(itemId:string,rate:number|null|undefined){setDrafts(current=>({...current,[itemId]:{value:rate==null?"":String(rate),source:rate==null?"manual":"imported"}}));}
  function confirmQtyRate(itemId:string){setDrafts(current=>({...current,[itemId]:{...(current[itemId]??{value:""}),source:"manual"}}));}
  function useSourceAmount(itemId:string,quantity:number,sourceAmount:number|null){if(quantity<=0||sourceAmount==null)return;setDrafts(current=>({...current,[itemId]:{value:String(roundRate(sourceAmount/quantity)),source:"manual"}}));}

  return <section className="data-card" style={{marginTop:14,overflow:"hidden"}}>
    <div style={{padding:16,background:"#f4f8fb",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div><small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#0b668f"}}>RATE ENGINE V1</small><h2 style={{fontSize:17,margin:"5px 0 3px",color:"#173f5a"}}>Choose the working rate — source values stay visible</h2><p style={{margin:0,fontSize:11,color:"#6b7f8e",maxWidth:760}}>Imported rates are retained by default. Working amounts use Qty × Working Rate. When the source BOQ Amount disagrees, Charismak shows both values and requires an explicit decision before Project staging.</p></div>
      <div style={{textAlign:"right"}}><small style={{display:"block",fontSize:9,color:"#718391"}}>WORKING DIRECT TOTAL</small><strong style={{fontSize:20,color:"#173f5a"}}>{money(directTotal,boq.currency)}</strong><small style={{display:"block",marginTop:2,color:unpricedCount||mismatchCount?"#936814":"#16825c"}}>{unpricedCount?`${unpricedCount} unpriced`:mismatchCount?`${mismatchCount} source mismatch${mismatchCount===1?"":"es"}`:"All rates reconciled"}</small></div>
    </div>

    {mismatchCount>0&&<div style={{padding:"10px 14px",background:"#fff4ce",color:"#775c18",fontSize:10,lineHeight:1.5}}><b>Source arithmetic review required:</b> {mismatchCount} imported line{mismatchCount===1?"":"s"} disagree with Qty × Rate. Imported line amounts total {money(sourceTotal,boq.currency)} while the current working direct total is {money(directTotal,boq.currency)}. Choose <b>Confirm Qty × Rate</b>, edit the rate, or <b>Use source Amount</b> on each affected line.</div>}

    <div style={{padding:"10px 14px",borderTop:"1px solid #e5ecef",borderBottom:"1px solid #e5ecef",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div style={{fontSize:10,color:"#687d8c"}}><b>Rate source:</b> Imported/User now · Charismak reference when reviewed market observations are connected.</div><label style={{fontSize:10,fontWeight:800,color:"#536b7d",display:"flex",gap:6,alignItems:"center"}}><input type="checkbox" checked={showOnlyUnpriced} onChange={e=>setShowOnlyUnpriced(e.target.checked)}/> Show only unpriced</label></div>

    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:1040}}>
      <thead><tr style={{fontSize:9,textTransform:"uppercase",letterSpacing:".06em",color:"#718391",background:"#fbfcfd"}}><th style={th}>Section</th><th style={th}>Description</th><th style={{...th,textAlign:"right"}}>Qty</th><th style={{...th,textAlign:"right"}}>Imported Rate</th><th style={{...th,textAlign:"right"}}>Source Amount</th><th style={{...th,textAlign:"right"}}>Working Rate</th><th style={th}>Rate Check</th><th style={{...th,textAlign:"right"}}>Working Amount</th></tr></thead>
      <tbody>{visible.map(({section,item,draft,review,amount,sourceAmount,sourceMismatch})=><tr key={item.id} style={{borderTop:"1px solid #edf1f4",fontSize:11,background:sourceMismatch?"#fffaf0":"transparent"}}>
        <td style={{...td,color:"#5e7485",maxWidth:150}}>{section.title}</td><td style={{...td,minWidth:260,color:"#28495f"}}><b>{item.itemNo?`${item.itemNo} · `:""}</b>{item.description}</td><td style={{...td,textAlign:"right"}}>{item.quantity.toLocaleString("en-NG",{maximumFractionDigits:3})} {item.unit}</td><td style={{...td,textAlign:"right"}}>{money(item.rate,boq.currency)}</td><td style={{...td,textAlign:"right",fontWeight:sourceMismatch?900:400,color:sourceMismatch?"#8a5b00":"#627786"}}>{money(sourceAmount,boq.currency)}</td>
        <td style={{...td,textAlign:"right"}}><div style={{display:"flex",justifyContent:"flex-end",gap:5,alignItems:"center"}}><input aria-label={`Working rate for ${item.description}`} inputMode="decimal" value={draft.value} onChange={e=>update(item.id,e.target.value)} placeholder="Enter rate" style={{width:110,border:"1px solid #cbd8e0",borderRadius:8,padding:"7px 8px",textAlign:"right",fontSize:11}}/>{draft.source==="manual"&&item.rate!=null&&<button type="button" onClick={()=>restore(item.id,item.rate)} style={miniButton}>Restore</button>}</div></td>
        <td style={td}><span style={{display:"inline-block",padding:"4px 7px",borderRadius:999,fontSize:9,fontWeight:900,background:sourceMismatch?"#ffe7ad":review.status==="unpriced"?"#fff0c9":"#eef3f6",color:sourceMismatch?"#795000":review.status==="unpriced"?"#825f0d":"#657886"}}>{sourceMismatch?"SOURCE MISMATCH":review.status==="unpriced"?"NEEDS RATE":"REFERENCE PENDING"}</span><small style={{display:"block",marginTop:4,color:"#81909b"}}>{sourceMismatch?"Source Amount ≠ Qty × imported Rate":review.workingRateSource==="manual"?"User-confirmed working rate":review.workingRateSource==="imported"?"Imported rate retained":"No working rate"}</small>{sourceMismatch&&<div style={{display:"flex",gap:5,flexWrap:"wrap",marginTop:5}}><button type="button" onClick={()=>confirmQtyRate(item.id)} style={miniButton}>Confirm Qty × Rate</button>{item.quantity>0&&sourceAmount!=null&&<button type="button" onClick={()=>useSourceAmount(item.id,item.quantity,sourceAmount)} style={miniButton}>Use source Amount</button>}</div>}</td>
        <td style={{...td,textAlign:"right",fontWeight:900,color:sourceMismatch?"#8a5b00":"#173f5a"}}>{money(amount,boq.currency)}</td>
      </tr>)}</tbody>
    </table></div>

    <div style={{padding:14,borderTop:"1px solid #e5ecef",background:"#fbfcfd",fontSize:10,lineHeight:1.5,color:"#687d8c"}}><b>Review discipline:</b> Charismak never silently chooses between a source Amount and Qty × Rate. A user decision resolves the discrepancy; exports retain the source Amount for audit.</div>
  </section>;
}

const th:React.CSSProperties={padding:"9px 10px",textAlign:"left",fontWeight:900};
const td:React.CSSProperties={padding:"10px",verticalAlign:"top",color:"#627786"};
const miniButton:React.CSSProperties={border:"1px solid #b8cad5",borderRadius:7,padding:"4px 6px",background:"#fff",fontSize:8,fontWeight:900,color:"#0b668f",cursor:"pointer"};
