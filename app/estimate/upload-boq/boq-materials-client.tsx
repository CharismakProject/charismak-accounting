"use client";

import { useMemo, useState } from "react";
import type { SectionedBoq } from "../../../lib/estimate/sectioned-boq";
import { findBoqItem, summarizeMaterials } from "../../../lib/estimate/sectioned-boq";
import { materializeBoq, type MaterializeDecision } from "../../../lib/estimate/material-recipe-engine";

const qty=(n:number)=>new Intl.NumberFormat("en-NG",{maximumFractionDigits:3}).format(n);

type Props={
  boq:SectionedBoq;
  decisions:Record<string,MaterializeDecision>;
  onMaterialized?:(boq:SectionedBoq)=>void;
};

export default function BoqMaterialsClient({boq,decisions,onMaterialized}:Props){
  const [calculated,setCalculated]=useState<SectionedBoq|null>(null);
  const [selectedMaterial,setSelectedMaterial]=useState<string|null>(null);

  const confirmed=Object.values(decisions).filter(d=>d.confirmed).length;
  const total=boq.sections.reduce((sum,s)=>sum+s.items.length,0);
  const supportedConfirmed=boq.sections.flatMap(s=>s.items).filter(item=>{
    const d=decisions[item.id];
    return d?.confirmed&&["blockwork_225","blockwork_150","blockwork","plastering","screeding","floor_tiling","wall_tiling","reinforcement","direct_supply","not_applicable"].includes(d.recipeFamily);
  }).length;

  const summary=useMemo(()=>calculated?summarizeMaterials(calculated):[],[calculated]);
  const needsRecipe=calculated?calculated.sections.flatMap(s=>s.items).filter(i=>i.materialBreakdown.status==="needs_review").length:0;
  const excluded=calculated?calculated.sections.flatMap(s=>s.items).filter(i=>i.materialBreakdown.status==="not_applicable").length:0;

  function calculate(){
    const next=materializeBoq(boq,decisions);
    setCalculated(next);
    setSelectedMaterial(null);
    onMaterialized?.(next);
  }

  return <section className="data-card" style={{marginTop:14,overflow:"hidden"}}>
    <div style={{padding:17,background:"#f2f8f5",display:"flex",justifyContent:"space-between",alignItems:"center",gap:14,flexWrap:"wrap"}}>
      <div>
        <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#16825c"}}>BOQ → MATERIALS V1</small>
        <h2 style={{fontSize:18,margin:"5px 0 3px",color:"#173f5a"}}>Turn reviewed quantities into traceable materials</h2>
        <p style={{margin:0,fontSize:11,lineHeight:1.55,color:"#687d8c",maxWidth:760}}>Only confirmed recipe decisions calculate. Supported V1 recipes use visible assumptions; specification-dependent work remains flagged instead of receiving guessed quantities.</p>
      </div>
      <button type="button" onClick={calculate} disabled={!confirmed} style={{border:0,borderRadius:11,padding:"10px 13px",background:"#16825c",color:"#fff",fontSize:10,fontWeight:900,cursor:"pointer",opacity:confirmed?1:.45}}>Calculate reviewed materials</button>
    </div>

    <div style={{padding:"11px 16px",display:"flex",gap:8,flexWrap:"wrap",fontSize:10,color:"#607687",borderTop:"1px solid #e2ebe6",borderBottom:"1px solid #e2ebe6"}}>
      <span><b>{confirmed}</b> / {total} BOQ items confirmed</span><span>·</span><span><b>{supportedConfirmed}</b> confirmed items have V1-calculable recipes</span>
      {calculated&&<><span>·</span><span><b>{summary.length}</b> material groups</span><span>·</span><span><b>{needsRecipe}</b> still need recipe parameters/review</span><span>·</span><span><b>{excluded}</b> excluded from contractor materials</span></>}
    </div>

    {!calculated&&<div style={{padding:17,fontSize:11,lineHeight:1.6,color:"#6c7f8c"}}>Confirm BOQ meaning above, then calculate. This does not save a project or post anything to Accounting.</div>}

    {calculated&&<>
      <div style={{padding:16}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",flexWrap:"wrap",marginBottom:10}}><div><small style={{fontSize:9,fontWeight:900,color:"#16825c",letterSpacing:".08em"}}>MATERIAL SUMMARY</small><h3 style={{margin:"4px 0 0",fontSize:15,color:"#173f5a"}}>Click a material total to see exactly where it came from</h3></div><span style={{fontSize:10,color:"#718391"}}>{summary.length} grouped materials</span></div>
        {summary.length?<div style={{display:"grid",gap:7}}>{summary.map(row=>{
          const key=`${row.material}::${row.unit}`;
          const open=selectedMaterial===key;
          return <div key={key} style={{border:"1px solid #dfe8ec",borderRadius:11,overflow:"hidden"}}>
            <button type="button" onClick={()=>setSelectedMaterial(open?null:key)} style={{width:"100%",border:0,background:open?"#edf8f3":"#fff",padding:"10px 12px",display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:10,alignItems:"center",textAlign:"left",cursor:"pointer"}}><span><b style={{fontSize:12,color:"#244960"}}>{row.material}</b><small style={{display:"block",marginTop:2,color:"#748694"}}>{row.sourceItems.length} BOQ source item{row.sourceItems.length===1?"":"s"}</small></span><strong style={{fontSize:13,color:"#16825c"}}>{qty(row.quantity)} {row.unit}</strong></button>
            {open&&<div style={{background:"#fbfdfc",borderTop:"1px solid #e3ebe7",padding:10,display:"grid",gap:6}}>{row.sourceItems.map(source=>{
              const found=findBoqItem(calculated,source.itemId);
              return <div key={`${source.sectionId}-${source.itemId}`} style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:10,fontSize:10,color:"#607687",padding:"6px 2px",borderTop:"1px solid #edf1ef"}}><span><b style={{color:"#35566b"}}>{found?.section.title??source.sectionId}</b> → {source.description}</span><strong style={{color:"#0b668f"}}>{qty(source.quantity)} {row.unit}</strong></div>;
            })}</div>}
          </div>;
        })}</div>:<div style={{padding:14,borderRadius:10,background:"#fff8e8",fontSize:11,color:"#775c18"}}>No contractor material totals are available yet. Confirm a supported contractor-supplied recipe above.</div>}
      </div>

      <div style={{padding:"12px 16px",borderTop:"1px solid #e5ece8",background:"#fbfcfc",fontSize:10,lineHeight:1.55,color:"#647887"}}><b>V1 calculation coverage:</b> blockwork, plastering, screeding, measured reinforcement, tile/finish area, and confirmed direct-supply items. Concrete mix/grade, formwork system, painting coats/coverage, roofing build-up, ceilings and MEP stay parameter-required until their specification is confirmed.</div>
    </>}
  </section>;
}
