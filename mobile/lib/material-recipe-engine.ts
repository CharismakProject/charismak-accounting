export type Supply="contractor"|"client"|"specialist"|"labour_only"|"unknown";
export type MaterialComponent={material:string;unit:string;baseQuantity:number;wastePercent:number;totalQuantity:number;note?:string};
export type MaterialBreakdown={status:"available"|"needs_review"|"not_applicable";recipeName:string;materials:MaterialComponent[];assumptions:string[]};
export type MobileMaterialDecision={recipeFamily:string;supplyResponsibility:Supply;confirmed:boolean};
export type MobileMaterialItem={id:string;description:string;unit:string;quantity:number;context?:string[]};

const round=(n:number,d=3)=>{const f=10**d;return Math.round((n+Number.EPSILON)*f)/f;};
const norm=(u:string)=>u.trim().toLowerCase().replace(/²/g,"2").replace(/³/g,"3").replace(/\s+/g,"");
const area=(u:string)=>["m2","sqm","sq.m","sqm.","m^2"].includes(norm(u));
const volume=(u:string)=>["m3","cum","cu.m","m^3"].includes(norm(u));
const kg=(u:string)=>["kg","kilogram","kilograms"].includes(norm(u));
const tonne=(u:string)=>["t","ton","tons","tonne","tonnes","mt"].includes(norm(u));
const component=(material:string,unit:string,base:number,waste=0,note?:string):MaterialComponent=>({material,unit,baseQuantity:round(base),wastePercent:waste,totalQuantity:round(base*(1+waste/100)),note});
const review=(name:string,reason:string):MaterialBreakdown=>({status:"needs_review",recipeName:name,materials:[],assumptions:[reason]});
const source=(item:MobileMaterialItem)=>`${item.description} ${(item.context??[]).join(" ")}`.toLowerCase().replace(/\s+/g," ");

function pairMix(text:string,fallback:[number,number]):[number,number]{
  const matches=[...text.matchAll(/(?:mortar|screed|plaster|render|bedding|gauged mortar)?[^\d]{0,30}(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)(?!\s*:)/gi)];
  const match=matches.at(-1);if(!match)return fallback;const a=Number(match[1]),b=Number(match[2]);return a>0&&b>0?[a,b]:fallback;
}
function tripleMix(text:string):[number,number,number]|null{
  const match=text.match(/(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)\s*:\s*(\d+(?:\.\d+)?)/);if(!match)return null;const values:[number,number,number]=[Number(match[1]),Number(match[2]),Number(match[3])];return values.every(v=>v>0)?values:null;
}
function thicknessM(text:string,keywords:RegExp,fallbackMm:number){
  const nearby=text.match(new RegExp(`(\\d+(?:\\.\\d+)?)\\s*mm[^.]{0,55}${keywords.source}|${keywords.source}[^.]{0,55}(\\d+(?:\\.\\d+)?)\\s*mm`,"i"));
  const mm=Number(nearby?.[1]??nearby?.[2]??fallbackMm);return Number.isFinite(mm)&&mm>0?mm/1000:fallbackMm/1000;
}
function mortar(wetM3:number,wastePercent:number,mixCement:number,mixSand:number,prefix:string):MaterialComponent[]{
  const dry=wetM3*(1+wastePercent/100)*1.33;
  const parts=mixCement+mixSand;
  const cementBags=(dry*(mixCement/parts)*1440)/50;
  const sandM3=dry*(mixSand/parts);
  return [component("Cement","50kg bag",cementBags,0,`${prefix}: ${mixCement}:${mixSand} reviewed/detected mix.`),component("Sharp sand","m³",sandM3,0,`${prefix}: ${mixCement}:${mixSand} reviewed/detected mix.`)];
}
function concrete(wetM3:number,mix:[number,number,number]):MaterialComponent[]{
  const dry=wetM3*1.54*1.05;const parts=mix[0]+mix[1]+mix[2];
  return[
    component("Cement","50kg bag",(dry*(mix[0]/parts)*1440)/50,0,`Concrete mix ${mix.join(":")}; dry-volume factor 1.54 + 5% material allowance.`),
    component("Sharp sand","m³",dry*(mix[1]/parts),0,`Concrete mix ${mix.join(":")}.`),
    component("Granite / coarse aggregate","m³",dry*(mix[2]/parts),0,`Concrete mix ${mix.join(":")}.`),
  ];
}

