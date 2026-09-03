import { detectBoqHeaderRow, mapBoqHeaderRow, type BoqColumnMap } from "./boq-column-mapping.ts";

export type ParsedWorkbookSheet = { name: string; rows: unknown[][] };
export type BoqImportWarning = { sheet: string; row?: number; message: string };
export type ImportedBoqItem = {id:string;itemNo?:string;description:string;unit:string;quantity:number;rate?:number|null;amount?:number|null;materialBreakdown:{status:"needs_review";materials:[];assumptions:string[]}};
export type ImportedBoqSection = {id:string;code?:string;title:string;context:string[];items:ImportedBoqItem[]};
export type ImportedSectionedBoq = {id:string;name:string;currency:string;sections:ImportedBoqSection[]};
export type ParsedBoqWorkbook = {boq:ImportedSectionedBoq;warnings:BoqImportWarning[];recognizedSheets:string[];skippedSheets:string[];itemCount:number};

const summaryPattern=/^(sub\s*total|subtotal|total|grand\s*total|bill\s*total|carried\s+(to|forward)|brought\s+forward|collection|summary|page\s*total)\b/i;
const carriedSummaryPattern=/\b(carried\s+to\s+summary|bill\s*(nr\.?|no\.?|number)?\s*\d*\s*total|grand\s+total)\b/i;
const notePattern=/^(note|notes|information|description shall|all rates|rates shall|contractor shall|the contractor|allow for)\b/i;
const namedTradePattern=/^(preliminaries|substructure|superstructure|concrete|reinforcement|formwork|blockwork|masonry|structural steel|roofing|doors?|windows?|glazing|plastering|screeding|floor finishes?|wall finishes?|ceilings?|ceiling finishes?|painting|decoration|joinery|plumbing|sanitary|electrical|mechanical|hvac|external works?)\b/i;
const text=(value:unknown)=>String(value??"").replace(/\s+/g," ").trim();
function number(value:unknown):number|null{if(typeof value==="number"&&Number.isFinite(value))return value;let raw=text(value);if(!raw||raw==="-"||raw==="--"||/^n\/?a$/i.test(raw))return null;const negative=/^\(.*\)$/.test(raw);raw=raw.replace(/[₦$€£,]/g,"").replace(/\b(ngn|usd|eur|gbp)\b/gi,"").replace(/[()\s]/g,"");if(!raw||!/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(raw))return null;const n=Number(raw);if(!Number.isFinite(n))return null;return negative?-Math.abs(n):n;}
const cell=(row:unknown[],index:number|undefined)=>index===undefined?undefined:row[index];
const nonEmpty=(row:unknown[])=>row.map(text).filter(Boolean);
function codeFromTitle(title:string){const m=title.match(/^\s*((?:\d{1,2}|[A-Z])(?:[.\-]\d+)?)\s*[:.\-–—)]\s+/i);return m?.[1];}
function cleanSectionTitle(title:string){return title.replace(/^\s*((?:section|bill)\s*(?:no\.?\s*)?)?([A-Z]|\d+(?:\.\d+)*)?\s*[:.\-–—)]?\s*/i,full=>/^(section|bill)\b/i.test(full.trim())||/^\d+[.\-:)]/.test(full.trim())?"":full).trim()||title.trim();}
function isRepeatedHeader(row:unknown[]){const mapped=mapBoqHeaderRow(row);return mapped.description!==undefined&&Object.keys(mapped).length>=3;}
function isStrongSectionTitle(title:string){const value=title.trim();if(!value||value.length>140||notePattern.test(value)||summaryPattern.test(value)||carriedSummaryPattern.test(value))return false;if(/^(section|bill|element)\s*(nr\.?|no\.?|number)?\s*[A-Z0-9]/i.test(value))return true;if(/^(cf|m|k|l|p|q|r|s|t)\d{1,3}\s*[:.\-–—]/i.test(value))return true;if(namedTradePattern.test(value))return true;const letters=value.replace(/[^A-Za-z]/g,"");return letters.length>=3&&value===value.toUpperCase()&&value.length<=90;}
function likelySection(row:unknown[],columns:BoqColumnMap):string|null{const values=nonEmpty(row);if(!values.length||values.length>3)return null;const title=text(cell(row,columns.description))||values[0];if(!isStrongSectionTitle(title))return null;const qty=number(cell(row,columns.quantity));const rate=number(cell(row,columns.rate));const amount=number(cell(row,columns.amount));const unit=text(cell(row,columns.unit));if(qty!==null||rate!==null||amount!==null||unit)return null;return title;}
function contextText(row:unknown[]):string|null{const values=nonEmpty(row);if(!values.length||values.length>3)return null;const value=values.join(" ");if(!value||value.length>1800||/^information$/i.test(value)||summaryPattern.test(value)||carriedSummaryPattern.test(value)||isRepeatedHeader(row))return null;return value;}
function pushContext(context:string[],value:string|null){if(!value)return;const clean=text(value);if(!clean||context.includes(clean))return;context.push(clean);while(context.length>10)context.shift();}
function precedingSectionBundle(rows:unknown[][],headerRowIndex:number,columns:BoqColumnMap){const start=Math.max(0,headerRowIndex-14);let title:string|null=null;const context:string[]=[];for(let r=start;r<headerRowIndex;r++){const row=rows[r]??[];const candidate=likelySection(row,columns);if(candidate){if(title)pushContext(context,title);title=candidate;continue;}pushContext(context,contextText(row));}return{title,context};}
const safeId=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||"item";
function makeSection(sheetName:string,title:string,index:number,context:string[]=[]):ImportedBoqSection{const clean=cleanSectionTitle(title||sheetName||"General");return{id:`sec-${safeId(sheetName)}-${index+1}`,code:codeFromTitle(title),title:clean,context:[...context],items:[]};}

