"use client";

import { useMemo, useState } from "react";
import type { SectionedBoq, SectionedBoqItem } from "../../../lib/estimate/sectioned-boq";
import { findBoqItem, summarizeMaterials } from "../../../lib/estimate/sectioned-boq";

const money = (value: number | null | undefined, currency: string) => value == null
  ? "—"
  : new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(value);

const qty = (value: number) => new Intl.NumberFormat("en-NG", { maximumFractionDigits: 3 }).format(value);

function MaterialsPanel({ item }: { item: SectionedBoqItem }) {
  const breakdown = item.materialBreakdown;
  if (breakdown.status === "not_applicable") {
    return <div style={{padding:14,color:"#607687",fontSize:12}}>This BOQ item does not require a material breakdown.</div>;
  }
  if (breakdown.status === "needs_review") {
    return <div style={{padding:14,color:"#7b5c13",fontSize:12}}>Charismak needs a reviewed work recipe before materials can be calculated for this quantity.</div>;
  }
  return <div style={{padding:14,display:"grid",gap:10}}>
    <div><small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#16825c"}}>MATERIALS FOR {qty(item.quantity)} {item.unit}</small><h3 style={{margin:"5px 0 0",fontSize:15,color:"#173f5a"}}>{breakdown.recipeName ?? item.description}</h3></div>
    <div style={{display:"grid",gap:7}}>
      {breakdown.materials.map((material)=><div key={material.id} style={{display:"grid",gridTemplateColumns:"minmax(140px,1fr) 90px 90px",gap:8,alignItems:"center",border:"1px solid #e1e9ee",borderRadius:10,padding:"9px 10px",background:"#fff"}}>
        <div><b style={{fontSize:12,color:"#183f59"}}>{material.material}</b>{material.note&&<small style={{display:"block",marginTop:2,color:"#718391"}}>{material.note}</small>}</div>
        <div style={{fontSize:11,color:"#667a89"}}>{qty(material.baseQuantity)} {material.unit}{material.wastePercent ? <small style={{display:"block"}}>+ {material.wastePercent}% waste</small> : null}</div>
        <strong style={{textAlign:"right",fontSize:12,color:"#0b668f"}}>{qty(material.totalQuantity)} {material.unit}</strong>
      </div>)}
    </div>
    {(breakdown.assumptions?.length ?? 0)>0&&<div style={{borderTop:"1px solid #e1e9ee",paddingTop:9}}><small style={{fontWeight:900,color:"#536b7d"}}>ASSUMPTIONS</small><ul style={{margin:"5px 0 0",paddingLeft:17,color:"#6b7e8c",fontSize:11,lineHeight:1.5}}>{breakdown.assumptions!.map((text)=><li key={text}>{text}</li>)}</ul></div>}
  </div>;
}

export default function SectionedBoqClient({ boq }: { boq: SectionedBoq }) {
  const [openSections,setOpenSections]=useState<Record<string,boolean>>(()=>Object.fromEntries(boq.sections.map((section)=>[section.id,true])));
  const [selectedItemId,setSelectedItemId]=useState<string|null>(null);
  const selected = selectedItemId ? findBoqItem(boq,selectedItemId) : null;
  const summary = useMemo(()=>summarizeMaterials(boq),[boq]);

  return <div style={{display:"grid",gap:12}}>
    <div className="data-card" style={{padding:16,display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap"}}>
      <div><small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#0b668f"}}>SECTIONED BOQ</small><h2 style={{fontSize:18,margin:"5px 0 2px",color:"#14354d"}}>{boq.name}</h2><p style={{margin:0,fontSize:11,color:"#718391"}}>{boq.sections.length} sections · {boq.sections.reduce((n,s)=>n+s.items.length,0)} items · {summary.length} material groups</p></div>
      <div style={{fontSize:11,color:"#607687"}}><b>Tip:</b> click any blue quantity to inspect its materials.</div>
    </div>

    {boq.sections.map((section)=>{
      const open=openSections[section.id];
      const sectionAmount=section.items.reduce((sum,item)=>sum+(item.amount??0),0);
      return <section key={section.id} className="data-card" style={{overflow:"hidden"}}>
        <button type="button" onClick={()=>setOpenSections((current)=>({...current,[section.id]:!open}))} style={{width:"100%",border:0,background:"#edf4f8",padding:"13px 15px",display:"flex",justifyContent:"space-between",alignItems:"center",textAlign:"left",cursor:"pointer"}}>
          <span><small style={{fontSize:9,fontWeight:900,color:"#0b668f",letterSpacing:".08em"}}>{section.code ?? "SECTION"}</small><strong style={{display:"block",fontSize:14,color:"#173f5a",marginTop:2}}>{section.title}</strong></span>
          <span style={{textAlign:"right"}}><small style={{display:"block",color:"#718391"}}>{section.items.length} items</small><b style={{fontSize:12,color:"#173f5a"}}>{money(sectionAmount,boq.currency)}</b></span>
        </button>
        {open&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:760}}>
          <thead><tr style={{fontSize:9,textTransform:"uppercase",letterSpacing:".06em",color:"#718391"}}><th style={th}>Item</th><th style={th}>Description</th><th style={th}>Unit</th><th style={{...th,textAlign:"right"}}>Quantity</th><th style={{...th,textAlign:"right"}}>Rate</th><th style={{...th,textAlign:"right"}}>Amount</th></tr></thead>
          <tbody>{section.items.map((item)=><>
            <tr key={item.id} style={{borderTop:"1px solid #edf1f4",fontSize:12}}>
              <td style={td}>{item.itemNo ?? "—"}</td><td style={{...td,minWidth:280,color:"#28495f"}}>{item.description}</td><td style={td}>{item.unit}</td>
              <td style={{...td,textAlign:"right"}}><button type="button" onClick={()=>setSelectedItemId((current)=>current===item.id?null:item.id)} style={{border:"1px solid #9bc7df",background:selectedItemId===item.id?"#0b668f":"#eef8fd",color:selectedItemId===item.id?"#fff":"#0b668f",fontWeight:900,borderRadius:8,padding:"6px 9px",cursor:"pointer"}}>{qty(item.quantity)}</button></td>
              <td style={{...td,textAlign:"right"}}>{money(item.rate,boq.currency)}</td><td style={{...td,textAlign:"right",fontWeight:800}}>{money(item.amount,boq.currency)}</td>
            </tr>
            {selectedItemId===item.id&&<tr key={`${item.id}-materials`}><td colSpan={6} style={{padding:0,background:"#f8fbfd"}}><MaterialsPanel item={item}/></td></tr>}
          </>)}</tbody>
        </table></div>}
      </section>;
    })}

    {selected&&<div className="data-card" style={{padding:14,borderLeft:"4px solid #16825c"}}><small style={{fontSize:9,fontWeight:900,color:"#16825c"}}>CURRENT MATERIAL DRILLDOWN</small><p style={{margin:"5px 0 0",fontSize:12,color:"#5e7485"}}>{selected.section.title} → {selected.item.description} → {qty(selected.item.quantity)} {selected.item.unit}</p></div>}
  </div>;
}

const th: React.CSSProperties={padding:"10px 12px",textAlign:"left",fontWeight:900,background:"#fbfcfd"};
const td: React.CSSProperties={padding:"10px 12px",verticalAlign:"top",color:"#627786"};