export function calculateMobileMaterials(item:MobileMaterialItem,decision:MobileMaterialDecision):MaterialBreakdown{
  if(!decision.confirmed)return review("Unconfirmed recipe","Accept the clear suggestion or review this exception before calculating materials.");
  if(decision.supplyResponsibility==="client")return{status:"not_applicable",recipeName:"Client supplied",materials:[],assumptions:["Excluded from contractor material totals because this item is client supplied."]};
  if(decision.supplyResponsibility==="labour_only")return{status:"not_applicable",recipeName:"Labour / installation only",materials:[],assumptions:["No contractor material quantity is generated for labour-only work."]};
  if(decision.recipeFamily==="not_applicable")return{status:"not_applicable",recipeName:"No material recipe required",materials:[],assumptions:[]};
  if(decision.recipeFamily==="needs_review")return review("Recipe needs review","Choose a material recipe family first.");

  const text=source(item);

  if(["blockwork_225","blockwork_150","blockwork"].includes(decision.recipeFamily)){
    if(!area(item.unit))return review("Blockwork",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    const baseBlocks=item.quantity*10;
    const wetPerM2=decision.recipeFamily==="blockwork_225"?.015:decision.recipeFamily==="blockwork_150"?.010:.0125;
    const mix=pairMix(text,[1,4]);
    const blockName=decision.recipeFamily==="blockwork_150"?"150mm hollow blocks":decision.recipeFamily==="blockwork_225"?"225mm hollow blocks":"Hollow blocks";
    return{status:"available",recipeName:decision.recipeFamily==="blockwork_150"?"150mm blockwork":decision.recipeFamily==="blockwork_225"?"225mm blockwork":"Blockwork",materials:[component(blockName,"pcs",baseBlocks,5),...mortar(item.quantity*wetPerM2,10,mix[0],mix[1],"Blockwork mortar")],assumptions:["10 blocks per m².","5% block waste.",`${round(wetPerM2,3)} m³ wet mortar per m² + 10% mortar allowance.`,`Mortar mix ${mix[0]}:${mix[1]} from BOQ/context where stated; otherwise 1:4 working assumption.`,`Dry-volume factor 1.33; 50kg cement bags.`]};
  }

  if(decision.recipeFamily==="concrete"){
    if(!volume(item.unit))return review("Concrete",`V1 expects m³/Cum for concrete; this line uses ${item.unit}.`);
    const mix=tripleMix(text);if(!mix)return review("Concrete","Concrete quantity is measured, but the mix ratio is not stated clearly enough to calculate cement, sand and aggregate safely.");
    return{status:"available",recipeName:`Concrete ${mix.join(":")}`,materials:concrete(item.quantity,mix),assumptions:[`Detected concrete mix ${mix.join(":")}.`,"Dry-volume factor 1.54.","5% material allowance.","Cement bulk density 1,440 kg/m³; 50kg bags."]};
  }

  if(decision.recipeFamily==="plastering"){
    if(!area(item.unit))return review("Plastering",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    const thick=thicknessM(text,/plaster|render|floated finish/,15);const mix=pairMix(text,[1,4]);
    return{status:"available",recipeName:"Plastering",materials:mortar(item.quantity*thick,10,mix[0],mix[1],"Plaster mortar"),assumptions:[`${round(thick*1000,1)}mm thickness from BOQ/context where stated; otherwise 15mm working assumption.`,`Cement:sand ${mix[0]}:${mix[1]}.`,`10% wet-mortar allowance; dry-volume factor 1.33.`]};
  }

  if(decision.recipeFamily==="screeding"){
    if(!area(item.unit))return review("Screeding",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    const thick=thicknessM(text,/screed|screeding|bedding/,30);const mix=pairMix(text,[1,6]);
    return{status:"available",recipeName:"Screeding / bedding",materials:mortar(item.quantity*thick,10,mix[0],mix[1],"Screed mortar"),assumptions:[`${round(thick*1000,1)}mm thickness from BOQ/context where stated; otherwise 30mm working assumption.`,`Cement:sand ${mix[0]}:${mix[1]}.`,`10% wet-mortar allowance; dry-volume factor 1.33.`]};
  }

  if(decision.recipeFamily==="floor_tiling"||decision.recipeFamily==="wall_tiling"){
    if(!area(item.unit))return review("Tiling",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    return{status:"available",recipeName:decision.recipeFamily==="floor_tiling"?"Floor tiling":"Wall tiling",materials:[component(decision.recipeFamily==="floor_tiling"?"Floor tile finish":"Wall tile finish","m²",item.quantity,10,"Adhesive/grout are not guessed without the selected product coverage.")],assumptions:["10% cutting/breakage allowance.","Adhesive and grout remain specification/product dependent unless separately measured."]};
  }

  if(decision.recipeFamily==="painting"){
    if(!area(item.unit))return review("Painting",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    const coats=/two undercoats/.test(text)?2:1;const finish=/finishing coat|finish coat|3[- ]coat/.test(text)?1:1;
    const undercoatL=item.quantity*coats/10;const finishL=item.quantity*finish/12;
    return{status:"available",recipeName:"Painting",materials:[component("Undercoat / base paint","L",undercoatL,10),component("Finishing paint","L",finishL,10)],assumptions:[`${coats} undercoat coat${coats===1?"":"s"} at 10 m²/L/coat.`,`${finish} finish coat at 12 m²/L/coat.`,`10% paint allowance. Confirm selected manufacturer's coverage before bulk purchase.`]};
  }

  if(decision.recipeFamily==="reinforcement"){
    if(!kg(item.unit)&&!tonne(item.unit))return review("Reinforcement",`V1 expects kg or tonnes; this line uses ${item.unit}.`);
    const steel=tonne(item.unit)?item.quantity*1000:item.quantity;
    return{status:"available",recipeName:"Measured reinforcement",materials:[component("Reinforcement steel","kg",steel,5),component("Binding wire","kg",steel*.015,0)],assumptions:["5% reinforcement waste.","Binding wire at 1.5% of measured reinforcement."]};
  }

  if(decision.recipeFamily==="roofing"){
    if(area(item.unit))return{status:"available",recipeName:"Roof covering",materials:[component("Roof covering","m²",item.quantity,10,"Includes laps/cutting working allowance; confirm manufacturer/profile before order.")],assumptions:["10% roof-sheet cutting/lap allowance."]};
    return review("Roofing","The measured roof item is not an area covering. Keep ridge/fascia/timber as direct measured supply items or review its recipe.");
  }

  if(decision.recipeFamily==="ceiling"){
    if(area(item.unit)&&/(asbestos|fibre cement|fiber cement)/.test(text))return{status:"available",recipeName:"Fibre-cement ceiling",materials:[component("Fibre-cement ceiling board","m²",item.quantity,10)],assumptions:["10% cutting allowance. Sheet count requires selected sheet size."]};
    return review("Ceiling","POP/gypsum ceiling quantities need the selected system/product coverage before reliable bags, boards and framing can be generated.");
  }

  if(decision.recipeFamily==="direct_supply"){
    if(decision.supplyResponsibility!=="contractor")return review("Direct supply item","Direct supply is included only when contractor supply is confirmed.");
    return{status:"available",recipeName:"Direct supply item",materials:[component(item.description,item.unit||"item",item.quantity,0,"BOQ quantity used directly; no hidden conversion.")],assumptions:["Confirmed contractor direct-supply quantity."]};
  }

  const label:Record<string,string>={formwork:"Formwork",plumbing_installation:"Plumbing installation",electrical_installation:"Electrical installation",external_works:"External works"};
  return review(label[decision.recipeFamily]??"Material recipe","This recipe still needs specification parameters before Charismak can calculate reliable quantities.");
}

export type MobileMaterialSummary={key:string;material:string;unit:string;quantity:number;sources:Array<{itemId:string;description:string;quantity:number}>};
export function summarizeMobileMaterials(items:MobileMaterialItem[],decisions:Record<string,MobileMaterialDecision>):MobileMaterialSummary[]{
  const rows=new Map<string,MobileMaterialSummary>();
  for(const item of items){
    const breakdown=calculateMobileMaterials(item,decisions[item.id]??{recipeFamily:"needs_review",supplyResponsibility:"unknown",confirmed:false});
    if(breakdown.status!=="available")continue;
    for(const m of breakdown.materials){
      const key=`${m.material.toLowerCase()}::${m.unit.toLowerCase()}`;
      const row=rows.get(key)??{key,material:m.material,unit:m.unit,quantity:0,sources:[]};
      row.quantity+=m.totalQuantity;
      row.sources.push({itemId:item.id,description:item.description,quantity:m.totalQuantity});
      rows.set(key,row);
    }
  }
  return [...rows.values()].map(row=>({...row,quantity:round(row.quantity)})).sort((a,b)=>a.material.localeCompare(b.material));
}