function parseSheet(sheet:ParsedWorkbookSheet,sheetIndex:number,warnings:BoqImportWarning[]):ImportedBoqSection[]|null{
  const header=detectBoqHeaderRow(sheet.rows,60);if(!header)return null;
  const sections:ImportedBoqSection[]=[];const before=precedingSectionBundle(sheet.rows,header.rowIndex,header.columns);const initialTitle=before.title??(sheet.name||"General");let current=makeSection(sheet.name,initialTitle,0,before.context);let explicitSectionSeen=initialTitle!==(sheet.name||"General");let itemIndex=0;
  for(let r=header.rowIndex+1;r<sheet.rows.length;r++){
    const row=sheet.rows[r]??[];const values=nonEmpty(row);if(!values.length)continue;if(isRepeatedHeader(row))continue;
    const sectionTitle=likelySection(row,header.columns);
    if(sectionTitle){const carry:string[]=[];if(current.items.length)sections.push(current);else{for(const entry of current.context)pushContext(carry,entry);pushContext(carry,current.title);}explicitSectionSeen=true;current=makeSection(sheet.name,sectionTitle,sections.length,carry);continue;}
    const description=text(cell(row,header.columns.description));const serial=text(cell(row,header.columns.serial));const unitRaw=text(cell(row,header.columns.unit));const qtyRaw=number(cell(row,header.columns.quantity));const rate=number(cell(row,header.columns.rate));const amountRaw=number(cell(row,header.columns.amount));const combined=description||values.join(" ");const hasMeasuredIdentity=Boolean(description)&&(qtyRaw!==null||Boolean(unitRaw)||rate!==null||Boolean(serial));
    if((summaryPattern.test(combined)||carriedSummaryPattern.test(combined))&&!hasMeasuredIdentity)continue;
    if(!description){const context=contextText(row);if(context){pushContext(current.context,context);continue;}if(!notePattern.test(combined))warnings.push({sheet:sheet.name,row:r+1,message:"Row has content but no recognized description; kept out of the BOQ pending review."});continue;}
    const hasCommercialOrMeasuredData=qtyRaw!==null||Boolean(unitRaw)||rate!==null||amountRaw!==null||Boolean(serial);
    if(!hasCommercialOrMeasuredData){pushContext(current.context,description);continue;}
    let quantity=qtyRaw;let unit=unitRaw;
    if(quantity===null){const looksLumpSum=/^(ls|l\/s|lump\s*sum|sum|item|lot|nr|no)$/i.test(unitRaw);if(looksLumpSum||amountRaw!==null||rate!==null){quantity=1;warnings.push({sheet:sheet.name,row:r+1,message:`No numeric quantity was found for “${description.slice(0,70)}”; quantity 1 is shown for review.`});}else{quantity=0;warnings.push({sheet:sheet.name,row:r+1,message:`No numeric quantity was found for “${description.slice(0,70)}”; quantity needs review.`});}}
    if(!unit){unit="item";warnings.push({sheet:sheet.name,row:r+1,message:`No unit was found for “${description.slice(0,70)}”; unit is shown as “item” for review.`});}
    const amount=amountRaw??(rate!==null?quantity*rate:null);if(rate!==null&&amountRaw!==null&&Math.abs(quantity*rate-amountRaw)>.05)warnings.push({sheet:sheet.name,row:r+1,message:`Amount for “${description.slice(0,70)}” does not equal Qty × Rate; imported values were preserved for review.`});
    itemIndex++;current.items.push({id:`item-${safeId(sheet.name)}-${r+1}-${itemIndex}`,itemNo:serial||undefined,description,unit,quantity,rate,amount,materialBreakdown:{status:"needs_review",materials:[],assumptions:["Material recipe has not yet been confirmed for this imported BOQ item."]}});
  }
  if(current.items.length)sections.push(current);if(!sections.length)return null;if(!explicitSectionSeen&&sections.length===1)sections[0].title=sheet.name||"General";return sections;
}

export function parseBoqWorkbookSheets(sheets:ParsedWorkbookSheet[],fileName="Imported BOQ"):ParsedBoqWorkbook{const warnings:BoqImportWarning[]=[];const sections:ImportedBoqSection[]=[];const recognizedSheets:string[]=[];const skippedSheets:string[]=[];sheets.forEach((sheet,index)=>{const parsed=parseSheet(sheet,index,warnings);if(!parsed){skippedSheets.push(sheet.name);return;}recognizedSheets.push(sheet.name);for(const section of parsed){section.id=`${section.id}-${sections.length+1}`;sections.push(section);}});const baseName=fileName.replace(/\.(xlsx|xls|csv)$/i,"").trim()||"Imported BOQ";const itemCount=sections.reduce((sum,section)=>sum+section.items.length,0);return{boq:{id:`import-${safeId(baseName)}-${itemCount}`,name:baseName,currency:"NGN",sections},warnings,recognizedSheets,skippedSheets,itemCount};}
