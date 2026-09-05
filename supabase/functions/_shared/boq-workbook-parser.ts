import { detectBoqHeaderRow, mapBoqHeaderRow, type BoqColumnMap, type DetectedBoqHeader } from "./boq-column-mapping.ts";

export type ParsedWorkbookSheet = { name: string; rows: unknown[][] };
export type BoqImportWarning = { sheet: string; row?: number; message: string };
export type ImportedBoqItem = {id:string;itemNo?:string;description:string;unit:string;quantity:number;rate?:number|null;amount?:number|null;materialBreakdown:{status:"needs_review";materials:[];assumptions:string[]}};
export type ImportedBoqSection = {id:string;code?:string;title:string;context:string[];items:ImportedBoqItem[]};
export type ImportedSectionedBoq = {id:string;name:string;currency:string;sections:ImportedBoqSection[]};
export type ParsedBoqWorkbook = {boq:ImportedSectionedBoq;warnings:BoqImportWarning[];recognizedSheets:string[];supportSheets:string[];legacySheets:string[];skippedSheets:string[];itemCount:number};

type SheetRole = "detail" | "legacy" | "support" | "non_boq";

const summaryPattern=/^(sub\s*total|subtotal|total|grand\s*total|bill\s*total|carried\s+(to|forward)|brought\s+forward|collection|summary|page\s*total)\b/i;
const carriedSummaryPattern=/\b(carried\s+to\s+summary|bill\s*(nr\.?|no\.?|number)?\s*\d*\s*total|grand\s+total)\b/i;
const notePattern=/^(note|notes|information|description shall|all rates|rates shall|contractor shall|the contractor|allow for)\b/i;
const namedTradePattern=/^(preliminaries|substructure|superstructure|concrete|reinforcement|formwork|blockwork|masonry|structural steel|roofing|doors?|windows?|glazing|plastering|screeding|floor finishes?|wall finishes?|ceilings?|ceiling finishes?|painting|decoration|joinery|plumbing|sanitary|electrical|mechanical|hvac|external works?)\b/i;
const supportNamePattern=/\b(cover|grand\s+summary|general\s+summary|gen\s+summ|summary|commercial\s+summary|procurement|steel\s+schedule|material\s+schedule|materials\s+schedule|material\s+calculations?|qty\s+breakdown|quantity\s+breakdown|taking\s+off|take\s*off|rate\s+assumptions?|assumptions?|cost\s+review|savings|inputs?|terms?|legend)\b/i;
const text=(value:unknown)=>String(value??"").replace(/\s+/g," ").trim();
function number(value:unknown):number|null{if(typeof value==="number"&&Number.isFinite(value))return value;let raw=text(value);if(!raw||raw==="-"||raw==="--"||/^n\/?a$/i.test(raw))return null;const negative=/^\(.*\)$/.test(raw);raw=raw.replace(/[₦$€£,]/g,"").replace(/\b(ngn|usd|eur|gbp)\b/gi,"").replace(/[()\s]/g,"");if(!raw||!/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(raw))return null;const n=Number(raw);if(!Number.isFinite(n))return null;return negative?-Math.abs(n):n;}
const cell=(row:unknown[],index:number|undefined)=>index===undefined?undefined:row[index];
const nonEmpty=(row:unknown[])=>row.map(text).filter(Boolean);
const normalized=(value:string)=>text(value).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
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

function earlySheetText(sheet:ParsedWorkbookSheet,maxRows=12){return sheet.rows.slice(0,maxRows).flatMap(row=>nonEmpty(row)).join(" ");}
function isSupportSheet(sheet:ParsedWorkbookSheet){
  const name=sheet.name.trim();
  if(supportNamePattern.test(name))return true;
  const early=earlySheetText(sheet,6);
  return /^(cover|summary|grand summary|commercial summary|rate assumptions?)\b/i.test(early.trim());
}
function isLegacyHeaderlessBill(sheet:ParsedWorkbookSheet){
  const name=normalized(sheet.name);const early=normalized(earlySheetText(sheet,16));
  if(/\b(taking off|take off|schedule|summary|procurement|calculation)\b/.test(name))return false;
  return /\bprelim(inaries|s)?\b/.test(name)||(/\bbill\s*(nr|no|number)?\s*\d+\b/.test(early)&&/\bprelim(inaries|s)?\b/.test(early));
}
function classifySheet(sheet:ParsedWorkbookSheet):{role:SheetRole;header:DetectedBoqHeader|null}{
  if(isSupportSheet(sheet))return{role:"support",header:null};
  const header=detectBoqHeaderRow(sheet.rows,60);
  if(header)return{role:"detail",header};
  if(isLegacyHeaderlessBill(sheet))return{role:"legacy",header:null};
  return{role:"non_boq",header:null};
}

