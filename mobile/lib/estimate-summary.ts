import { summarizeMobileMaterials, type MobileMaterialDecision, type MobileMaterialSummary } from "./material-recipe-engine";
import type { MobileEstimateDecision, MobileEstimateReviewSession } from "./estimate-types";

export type MobileCommercialSettings={contingencyPercent:number;overheadPercent:number;profitPercent:number;discountPercent:number;taxPercent:number};
export type MobileInternalBudgetBasis="direct_cost"|"direct_plus_contingency"|"explicit";
export type MobileContractValueBasis="grand_total"|"subtotal_before_tax"|"explicit"|"none";
export type MobileSummaryLine={sectionId:string;sectionTitle:string;itemId:string;itemNo?:string;description:string;quantity:number;unit:string;workingRate:number|null;rateSource:"imported"|"manual"|null;amount:number|null};
export type MobileEstimateSummary={currency:string;directCost:number;contingency:number;overhead:number;profit:number;discount:number;subtotalBeforeTax:number;tax:number;grandTotal:number;unpricedItems:number;settings:MobileCommercialSettings;lines:MobileSummaryLine[];materials:MobileMaterialSummary[]};

export const ZERO_MOBILE_COMMERCIAL_SETTINGS:MobileCommercialSettings={contingencyPercent:0,overheadPercent:0,profitPercent:0,discountPercent:0,taxPercent:0};
const pct=(n:number)=>Number.isFinite(n)?Math.min(100,Math.max(0,n))/100:0;
const round=(n:number)=>Math.round((n+Number.EPSILON)*100)/100;
export const parseMobileRate=(value:string)=>{const cleaned=value.replace(/[,₦$€£\s]/g,"");if(!cleaned.trim())return null;const n=Number(cleaned);return Number.isFinite(n)&&n>=0?n:null;};

export function buildMobileEstimateSummary(session:MobileEstimateReviewSession,settings:MobileCommercialSettings):MobileEstimateSummary{
  const lines:MobileSummaryLine[]=[];
  const items=session.boq.sections.flatMap(section=>section.items.map(item=>({section,item})));
  for(const {section,item} of items){
    const raw=session.rates[item.id]??(item.rate==null?"":String(item.rate));
    const rate=parseMobileRate(raw);
    const amount=rate==null?null:round(item.quantity*rate);
    lines.push({sectionId:section.id,sectionTitle:section.title,itemId:item.id,itemNo:item.itemNo,description:item.description,quantity:item.quantity,unit:item.unit,workingRate:rate,rateSource:rate==null?null:item.rate!=null&&raw===String(item.rate)?"imported":"manual",amount});
  }
  const directCost=round(lines.reduce((sum,line)=>sum+(line.amount??0),0));
  const contingency=round(directCost*pct(settings.contingencyPercent));
  const overhead=round((directCost+contingency)*pct(settings.overheadPercent));
  const profit=round((directCost+contingency+overhead)*pct(settings.profitPercent));
  const discount=round((directCost+contingency+overhead+profit)*pct(settings.discountPercent));
  const subtotalBeforeTax=round(directCost+contingency+overhead+profit-discount);
  const tax=round(subtotalBeforeTax*pct(settings.taxPercent));
  const grandTotal=round(subtotalBeforeTax+tax);
  const materialDecisions:Record<string,MobileMaterialDecision>=Object.fromEntries(Object.entries(session.decisions).map(([id,d])=>[id,{recipeFamily:d.recipeFamily,supplyResponsibility:d.supplyResponsibility,confirmed:d.confirmed}]));
  return{currency:session.boq.currency,directCost,contingency,overhead,profit,discount,subtotalBeforeTax,tax,grandTotal,unpricedItems:lines.filter(line=>line.amount==null).length,settings,lines,materials:summarizeMobileMaterials(items.map(row=>row.item),materialDecisions)};
}

const validCostCode=(code:string)=>/^(0[1-9]|1[0-9]|20)$/.test(code);
const validMoney=(n:number|null|undefined)=>n!=null&&Number.isFinite(n)&&n>=0;
export type MobileProjectPreview={project:{name:string;currency:string;internalCostBudget:number|null;contractValue:number|null};budgetLines:Array<{sourceLineId:string;itemNo?:string;description:string;unit:string;quantity:number;rate:number;amount:number;costCode:string;supplyResponsibility:string}>;allowances:Array<{kind:"contingency"|"other";description:string;amount:number}>;forecastProfit:number|null;issues:string[];readyToStage:boolean};

