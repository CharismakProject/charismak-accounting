"use client";

import { useMemo, useState } from "react";
import type { SectionedBoq } from "../../../lib/estimate/sectioned-boq";
import { priceBoqLine, reviewBoqRate } from "../../../lib/estimate/rate-engine";

type Draft = { value: string; source: "imported" | "manual" };

const money=(value:number|null|undefined,currency:string)=>value==null?"—":new Intl.NumberFormat("en-NG",{style:"currency",currency,maximumFractionDigits:0}).format(value);
const number=(value:string)=>{
  const cleaned=value.replace(/[,₦$€£\s]/g,"");
  if(!cleaned.trim())return null;
  const parsed=Number(cleaned);
  return Number.isFinite(parsed)&&parsed>=0?parsed:null;
};

export default function BoqRateClient({boq}:{boq:SectionedBoq}){
  const items=useMemo(()=>boq.sections.flatMap(section=>section.items.map(item=>({section,item}))),[boq]);
  const [drafts,setDrafts]=useState<Record<string,Draft>>(()=>Object.fromEntries(items.map(({item})=>[item.id,{value:item.rate==null?"":String(item.rate),source:item.rate==null?"manual":"imported"}])));
  const [showOnlyUnpriced,setShowOnlyUnpriced]=useState(false);

  const priced=items.map(({section,item})=>{
    const draft=drafts[item.id]??{value:"",source:"manual" as const};
    const selectedRate=number(draft.value);
    const review=reviewBoqRate({
      importedRate:item.rate??null,
      reference:null,
      selectedRate:draft.source==="manual"?selectedRate:null,
      selectedSource:draft.source==="manual"?"manual":null,
    });
    const amount=priceBoqLine(item.quantity,review);
    return {section,item,draft,review,amount};
  });

  const unpricedCount=priced.filter(row=>row.review.workingRate===null).length;
  const directTotal=priced.reduce((sum,row)=>sum+(row.amount??0),0);
  const visible=showOnlyUnpriced?priced.filter(row=>row.review.workingRate===null):priced;

  function update(itemId:string,value:string,importedRate:number|null|undefined){
    setDrafts(current=>({...current,[itemId]:{value,source:value===String(importedRate??"")&&importedRate!=null?"imported":"manual"}}));
  }
  function restore(itemId:string,rate:number|null|undefined){
    setDrafts(current=>({...current,[itemId]:{value:rate==null?"":String(rate),source:rate==null?"manual":"imported"}}));
  }

  return <section className="data-card" style={{marginTop:14,overflow:"hidden"}}>
    <div style={{padding:16,background:"#f4f8fb",display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}>
      <div>
        <small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#0b668f"}}>RATE ENGINE V1</small>
        <h2 style={{fontSize:17,margin:"5px 0 3px",color:"#173f5a"}}>Choose the working rate — Charismak does not overwrite your bill</h2>
        <p style={{margin:0,fontSize:11,color:"#6b7f8e",maxWidth:760}}>Imported rates are retained by default. Unpriced items stay unpriced until you enter or later choose a Charismak reference rate. Reference ranges will come from the reviewed market-price service, not hard-coded values.</p>
      </div>
      <div style={{textAlign:"right"}}><small style={{display:"block",fontSize:9,color:"#718391"}}>WORKING DIRECT TOTAL</small><strong style={{fontSize:20,color:"#173f5a"}}>{money(directTotal,boq.currency)}</strong><small style={{display:"block",marginTop:2,color:unpricedCount?"#936814":"#16825c"}}>{unpricedCount?`${unpricedCount} item${unpricedCount===1?"":"s"} still unpriced`:"All items priced"}</small></div>
    </div>

    <div style={{padding:"10px 14px",borderTop:"1px solid #e5ecef",borderBottom:"1px solid #e5ecef",display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
      <div style={{fontSize:10,color:"#687d8c"}}><b>Rate source:</b> Imported/User now · Charismak reference when reviewed market observations are connected.</div>
      <label style={{fontSize:10,fontWeight:800,color:"#536b7d",display:"flex",gap:6,alignItems:"center"}}><input type="checkbox" checked={showOnlyUnpriced} onChange={e=>setShowOnlyUnpriced(e.target.checked)}/> Show only unpriced</label>
    </div>

    <div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:900}}>
      <thead><tr style={{fontSize:9,textTransform:"uppercase",letterSpacing:".06em",color:"#718391",background:"#fbfcfd"}}><th style={th}>Section</th><th style={th}>Description</th><th style={{...th,textAlign:"right"}}>Qty</th><th style={{...th,textAlign:"right"}}>Imported</th><th style={{...th,textAlign:"right"}}>Working Rate</th><th style={th}>Rate Check</th><th style={{...th,textAlign:"right"}}>Working Amount</th></tr></thead>
      <tbody>{visible.map(({section,item,draft,review,amount})=><tr key={item.id} style={{borderTop:"1px solid #edf1f4",fontSize:11}}>
        <td style={{...td,color:"#5e7485",maxWidth:150}}>{section.title}</td>
        <td style={{...td,minWidth:260,color:"#28495f"}}><b>{item.itemNo?`${item.itemNo} · `:""}</b>{item.description}</td>
        <td style={{...td,textAlign:"right"}}>{item.quantity.toLocaleString("en-NG",{maximumFractionDigits:3})} {item.unit}</td>
        <td style={{...td,textAlign:"right"}}>{money(item.rate,boq.currency)}</td>
        <td style={{...td,textAlign:"right"}}><div style={{display:"flex",justifyContent:"flex-end",gap:5,alignItems:"center"}}><input aria-label={`Working rate for ${item.description}`} inputMode="decimal" value={draft.value} onChange={e=>update(item.id,e.target.value,item.rate)} placeholder="Enter rate" style={{width:110,border:"1px solid #cbd8e0",borderRadius:8,padding:"7px 8px",textAlign:"right",fontSize:11}}/>{draft.source==="manual"&&item.rate!=null&&<button type="button" onClick={()=>restore(item.id,item.rate)} style={{border:0,background:"transparent",fontSize:9,fontWeight:900,color:"#0b668f",cursor:"pointer"}}>Restore</button>}</div></td>
        <td style={td}><span style={{display:"inline-block",padding:"4px 7px",borderRadius:999,fontSize:9,fontWeight:900,background:review.status==="unpriced"?"#fff0c9":"#eef3f6",color:review.status==="unpriced"?"#825f0d":"#657886"}}>{review.status==="unpriced"?"NEEDS RATE":"REFERENCE PENDING"}</span><small style={{display:"block",marginTop:4,color:"#81909b"}}>{review.workingRateSource==="manual"?"Manual working rate":review.workingRateSource==="imported"?"Imported rate retained":"No working rate"}</small></td>
        <td style={{...td,textAlign:"right",fontWeight:900,color:"#173f5a"}}>{money(amount,boq.currency)}</td>
      </tr>)}</tbody>
    </table></div>

    <div style={{padding:14,borderTop:"1px solid #e5ecef",background:"#fbfcfd",fontSize:10,lineHeight:1.5,color:"#687d8c"}}><b>Next connection:</b> when Charismak market observations are available for the item/unit/location, this same engine will show Low · Typical · High, observation date, sources and variance — while the working rate remains a user decision.</div>
  </section>;
}

const th:React.CSSProperties={padding:"9px 10px",textAlign:"left",fontWeight:900};
const td:React.CSSProperties={padding:"10px",verticalAlign:"top",color:"#627786"};
