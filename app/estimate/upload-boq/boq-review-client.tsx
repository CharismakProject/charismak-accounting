"use client";

import { useEffect, useMemo, useState } from "react";
import type {
  BoqRecipeFamily,
  BoqSupplyResponsibility,
  SectionedBoq,
  SectionedBoqItem,
  SectionedBoqSection,
} from "../../../lib/estimate/sectioned-boq";
import type { MaterializeDecision } from "../../../lib/estimate/material-recipe-engine";

const COST_CODES = [
  ["01","Preliminaries"],["02","Substructure"],["03","Concrete & Reinforcement"],["04","Blockwork & Masonry"],
  ["05","Structural Steel"],["06","Roofing"],["07","Doors"],["08","Windows & Glazing"],["09","Plastering & Screeding"],
  ["10","Floor Finishes"],["11","Wall Finishes"],["12","Ceilings"],["13","Painting & Decoration"],["14","Joinery & Fixtures"],
  ["15","Plumbing & Sanitary"],["16","Electrical"],["17","Mechanical & HVAC"],["18","External Works"],
  ["19","Plant, Equipment & Specialist Works"],["20","Professional, Statutory & Other"],
] as const;

const RECIPE_OPTIONS: Array<[BoqRecipeFamily,string]> = [
  ["blockwork_225","225mm blockwork"],["blockwork_150","150mm blockwork"],["blockwork","Blockwork recipe"],
  ["concrete","Concrete recipe"],["reinforcement","Reinforcement recipe"],["formwork","Formwork recipe"],
  ["plastering","Plastering recipe"],["screeding","Screeding recipe"],["floor_tiling","Floor tiling recipe"],
  ["wall_tiling","Wall finish recipe"],["painting","Painting recipe"],["roofing","Roofing recipe"],
  ["ceiling","Ceiling recipe"],["plumbing_installation","Plumbing installation recipe"],
  ["electrical_installation","Electrical installation recipe"],["direct_supply","Direct supply item"],
  ["external_works","External works recipe"],["not_applicable","No material recipe required"],["needs_review","Needs recipe review"],
];

const SUPPLY_OPTIONS: Array<[BoqSupplyResponsibility,string]> = [
  ["contractor","Contractor"],["client","Client supplied"],["specialist","Specialist / nominated supplier"],
  ["labour_only","Labour / installation only"],["unknown","Needs review"],
];

type Decision = {
  costCode: string;
  recipeFamily: BoqRecipeFamily;
  supplyResponsibility: BoqSupplyResponsibility;
  confirmed: boolean;
  edited: boolean;
};

type DecisionMap = Record<string,Decision>;

const qty=(n:number)=>new Intl.NumberFormat("en-NG",{maximumFractionDigits:3}).format(n);

function startingDecision(item: SectionedBoqItem): Decision {
  const suggestion=item.reviewSuggestion;
  return {
    costCode:suggestion?.costCode??"",
    recipeFamily:suggestion?.recipeFamily??"needs_review",
    supplyResponsibility:suggestion?.supplyResponsibility??"unknown",
    confirmed:false,
    edited:false,
  };
}

function dominantCode(section: SectionedBoqSection): string | null {
  const counts=new Map<string,number>();
  for(const item of section.items){const code=item.reviewSuggestion?.costCode;if(code)counts.set(code,(counts.get(code)??0)+1);}
  const sorted=[...counts.entries()].sort((a,b)=>b[1]-a[1]);
  if(!sorted.length)return null;
  return sorted[0][1]>=Math.max(2,Math.ceil(section.items.length*.6))?sorted[0][0]:null;
}

function isComplete(decision:Decision){
  return Boolean(decision.costCode)&&decision.recipeFamily!=="needs_review"&&decision.supplyResponsibility!=="unknown";
}