function switchRowSection(sheetName:string,rowSection:string,sections:ImportedBoqSection[],current:ImportedBoqSection){
  const nextTitle=cleanSectionTitle(rowSection);if(!nextTitle||normalized(nextTitle)===normalized(current.title))return current;
  if(current.items.length)sections.push(current);
  return makeSection(sheetName,rowSection,sections.length,current.items.length?[]:current.context);
}

function parseDetailSheet(sheet:ParsedWorkbookSheet,header:DetectedBoqHeader,warnings:BoqImportWarning[]):ImportedBoqSection[]|null{
  const sections:ImportedBoqSection[]=[];const before=precedingSectionBundle(sheet.rows,header.rowIndex,header.columns);const initialTitle=before.title??(sheet.name||"General");let current=makeSection(sheet.name,initialTitle,0,before.context);let explicitSectionSeen=initialTitle!==(sheet.name||"General");let itemIndex=0;
  for(let r=header.rowIndex+1;r<sheet.rows.length;r++){
    const row=sheet.rows[r]??[];const values=nonEmpty(row);if(!values.length)continue;if(isRepeatedHeader(row))continue;
    const sectionTitle=likelySection(row,header.columns);
    if(sectionTitle){const carry:string[]=[];if(current.items.length)sections.push(current);else{for(const entry of current.context)pushContext(carry,entry);pushContext(carry,current.title);}explicitSectionSeen=true;current=makeSection(sheet.name,sectionTitle,sections.length,carry);continue;}
    const baseDescription=text(cell(row,header.columns.description));const specification=text(cell(row,header.columns.specification));const description=baseDescription&&specification&&normalized(specification)!==normalized(baseDescription)?`${baseDescription} — ${specification}`:baseDescription;const serial=text(cell(row,header.columns.serial));const rowSection=text(cell(row,header.columns.section));const unitRaw=text(cell(row,header.columns.unit));const qtyRaw=number(cell(row,header.columns.quantity));const rate=number(cell(row,header.columns.rate));const amountRaw=number(cell(row,header.columns.amount));const combined=description||values.join(" ");const hasMeasuredIdentity=Boolean(baseDescription)&&(qtyRaw!==null||Boolean(unitRaw)||rate!==null||Boolean(serial));
    if((summaryPattern.test(combined)||carriedSummaryPattern.test(combined))&&!hasMeasuredIdentity)continue;
    if(!baseDescription){const context=contextText(row);if(context){pushContext(current.context,context);continue;}if(!notePattern.test(combined))warnings.push({sheet:sheet.name,row:r+1,message:"Row has content but no recognized description; kept out of the BOQ pending review."});continue;}
    const hasCommercialOrMeasuredData=qtyRaw!==null||Boolean(unitRaw)||rate!==null||amountRaw!==null||Boolean(serial);
    if(!hasCommercialOrMeasuredData){pushContext(current.context,description);continue;}
    if(rowSection){current=switchRowSection(sheet.name,rowSection,sections,current);explicitSectionSeen=true;}
    let quantity=qtyRaw;let unit=unitRaw;
    if(quantity===null){const looksLumpSum=/^(ls|l\/s|lump\s*sum|sum|item|lot|nr|nrs|no|number)$/i.test(unitRaw);if(looksLumpSum||amountRaw!==null||rate!==null){quantity=1;warnings.push({sheet:sheet.name,row:r+1,message:`No numeric quantity was found for “${description.slice(0,70)}”; quantity 1 is shown for review.`});}else{quantity=0;warnings.push({sheet:sheet.name,row:r+1,message:`No numeric quantity was found for “${description.slice(0,70)}”; quantity needs review.`});}}
    if(!unit){unit="item";warnings.push({sheet:sheet.name,row:r+1,message:`No unit was found for “${description.slice(0,70)}”; unit is shown as “item” for review.`});}
    const amount=amountRaw??(rate!==null?quantity*rate:null);if(rate!==null&&amountRaw!==null&&Math.abs(quantity*rate-amountRaw)>.05)warnings.push({sheet:sheet.name,row:r+1,message:`Amount for “${description.slice(0,70)}” does not equal Qty × Rate; imported values were preserved for review.`});
    itemIndex++;current.items.push({id:`item-${safeId(sheet.name)}-${r+1}-${itemIndex}`,itemNo:serial||undefined,description,unit,quantity,rate,amount,materialBreakdown:{status:"needs_review",materials:[],assumptions:["Material recipe has not yet been confirmed for this imported BOQ item."]}});
  }
  if(current.items.length)sections.push(current);if(!sections.length)return null;if(!explicitSectionSeen&&sections.length===1)sections[0].title=sheet.name||"General";return sections;
}