export function buildMobileProjectPreview(input:{session:MobileEstimateReviewSession;summary:MobileEstimateSummary;projectName:string;internalBudgetBasis:MobileInternalBudgetBasis|null;contractValueBasis:MobileContractValueBasis|null;explicitInternalBudget:number|null;explicitContractValue:number|null}):MobileProjectPreview{
  const {session,summary}=input;const issues:string[]=[];const name=input.projectName.trim();if(!name)issues.push("Enter a project name.");if(summary.unpricedItems)issues.push(`${summary.unpricedItems} BOQ item${summary.unpricedItems===1?" is":"s are"} still unpriced.`);
  const budgetLines:MobileProjectPreview["budgetLines"]=[];
  for(const line of summary.lines){const d=session.decisions[line.itemId] as MobileEstimateDecision|undefined;if(!d?.confirmed){issues.push(`BOQ item ${line.itemNo||line.itemId} is not confirmed.`);continue;}if(!validCostCode(d.costCode)){issues.push(`BOQ item ${line.itemNo||line.itemId} needs a valid cost code.`);continue;}if(d.supplyResponsibility==="unknown"){issues.push(`BOQ item ${line.itemNo||line.itemId} still has unknown supply responsibility.`);continue;}if(line.workingRate==null||line.amount==null)continue;budgetLines.push({sourceLineId:line.itemId,itemNo:line.itemNo,description:line.description,unit:line.unit,quantity:line.quantity,rate:line.workingRate,amount:line.amount,costCode:d.costCode,supplyResponsibility:d.supplyResponsibility});}
  let internalCostBudget:number|null=null;const allowances:MobileProjectPreview["allowances"]=[];
  if(!input.internalBudgetBasis)issues.push("Choose the internal project cost budget basis.");
  else if(input.internalBudgetBasis==="direct_cost")internalCostBudget=summary.directCost;
  else if(input.internalBudgetBasis==="direct_plus_contingency"){internalCostBudget=round(summary.directCost+summary.contingency);if(summary.contingency>0)allowances.push({kind:"contingency",description:`Reviewed contingency (${summary.settings.contingencyPercent}%)`,amount:summary.contingency});}
  else if(!validMoney(input.explicitInternalBudget))issues.push("Enter a valid explicit internal budget.");
  else{internalCostBudget=round(input.explicitInternalBudget!);if(internalCostBudget<summary.directCost)issues.push("Internal budget cannot be below reviewed Direct Cost.");else if(internalCostBudget>summary.directCost)allowances.push({kind:"other",description:"Reviewed project cost reserve",amount:round(internalCostBudget-summary.directCost)});}
  let contractValue:number|null=null;
  if(!input.contractValueBasis)issues.push("Choose the contract-value basis, or choose no contract value yet.");
  else if(input.contractValueBasis==="grand_total")contractValue=summary.grandTotal;
  else if(input.contractValueBasis==="subtotal_before_tax")contractValue=summary.subtotalBeforeTax;
  else if(input.contractValueBasis==="explicit"){if(!validMoney(input.explicitContractValue))issues.push("Enter a valid explicit contract value.");else contractValue=round(input.explicitContractValue!);}
  const unique=[...new Set(issues)];const forecastProfit=contractValue==null||internalCostBudget==null?null:round(contractValue-internalCostBudget);
  return{project:{name,currency:session.boq.currency,internalCostBudget,contractValue},budgetLines,allowances,forecastProfit,issues:unique,readyToStage:unique.length===0&&internalCostBudget!=null};
}

