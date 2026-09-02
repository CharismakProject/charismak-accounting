export type Supply="contractor"|"client"|"specialist"|"labour_only"|"unknown";
export type MaterialComponent={material:string;unit:string;baseQuantity:number;wastePercent:number;totalQuantity:number;note?:string};
export type MaterialBreakdown={status:"available"|"needs_review"|"not_applicable";recipeName:string;materials:MaterialComponent[];assumptions:string[]};
export type MobileMaterialDecision={recipeFamily:string;supplyResponsibility:Supply;confirmed:boolean};
export type MobileMaterialItem={id:string;description:string;unit:string;quantity:number};

const round=(n:number,d=3)=>{const f=10**d;return Math.round((n+Number.EPSILON)*f)/f;};
const norm=(u:string)=>u.trim().toLowerCase().replace(/²/g,"2").replace(/\s+/g,"");
const area=(u:string)=>["m2","sqm","sq.m","sqm.","m^2"].includes(norm(u));
const kg=(u:string)=>["kg","kilogram","kilograms"].includes(norm(u));
const tonne=(u:string)=>["t","ton","tons","tonne","tonnes","mt"].includes(norm(u));
const component=(material:string,unit:string,base:number,waste=0,note?:string):MaterialComponent=>({material,unit,baseQuantity:round(base),wastePercent:waste,totalQuantity:round(base*(1+waste/100)),note});
const review=(name:string,reason:string):MaterialBreakdown=>({status:"needs_review",recipeName:name,materials:[],assumptions:[reason]});

function mortar(wetM3:number,wastePercent:number,mixCement:number,mixSand:number,prefix:string):MaterialComponent[]{
  const dry=wetM3*(1+wastePercent/100)*1.33;
  const parts=mixCement+mixSand;
  const cementBags=(dry*(mixCement/parts)*1440)/50;
  const sandM3=dry*(mixSand/parts);
  return [component("Cement","50kg bag",cementBags,0,`${prefix}: reviewed mix assumption.`),component("Sharp sand","m³",sandM3,0,`${prefix}: reviewed mix assumption.`)];
}

export function calculateMobileMaterials(item:MobileMaterialItem,decision:MobileMaterialDecision):MaterialBreakdown{
  if(!decision.confirmed)return review("Unconfirmed recipe","Confirm this BOQ item before calculating materials.");
  if(decision.supplyResponsibility==="client")return{status:"not_applicable",recipeName:"Client supplied",materials:[],assumptions:["Excluded from contractor material totals because this item is client supplied."]};
  if(decision.supplyResponsibility==="labour_only")return{status:"not_applicable",recipeName:"Labour / installation only",materials:[],assumptions:["No contractor material quantity is generated for labour-only work."]};
  if(decision.recipeFamily==="not_applicable")return{status:"not_applicable",recipeName:"No material recipe required",materials:[],assumptions:[]};
  if(decision.recipeFamily==="needs_review")return review("Recipe needs review","Choose a material recipe family first.");

  if(["blockwork_225","blockwork_150","blockwork"].includes(decision.recipeFamily)){
    if(!area(item.unit))return review("Blockwork",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    const baseBlocks=item.quantity*10;
    const mortarWet=baseBlocks*.0015;
    const blockName=decision.recipeFamily==="blockwork_150"?"150mm hollow blocks":decision.recipeFamily==="blockwork_225"?"225mm hollow blocks":"Hollow blocks";
    return{status:"available",recipeName:decision.recipeFamily==="blockwork_150"?"150mm blockwork":decision.recipeFamily==="blockwork_225"?"225mm blockwork":"Blockwork",materials:[component(blockName,"pcs",baseBlocks,5),...mortar(mortarWet,10,1,6,"Blockwork mortar")],assumptions:["10 blocks per m².","5% block waste.","0.0015 m³ wet mortar per block + 10% mortar allowance.","Mortar mix 1:6; dry-volume factor 1.33; 50kg cement bags."]};
  }

  if(decision.recipeFamily==="plastering"){
    if(!area(item.unit))return review("Plastering",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    return{status:"available",recipeName:"Plastering",materials:mortar(item.quantity*.012,10,1,4,"Plaster mortar"),assumptions:["12mm average thickness.","1:4 cement:sand mix.","10% wet-mortar allowance; dry-volume factor 1.33."]};
  }

  if(decision.recipeFamily==="screeding"){
    if(!area(item.unit))return review("Screeding",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    return{status:"available",recipeName:"Floor screeding",materials:mortar(item.quantity*.025,10,1,4,"Screed mortar"),assumptions:["25mm average screed thickness.","1:4 cement:sand mix.","10% wet-mortar allowance; dry-volume factor 1.33."]};
  }

  if(decision.recipeFamily==="floor_tiling"||decision.recipeFamily==="wall_tiling"){
    if(!area(item.unit))return review("Tiling",`V1 expects an area unit such as m²; this line uses ${item.unit}.`);
    return{status:"available",recipeName:decision.recipeFamily==="floor_tiling"?"Floor tiling":"Wall tiling",materials:[component(decision.recipeFamily==="floor_tiling"?"Floor tile finish":"Wall tile finish","m²",item.quantity,5,"Adhesive/grout are not guessed without tile size and product.")],assumptions:["5% cutting/waste allowance.","Adhesive and grout remain parameter-required."]};
  }

  if(decision.recipeFamily==="reinforcement"){
    if(!kg(item.unit)&&!tonne(item.unit))return review("Reinforcement",`V1 expects kg or tonnes; this line uses ${item.unit}.`);
    const steel=tonne(item.unit)?item.quantity*1000:item.quantity;
    return{status:"available",recipeName:"Measured reinforcement",materials:[component("Reinforcement steel","kg",steel,5),component("Binding wire","kg",steel*.015,0)],assumptions:["5% reinforcement waste.","Binding wire at 1.5% of measured reinforcement."]};
  }

  if(decision.recipeFamily==="direct_supply"){
    if(decision.supplyResponsibility!=="contractor")return review("Direct supply item","Direct supply is included only when contractor supply is confirmed.");
    return{status:"available",recipeName:"Direct supply item",materials:[component(item.description,item.unit||"item",item.quantity,0,"BOQ quantity used directly; no hidden conversion.")],assumptions:["Confirmed contractor direct-supply quantity."]};
  }

  const label:Record<string,string>={concrete:"Concrete",formwork:"Formwork",painting:"Painting",roofing:"Roofing",ceiling:"Ceiling",plumbing_installation:"Plumbing installation",electrical_installation:"Electrical installation",external_works:"External works"};
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