function legacyItemCode(value:unknown){const candidate=text(value);if(!candidate)return null;if(/^[A-Z](?:\d+)?[.)]?$/i.test(candidate))return candidate.replace(/[.)]$/g,"");if(/^\d+(?:\.\d+)*[A-Z]?[.)]?$/i.test(candidate))return candidate.replace(/[.)]$/g,"");return null;}
function legacyDescriptionFromRow(row:unknown[],codeIndex:number){for(let c=codeIndex+1;c<row.length;c++){const value=text(row[c]);if(value&&number(row[c])===null&&value.length>3)return value;}return "";}
function legacyAmount(rows:unknown[][],start:number,end:number,codeIndex:number){let found:number|null=null;let foundColumn=-1;for(let r=start;r<end;r++){const row=rows[r]??[];for(let c=codeIndex+1;c<row.length;c++){const value=number(row[c]);if(value!==null&&c>=foundColumn){found=value;foundColumn=c;}}}return found;}
function parseLegacySheet(sheet:ParsedWorkbookSheet,warnings:BoqImportWarning[]):ImportedBoqSection[]|null{
  const starts:Array<{row:number;codeIndex:number;code:string;description:string}>=[];
  for(let r=0;r<sheet.rows.length;r++){const row=sheet.rows[r]??[];for(let c=0;c<Math.min(row.length,4);c++){const code=legacyItemCode(row[c]);if(!code)continue;const description=legacyDescriptionFromRow(row,c);if(description){starts.push({row:r,codeIndex:c,code,description});break;}}}
  if(starts.length<2)return null;
  let title="Preliminaries";const firstRow=starts[0].row;for(let r=Math.max(0,firstRow-8);r<firstRow;r++){for(const value of nonEmpty(sheet.rows[r]??[])){if(isStrongSectionTitle(value)&&!/bill\s*(nr|no|number)?/i.test(value)){title=value;}}}
  const section=makeSection(sheet.name,title,0,[]);warnings.push({sheet:sheet.name,message:"Legacy headerless bill layout was inferred conservatively. Quantities default to 1 LS and every recovered line must be reviewed before Project staging."});
  starts.forEach((start,index)=>{const end=starts[index+1]?.row??sheet.rows.length;const parts:string[]=[start.description];for(let r=start.row+1;r<end;r++){const row=sheet.rows[r]??[];for(let c=start.codeIndex+1;c<row.length;c++){const value=text(row[c]);if(!value||number(row[c])!==null||summaryPattern.test(value)||carriedSummaryPattern.test(value))continue;if(!parts.includes(value)&&value.length>2)parts.push(value);}}
    const description=parts.join(" ").slice(0,1800);const amount=legacyAmount(sheet.rows,start.row,end,start.codeIndex);section.items.push({id:`item-${safeId(sheet.name)}-${start.row+1}-${index+1}`,itemNo:start.code,description,unit:"LS",quantity:1,rate:amount,amount,materialBreakdown:{status:"needs_review",materials:[],assumptions:["Legacy preliminaries layout inferred as a lump-sum line; review description, amount and scope before use."]}});if(amount===null)warnings.push({sheet:sheet.name,row:start.row+1,message:`Legacy item ${start.code} has no confidently associated amount and remains unpriced.`});});
  return section.items.length?[section]:null;
}

export function parseBoqWorkbookSheets(sheets:ParsedWorkbookSheet[],fileName="Imported BOQ"):ParsedBoqWorkbook{
  const warnings:BoqImportWarning[]=[];const sections:ImportedBoqSection[]=[];const recognizedSheets:string[]=[];const supportSheets:string[]=[];const legacySheets:string[]=[];const skippedSheets:string[]=[];
  sheets.forEach(sheet=>{const classification=classifySheet(sheet);if(classification.role==="support"){supportSheets.push(sheet.name);skippedSheets.push(sheet.name);return;}if(classification.role==="non_boq"){skippedSheets.push(sheet.name);return;}const parsed=classification.role==="legacy"?parseLegacySheet(sheet,warnings):parseDetailSheet(sheet,classification.header!,warnings);if(!parsed){skippedSheets.push(sheet.name);return;}recognizedSheets.push(sheet.name);if(classification.role==="legacy")legacySheets.push(sheet.name);for(const section of parsed){section.id=`${section.id}-${sections.length+1}`;sections.push(section);}});
  const baseName=fileName.replace(/\.(xlsx|xls|csv)$/i,"").trim()||"Imported BOQ";const itemCount=sections.reduce((sum,section)=>sum+section.items.length,0);if(!itemCount&&supportSheets.length)warnings.push({sheet:supportSheets[0],message:"Only support/summary schedules were found. Upload the primary BOQ or detailed bill rather than a material/procurement/summary workbook."});
  return{boq:{id:`import-${safeId(baseName)}-${itemCount}`,name:baseName,currency:"NGN",sections},warnings,recognizedSheets,supportSheets,legacySheets,skippedSheets,itemCount};
}