export default function BoqReviewClient({boq,onDecisionsChange}:{boq:SectionedBoq;onDecisionsChange?:(decisions:Record<string,MaterializeDecision>)=>void}){
  const initial=useMemo(()=>Object.fromEntries(boq.sections.flatMap(section=>section.items.map(item=>[item.id,startingDecision(item)]))),[boq]);
  const [decisions,setDecisions]=useState<DecisionMap>(initial);
  const [open,setOpen]=useState<Record<string,boolean>>(()=>Object.fromEntries(boq.sections.map(section=>[section.id,true])));

  useEffect(()=>{
    onDecisionsChange?.(Object.fromEntries(Object.entries(decisions).map(([id,decision])=>[id,{
      recipeFamily:decision.recipeFamily,
      supplyResponsibility:decision.supplyResponsibility,
      confirmed:decision.confirmed,
    }])));
  },[decisions,onDecisionsChange]);

  const total=boq.sections.reduce((n,s)=>n+s.items.length,0);
  const confirmed=Object.values(decisions).filter(d=>d.confirmed).length;
  const unresolved=Object.values(decisions).filter(d=>!isComplete(d)).length;

  function change(itemId:string,patch:Partial<Decision>){
    setDecisions(current=>({...current,[itemId]:{...current[itemId],...patch,confirmed:false,edited:true}}));
  }

  function confirmItem(itemId:string){
    setDecisions(current=>isComplete(current[itemId])?({...current,[itemId]:{...current[itemId],confirmed:true}}):current);
  }

  function confirmSection(section:SectionedBoqSection){
    setDecisions(current=>{
      const next={...current};
      for(const item of section.items){
        const decision=next[item.id];
        if(isComplete(decision))next[item.id]={...decision,confirmed:true};
      }
      return next;
    });
  }

  function applySectionCode(section:SectionedBoqSection,code:string){
    setDecisions(current=>{
      const next={...current};
      for(const item of section.items)next[item.id]={...next[item.id],costCode:code,confirmed:false,edited:true};
      return next;
    });
  }

  function confirmAllClear(){
    setDecisions(current=>Object.fromEntries(Object.entries(current).map(([id,decision])=>[id,isComplete(decision)?{...decision,confirmed:true}:decision])));
  }

  return <section className="data-card" style={{marginTop:14,overflow:"hidden"}}>
    <div style={{padding:17,display:"flex",justifyContent:"space-between",gap:14,alignItems:"center",flexWrap:"wrap",borderBottom:"1px solid #e3eaee"}}>
      <div>
        <small style={{fontSize:9,fontWeight:900,letterSpacing:".11em",color:"#0b668f"}}>BOQ REVIEW INTELLIGENCE</small>
        <h2 style={{margin:"5px 0 3px",fontSize:19,color:"#173f5a"}}>Confirm the meaning, not every spreadsheet cell</h2>
        <p style={{margin:0,fontSize:11,lineHeight:1.55,color:"#687d8c",maxWidth:760}}>Charismak suggests the cost group, material-recipe family and who supplies the item. Confirm clear sections in bulk; only uncertain items need individual attention.</p>
      </div>
      <button type="button" onClick={confirmAllClear} style={primaryButton}>Confirm all clear suggestions</button>
    </div>

    <div style={{padding:"12px 17px",display:"flex",gap:8,flexWrap:"wrap",fontSize:11,color:"#5f7484",background:"#f8fbfc"}}>
      <span><b>{confirmed}</b> / {total} confirmed</span><span>·</span><span><b>{unresolved}</b> still need a decision</span><span>·</span><span>Nothing here posts to Accounting.</span>
    </div>

    <div style={{display:"grid",gap:10,padding:14}}>
      {boq.sections.map(section=>{
        const code=dominantCode(section);
        const sectionConfirmed=section.items.filter(item=>decisions[item.id]?.confirmed).length;
        const sectionUnresolved=section.items.filter(item=>!isComplete(decisions[item.id])).length;
        const clearCount=section.items.length-sectionUnresolved;
        return <div key={section.id} style={{border:"1px solid #dbe5ea",borderRadius:14,overflow:"hidden",background:"#fff"}}>
          <div style={{padding:"12px 13px",background:"#edf4f8",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"}}>
            <button type="button" onClick={()=>setOpen(v=>({...v,[section.id]:!v[section.id]}))} style={{border:0,background:"transparent",textAlign:"left",cursor:"pointer",flex:"1 1 260px",padding:0}}>
              <small style={{fontSize:8,fontWeight:900,color:"#0b668f"}}>{section.code??"SECTION"}</small>
              <strong style={{display:"block",fontSize:14,color:"#173f5a",marginTop:2}}>{section.title}</strong>
              <span style={{display:"block",fontSize:9,color:"#6b7e8d",marginTop:3}}>{sectionConfirmed}/{section.items.length} confirmed · {sectionUnresolved?`${sectionUnresolved} need attention`:`${clearCount} clear`}</span>
            </button>
            {code&&<button type="button" onClick={()=>applySectionCode(section,code)} style={secondaryButton}>Use {code} for section</button>}
            <button type="button" onClick={()=>confirmSection(section)} disabled={!clearCount} style={{...primaryButton,opacity:clearCount?.95:.45}}>Confirm {clearCount} ready</button>
          </div>

          {open[section.id]&&<div style={{overflowX:"auto"}}><table style={{width:"100%",borderCollapse:"collapse",minWidth:980}}>
            <thead><tr style={{fontSize:8,textTransform:"uppercase",letterSpacing:".05em",color:"#748694"}}><th style={th}>Item</th><th style={th}>Description</th><th style={th}>Qty</th><th style={th}>Cost group</th><th style={th}>Material recipe</th><th style={th}>Supply</th><th style={th}>Status</th></tr></thead>
            <tbody>{section.items.map(item=>{
              const decision=decisions[item.id];
              const suggestion=item.reviewSuggestion;
              const complete=isComplete(decision);
              return <tr key={item.id} style={{borderTop:"1px solid #edf1f4",background:suggestion?.requiresAttention&&!decision.confirmed?"#fffdf7":"#fff"}}>
                <td style={td}>{item.itemNo??"—"}</td>
                <td style={{...td,minWidth:280}}><b style={{fontSize:11,color:"#28495f"}}>{item.description}</b><div style={{fontSize:9,color:"#778895",marginTop:3}}>{suggestion?.confidence??"low"} confidence{decision.edited?" · edited":""}</div></td>
                <td style={{...td,whiteSpace:"nowrap"}}>{qty(item.quantity)} {item.unit}</td>
                <td style={td}><select value={decision.costCode} onChange={e=>change(item.id,{costCode:e.target.value})} style={select}><option value="">Choose…</option>{COST_CODES.map(([code,name])=><option key={code} value={code}>{code} · {name}</option>)}</select></td>
                <td style={td}><select value={decision.recipeFamily} onChange={e=>change(item.id,{recipeFamily:e.target.value as BoqRecipeFamily})} style={select}>{RECIPE_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
                <td style={td}><select value={decision.supplyResponsibility} onChange={e=>change(item.id,{supplyResponsibility:e.target.value as BoqSupplyResponsibility})} style={select}>{SUPPLY_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
                <td style={{...td,minWidth:110}}>{decision.confirmed?<span style={confirmedPill}>Confirmed</span>:complete?<button type="button" onClick={()=>confirmItem(item.id)} style={smallButton}>Confirm</button>:<span style={attentionPill}>Needs decision</span>}</td>
              </tr>;
            })}</tbody>
          </table></div>}
        </div>;
      })}
    </div>

    <div style={{padding:"13px 17px",borderTop:"1px solid #e3eaee",fontSize:11,color:"#637887",display:"flex",justifyContent:"space-between",gap:12,flexWrap:"wrap"}}>
      <span>{confirmed===total?"BOQ meaning is fully reviewed. Next: rates and materials.":"Review the remaining highlighted decisions before rates/material recipes become authoritative."}</span>
      <strong style={{color:confirmed===total?"#16825c":"#775c18"}}>{confirmed===total?"Ready for Rate Engine":"Review in progress"}</strong>
    </div>
  </section>;
}

const th:React.CSSProperties={padding:"9px 10px",textAlign:"left",fontWeight:900,background:"#fbfcfd"};
const td:React.CSSProperties={padding:"9px 10px",verticalAlign:"top",fontSize:10,color:"#647887"};
const select:React.CSSProperties={width:"100%",minWidth:145,border:"1px solid #cfdce4",borderRadius:8,padding:"7px 8px",fontSize:10,background:"#fff",color:"#29495f"};
const primaryButton:React.CSSProperties={border:0,borderRadius:10,padding:"9px 11px",background:"#0b668f",color:"#fff",fontSize:10,fontWeight:900,cursor:"pointer"};
const secondaryButton:React.CSSProperties={border:"1px solid #aac6d7",borderRadius:10,padding:"8px 10px",background:"#fff",color:"#0b668f",fontSize:9,fontWeight:900,cursor:"pointer"};
const smallButton:React.CSSProperties={border:0,borderRadius:8,padding:"6px 8px",background:"#0b668f",color:"#fff",fontSize:9,fontWeight:900,cursor:"pointer"};
const confirmedPill:React.CSSProperties={display:"inline-block",borderRadius:999,padding:"5px 8px",background:"#e4f5ed",color:"#176247",fontSize:9,fontWeight:900};
const attentionPill:React.CSSProperties={display:"inline-block",borderRadius:999,padding:"5px 8px",background:"#fff0c9",color:"#775c18",fontSize:9,fontWeight:900};