const esc=(v:unknown)=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]!));
const xmlEsc=(v:unknown)=>esc(v).replace(/'/g,"&apos;");
const number=(n:number)=>n.toLocaleString("en-NG",{maximumFractionDigits:3});
const currency=(n:number,code:string)=>new Intl.NumberFormat("en-NG",{style:"currency",currency:code,maximumFractionDigits:2}).format(n);

export function buildMobileEstimateHtml(session:MobileEstimateReviewSession,summary:MobileEstimateSummary){
  const warning=summary.unpricedItems?`<div class="warn">${summary.unpricedItems} BOQ item(s) remain unpriced. Totals are provisional.</div>`:"";
  const boqRows=summary.lines.map(line=>`<tr><td>${esc(line.sectionTitle)}</td><td>${esc(line.itemNo||"")}</td><td>${esc(line.description)}</td><td class="n">${number(line.quantity)} ${esc(line.unit)}</td><td class="n">${line.workingRate==null?"—":currency(line.workingRate,summary.currency)}</td><td class="n">${line.amount==null?"UNPRICED":currency(line.amount,summary.currency)}</td></tr>`).join("");
  const materialRows=summary.materials.map(row=>`<tr><td>${esc(row.material)}</td><td>${esc(row.unit)}</td><td class="n">${number(row.quantity)}</td><td class="n">${row.sources.length}</td></tr>`).join("");
  return`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>@page{size:A4;margin:14mm}body{font-family:Arial,sans-serif;color:#173f5a;font-size:10px}.hero{border-bottom:3px solid #0b668f;padding-bottom:12px}h1{font-size:21px;margin:3px 0}h2{font-size:14px;margin:17px 0 7px}.muted{color:#6b7f8e}.warn{background:#fff4ce;color:#775c18;padding:8px;border-radius:6px;margin:10px 0}.cards{display:flex;gap:7px;margin:12px 0}.card{flex:1;border:1px solid #dbe6ec;border-radius:7px;padding:8px}.label{font-size:8px;color:#718391}.value{font-size:14px;font-weight:700;margin-top:3px}table{width:100%;border-collapse:collapse}th{background:#edf4f8;text-align:left;font-size:8px}th,td{padding:5px;border-bottom:1px solid #e7edf1}.n{text-align:right;white-space:nowrap}.commercial{width:58%;margin-left:auto}.grand td{font-size:13px;font-weight:700;border-top:2px solid #173f5a}.foot{margin-top:16px;color:#718391;font-size:8px}</style></head><body><div class="hero"><div class="muted">${esc(session.companyName)}</div><h1>${esc(session.boq.name)}</h1><div class="muted">Reviewed Charismak App estimate · ${esc(summary.currency)}</div></div>${warning}<div class="cards"><div class="card"><div class="label">DIRECT COST</div><div class="value">${currency(summary.directCost,summary.currency)}</div></div><div class="card"><div class="label">MATERIALS IDENTIFIED</div><div class="value">${summary.materials.length}</div></div><div class="card"><div class="label">GRAND TOTAL</div><div class="value">${currency(summary.grandTotal,summary.currency)}</div></div></div><h2>Commercial Summary</h2><table class="commercial"><tr><td>Direct Cost</td><td class="n">${currency(summary.directCost,summary.currency)}</td></tr><tr><td>Contingency (${summary.settings.contingencyPercent}%)</td><td class="n">${currency(summary.contingency,summary.currency)}</td></tr><tr><td>Overhead (${summary.settings.overheadPercent}%)</td><td class="n">${currency(summary.overhead,summary.currency)}</td></tr><tr><td>Profit (${summary.settings.profitPercent}%)</td><td class="n">${currency(summary.profit,summary.currency)}</td></tr><tr><td>Discount (${summary.settings.discountPercent}%)</td><td class="n">-${currency(summary.discount,summary.currency)}</td></tr><tr><td>Subtotal before tax</td><td class="n">${currency(summary.subtotalBeforeTax,summary.currency)}</td></tr><tr><td>Tax / VAT (${summary.settings.taxPercent}%)</td><td class="n">${currency(summary.tax,summary.currency)}</td></tr><tr class="grand"><td>Grand Total</td><td class="n">${currency(summary.grandTotal,summary.currency)}</td></tr></table><h2>Priced BOQ</h2><table><tr><th>Section</th><th>Item</th><th>Description</th><th class="n">Qty</th><th class="n">Rate</th><th class="n">Amount</th></tr>${boqRows}</table><h2>Material Schedule</h2><table><tr><th>Material</th><th>Unit</th><th class="n">Quantity</th><th class="n">BOQ Sources</th></tr>${materialRows||`<tr><td colspan="4">No reviewed contractor material quantities available yet.</td></tr>`}</table><div class="foot">Direct Cost, commercial additions, contract value and internal project budget remain separate. This export does not post to Money/Accounting.</div></body></html>`;
}

const cell=(v:unknown,t:"String"|"Number"="String")=>`<Cell><Data ss:Type="${t}">${xmlEsc(v)}</Data></Cell>`;
const row=(values:Array<[unknown,("String"|"Number")?]>)=>`<Row>${values.map(([v,t])=>cell(v,t??"String")).join("")}</Row>`;
export function buildMobileEstimateSpreadsheetXml(session:MobileEstimateReviewSession,summary:MobileEstimateSummary){
  const summaryRows=[["Estimate",session.boq.name],["Currency",summary.currency],["Direct Cost",summary.directCost],["Contingency %",summary.settings.contingencyPercent],["Contingency",summary.contingency],["Overhead %",summary.settings.overheadPercent],["Overhead",summary.overhead],["Profit %",summary.settings.profitPercent],["Profit",summary.profit],["Discount %",summary.settings.discountPercent],["Discount",summary.discount],["Subtotal Before Tax",summary.subtotalBeforeTax],["Tax / VAT %",summary.settings.taxPercent],["Tax / VAT",summary.tax],["Grand Total",summary.grandTotal],["Unpriced Items",summary.unpricedItems]].map(([a,b])=>row([[a],[b,typeof b==="number"?"Number":"String"]])).join("");
  const boqRows=[row([["Section"],["Item No"],["Description"],["Quantity"],["Unit"],["Working Rate"],["Rate Source"],["Amount"]]),...summary.lines.map(line=>row([[line.sectionTitle],[line.itemNo??""],[line.description],[line.quantity,"Number"],[line.unit],[line.workingRate??"",line.workingRate==null?"String":"Number"],[line.rateSource??""],[line.amount??"",line.amount==null?"String":"Number"]]))].join("");
  const materialRows=[row([["Material"],["Unit"],["Quantity"],["BOQ Source Count"]]),...summary.materials.map(m=>row([[m.material],[m.unit],[m.quantity,"Number"],[m.sources.length,"Number"]]))].join("");
  return`<?xml version="1.0"?><?mso-application progid="Excel.Sheet"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Estimate Summary"><Table>${summaryRows}</Table></Worksheet><Worksheet ss:Name="Priced BOQ"><Table>${boqRows}</Table></Worksheet><Worksheet ss:Name="Materials"><Table>${materialRows}</Table></Worksheet></Workbook>`;
}

export function serializeMobileProjectPreview(preview:MobileProjectPreview){return JSON.stringify({schemaVersion:1,sourceSystem:"charismak_app_mobile_estimate",reviewed:true,...preview},null,2);}
