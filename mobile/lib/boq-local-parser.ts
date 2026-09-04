import * as XLSX from "xlsx";

export type BoqReviewConfidence = "high" | "medium" | "low";
export type BoqSupplyResponsibility = "contractor" | "client" | "specialist" | "labour_only" | "unknown";
export type BoqRecipeFamily =
  | "blockwork_225" | "blockwork_150" | "blockwork" | "concrete" | "reinforcement" | "formwork"
  | "plastering" | "screeding" | "floor_tiling" | "wall_tiling" | "painting" | "roofing" | "ceiling"
  | "plumbing_installation" | "electrical_installation" | "direct_supply" | "external_works" | "not_applicable" | "needs_review";

export type BoqReviewSuggestion = {
  costCode:string|null;
  costCodeName:string|null;
  recipeFamily:BoqRecipeFamily;
  recipeLabel:string;
  supplyResponsibility:BoqSupplyResponsibility;
  confidence:BoqReviewConfidence;
  requiresAttention:boolean;
  reasons:string[];
};

export type LocalBoqItem = {
  id:string;
  itemNo?:string;
  description:string;
  unit:string;
  quantity:number;
  rate?:number|null;
  amount?:number|null;
  materialBreakdown:{status:"needs_review";materials:[];assumptions:string[]};
  reviewSuggestion?:BoqReviewSuggestion;
};
export type LocalBoqSection = {id:string;code?:string;title:string;context:string[];items:LocalBoqItem[]};
export type LocalSectionedBoq = {id:string;name:string;currency:string;sections:LocalBoqSection[]};
export type BoqImportWarning = {sheet:string;row?:number;message:string};
export type LocalBoqParseResult = {
  boq?:LocalSectionedBoq;
  warnings:BoqImportWarning[];
  recognizedSheets:string[];
  supportSheets:string[];
  legacySheets:string[];
  skippedSheets:string[];
  itemCount:number;
  reviewSummary:{clearItems:number;attentionItems:number;totalItems:number};
  error?:string;
};

type BoqColumnKey = "section" | "serial" | "description" | "specification" | "quantity" | "unit" | "rate" | "amount";
type BoqColumnMap = Partial<Record<BoqColumnKey, number>>;
type DetectedBoqHeader = {rowIndex:number;columns:BoqColumnMap;score:number};
type ParsedWorkbookSheet = {name:string;rows:unknown[][]};
type ParsedBoqWorkbook = {boq:LocalSectionedBoq;warnings:BoqImportWarning[];recognizedSheets:string[];supportSheets:string[];legacySheets:string[];skippedSheets:string[];itemCount:number};
type SheetRole = "detail" | "legacy" | "support" | "non_boq";

const MAX_BYTES=12*1024*1024;
const MAX_SHEETS=24;
const MAX_ROWS_PER_SHEET=8000;
const MAX_COLUMNS=40;
const supported=new Set(["xlsx","xls","csv"]);

const aliases:Record<BoqColumnKey,string[]>={
  section:["section","section name","bill section","element","element name","trade","work section"],
  serial:["s/n","sn","s no","s/no","serial","serial no","serial number","item","item no","item number","no","no.","ref","reference"],
  description:["description","description of work","work description","item description","particulars","details","work item","scope","scope of work"],
  specification:["specification","specification / scope","specification/scope","scope / specification","scope/specification","specification scope","scope specification","work specification","spec"],
  quantity:["qty","quantity","measured qty","measured quantity","qnty","quant","bill qty","boq qty"],
  unit:["unit","uom","unit of measure","unit of measurement","measurement unit"],
  rate:["rate","unit rate","price","unit price","rate/qty","rate per unit","cost rate","quoted rate"],
  amount:["amount","total","total amount","extended amount","extension","line amount","line total","cost","value"],
};
function normalizeHeader(value:unknown){return String(value??"").trim().toLowerCase().replace(/&/g," and ").replace(/[._-]+/g," ").replace(/[^a-z0-9/ ]+/g," ").replace(/\s+/g," ").trim();}
const normalizedAliases=Object.fromEntries(Object.entries(aliases).map(([key,values])=>[key,new Set(values.map(normalizeHeader))])) as Record<BoqColumnKey,Set<string>>;
function matchBoqColumnHeader(value:unknown):BoqColumnKey|null{
  const header=normalizeHeader(value);if(!header)return null;
  for(const key of Object.keys(normalizedAliases) as BoqColumnKey[]){if(normalizedAliases[key].has(header))return key;}
  if(/^(section|section name|bill section|element|element name|trade|work section)$/.test(header))return "section";
  if(/^(s\s*\/\s*n|serial\s*(no|number)?|item\s*(no|number)|ref(erence)?)$/.test(header))return "serial";
  if(/^(specification|specification\s*\/\s*scope|scope\s*\/\s*specification|specification scope|scope specification|work specification|spec)$/.test(header))return "specification";
  if(/description|particulars|scope of work|work item/.test(header))return "description";
  if(/^(qty|quantity|qnty|measured qty|measured quantity|bill qty|boq qty)$/.test(header))return "quantity";
  if(/^(unit|uom|unit of measure|unit of measurement)$/.test(header))return "unit";
  if(/^(rate|unit rate|unit price|price|rate per unit|quoted rate)$/.test(header))return "rate";
  if(/^(amount|total amount|line total|line amount|extended amount|extension|value)$/.test(header))return "amount";
  return null;
}
function mapBoqHeaderRow(row:unknown[]):BoqColumnMap{
  const mapped:BoqColumnMap={};
  row.forEach((value,index)=>{const key=matchBoqColumnHeader(value);if(!key)return;if(key==="rate"||key==="amount"){mapped[key]=index;return;}if(mapped[key]===undefined)mapped[key]=index;});
  return mapped;
}
function detectBoqHeaderRow(rows:unknown[][],maxScanRows=40):DetectedBoqHeader|null{
  let best:DetectedBoqHeader|null=null;
  rows.slice(0,maxScanRows).forEach((row,rowIndex)=>{const columns=mapBoqHeaderRow(row);const keys=Object.keys(columns) as BoqColumnKey[];if(columns.description===undefined)return;let score=keys.length;if(columns.quantity!==undefined)score+=2;if(columns.unit!==undefined)score+=1;if(columns.rate!==undefined)score+=1;if(columns.amount!==undefined)score+=1;if(columns.section!==undefined)score+=1;if(columns.specification!==undefined)score+=1;const hasBoqShape=columns.quantity!==undefined||columns.unit!==undefined||columns.rate!==undefined||columns.amount!==undefined;if(!hasBoqShape)return;if(!best||score>best.score)best={rowIndex,columns,score};});
  return best;
}

const summaryPattern=/^(sub\s*total|subtotal|total|grand\s*total|bill\s*total|carried\s+(to|forward)|brought\s+forward|collection|summary|page\s*total)\b/i;
const carriedSummaryPattern=/\b(carried\s+to\s+summary|bill\s*(nr\.?|no\.?|number)?\s*\d*\s*total|grand\s+total)\b/i;
const notePattern=/^(note|notes|information|description shall|all rates|rates shall|contractor shall|the contractor|allow for)\b/i;
const namedTradePattern=/^(preliminaries|substructure|superstructure|concrete|reinforcement|formwork|blockwork|masonry|structural steel|roofing|doors?|windows?|glazing|plastering|screeding|floor finishes?|wall finishes?|ceilings?|ceiling finishes?|painting|decoration|joinery|plumbing|sanitary|electrical|mechanical|hvac|external works?)\b/i;
const supportNamePattern=/\b(cover|grand\s+summary|general\s+summary|gen\s+summ|summary|commercial\s+summary|procurement|steel\s+schedule|material\s+schedule|materials\s+schedule|material\s+calculations?|qty\s+breakdown|quantity\s+breakdown|taking\s+off|take\s*off|rate\s+assumptions?|assumptions?|cost\s+review|savings|inputs?|terms?|legend)\b/i;
const text=(value:unknown)=>String(value??"").replace(/\s+/g," ").trim();
function asNumber(value:unknown):number|null{if(typeof value==="number"&&Number.isFinite(value))return value;let raw=text(value);if(!raw||raw==="-"||raw==="--"||/^n\/?a$/i.test(raw))return null;const negative=/^\(.*\)$/.test(raw);raw=raw.replace(/[₦$€£,]/g,"").replace(/\b(ngn|usd|eur|gbp)\b/gi,"").replace(/[()\s]/g,"");if(!raw||!/^[-+]?\d*\.?\d+(?:e[-+]?\d+)?$/i.test(raw))return null;const n=Number(raw);if(!Number.isFinite(n))return null;return negative?-Math.abs(n):n;}
const cell=(row:unknown[],index:number|undefined)=>index===undefined?undefined:row[index];
const nonEmpty=(row:unknown[])=>row.map(text).filter(Boolean);
const normalized=(value:string)=>text(value).toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
function codeFromTitle(title:string){const match=title.match(/^\s*((?:\d{1,2}|[A-Z])(?:[.\-]\d+)?)\s*[:.\-–—)]\s+/i);return match?.[1];}
function cleanSectionTitle(title:string){return title.replace(/^\s*((?:section|bill)\s*(?:no\.?\s*)?)?([A-Z]|\d+(?:\.\d+)*)?\s*[:.\-–—)]?\s*/i,full=>/^(section|bill)\b/i.test(full.trim())||/^\d+[.\-:)]/.test(full.trim())?"":full).trim()||title.trim();}
function isRepeatedHeader(row:unknown[]){const mapped=mapBoqHeaderRow(row);return mapped.description!==undefined&&Object.keys(mapped).length>=3;}
function isStrongSectionTitle(title:string){const value=title.trim();if(!value||value.length>140||notePattern.test(value)||summaryPattern.test(value)||carriedSummaryPattern.test(value))return false;if(/^(section|bill|element)\s*(nr\.?|no\.?|number)?\s*[A-Z0-9]/i.test(value))return true;if(/^(cf|m|k|l|p|q|r|s|t)\d{1,3}\s*[:.\-–—]/i.test(value))return true;if(namedTradePattern.test(value))return true;const letters=value.replace(/[^A-Za-z]/g,"");return letters.length>=3&&value===value.toUpperCase()&&value.length<=90;}
function likelySection(row:unknown[],columns:BoqColumnMap):string|null{const values=nonEmpty(row);if(!values.length||values.length>3)return null;const title=text(cell(row,columns.description))||values[0];if(!isStrongSectionTitle(title))return null;const qty=asNumber(cell(row,columns.quantity));const rate=asNumber(cell(row,columns.rate));const amount=asNumber(cell(row,columns.amount));const unit=text(cell(row,columns.unit));if(qty!==null||rate!==null||amount!==null||unit)return null;return title;}
function contextText(row:unknown[]):string|null{const values=nonEmpty(row);if(!values.length||values.length>3)return null;const value=values.join(" ");if(!value||value.length>1800||/^information$/i.test(value)||summaryPattern.test(value)||carriedSummaryPattern.test(value)||isRepeatedHeader(row))return null;return value;}
function pushContext(context:string[],value:string|null){if(!value)return;const clean=text(value);if(!clean||context.includes(clean))return;context.push(clean);while(context.length>10)context.shift();}
function precedingSectionBundle(rows:unknown[][],headerRowIndex:number,columns:BoqColumnMap){const start=Math.max(0,headerRowIndex-14);let title:string|null=null;const context:string[]=[];for(let r=start;r<headerRowIndex;r++){const row=rows[r]??[];const candidate=likelySection(row,columns);if(candidate){if(title)pushContext(context,title);title=candidate;continue;}pushContext(context,contextText(row));}return{title,context};}
const safeId=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,60)||"item";
function makeSection(sheetName:string,title:string,index:number,context:string[]=[]):LocalBoqSection{const clean=cleanSectionTitle(title||sheetName||"General");return{id:`sec-${safeId(sheetName)}-${index+1}`,code:codeFromTitle(title),title:clean,context:[...context],items:[]};}
function earlySheetText(sheet:ParsedWorkbookSheet,maxRows=12){return sheet.rows.slice(0,maxRows).flatMap(row=>nonEmpty(row)).join(" ");}
function isSupportSheet(sheet:ParsedWorkbookSheet){const name=sheet.name.trim();if(supportNamePattern.test(name))return true;const early=earlySheetText(sheet,6);return /^(cover|summary|grand summary|commercial summary|rate assumptions?)\b/i.test(early.trim());}
function isLegacyHeaderlessBill(sheet:ParsedWorkbookSheet){const name=normalized(sheet.name);const early=normalized(earlySheetText(sheet,16));if(/\b(taking off|take off|schedule|summary|procurement|calculation)\b/.test(name))return false;return /\bprelim(inaries|s)?\b/.test(name)||(/\bbill\s*(nr|no|number)?\s*\d+\b/.test(early)&&/\bprelim(inaries|s)?\b/.test(early));}
function classifySheet(sheet:ParsedWorkbookSheet):{role:SheetRole;header:DetectedBoqHeader|null}{if(isSupportSheet(sheet))return{role:"support",header:null};const header=detectBoqHeaderRow(sheet.rows,60);if(header)return{role:"detail",header};if(isLegacyHeaderlessBill(sheet))return{role:"legacy",header:null};return{role:"non_boq",header:null};}
function switchRowSection(sheetName:string,rowSection:string,sections:LocalBoqSection[],current:LocalBoqSection){const nextTitle=cleanSectionTitle(rowSection);if(!nextTitle||normalized(nextTitle)===normalized(current.title))return current;if(current.items.length)sections.push(current);return makeSection(sheetName,rowSection,sections.length,current.items.length?[]:current.context);}

function parseDetailSheet(sheet:ParsedWorkbookSheet,header:DetectedBoqHeader,warnings:BoqImportWarning[]):LocalBoqSection[]|null{
  const sections:LocalBoqSection[]=[];const before=precedingSectionBundle(sheet.rows,header.rowIndex,header.columns);const initialTitle=before.title??(sheet.name||"General");let current=makeSection(sheet.name,initialTitle,0,before.context);let explicitSectionSeen=initialTitle!==(sheet.name||"General");let itemIndex=0;
  for(let r=header.rowIndex+1;r<sheet.rows.length;r++){
    const row=sheet.rows[r]??[];const values=nonEmpty(row);if(!values.length)continue;if(isRepeatedHeader(row))continue;
    const sectionTitle=likelySection(row,header.columns);if(sectionTitle){const carry:string[]=[];if(current.items.length)sections.push(current);else{for(const entry of current.context)pushContext(carry,entry);pushContext(carry,current.title);}explicitSectionSeen=true;current=makeSection(sheet.name,sectionTitle,sections.length,carry);continue;}
    const baseDescription=text(cell(row,header.columns.description));const specification=text(cell(row,header.columns.specification));const description=baseDescription&&specification&&normalized(specification)!==normalized(baseDescription)?`${baseDescription} — ${specification}`:baseDescription;const serial=text(cell(row,header.columns.serial));const rowSection=text(cell(row,header.columns.section));const unitRaw=text(cell(row,header.columns.unit));const qtyRaw=asNumber(cell(row,header.columns.quantity));const rate=asNumber(cell(row,header.columns.rate));const amountRaw=asNumber(cell(row,header.columns.amount));const combined=description||values.join(" ");const hasMeasuredIdentity=Boolean(baseDescription)&&(qtyRaw!==null||Boolean(unitRaw)||rate!==null||Boolean(serial));
    if((summaryPattern.test(combined)||carriedSummaryPattern.test(combined))&&!hasMeasuredIdentity)continue;
    if(!baseDescription){const context=contextText(row);if(context){pushContext(current.context,context);continue;}if(!notePattern.test(combined))warnings.push({sheet:sheet.name,row:r+1,message:"Row has content but no recognized description; kept out of the BOQ pending review."});continue;}
    const hasCommercialOrMeasuredData=qtyRaw!==null||Boolean(unitRaw)||rate!==null||amountRaw!==null||Boolean(serial);if(!hasCommercialOrMeasuredData){pushContext(current.context,description);continue;}
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
function legacyDescriptionFromRow(row:unknown[],codeIndex:number){for(let c=codeIndex+1;c<row.length;c++){const value=text(row[c]);if(value&&asNumber(row[c])===null&&value.length>3)return value;}return "";}
function legacyAmount(rows:unknown[][],start:number,end:number,codeIndex:number){let found:number|null=null;let foundColumn=-1;for(let r=start;r<end;r++){const row=rows[r]??[];for(let c=codeIndex+1;c<row.length;c++){const value=asNumber(row[c]);if(value!==null&&c>=foundColumn){found=value;foundColumn=c;}}}return found;}
function parseLegacySheet(sheet:ParsedWorkbookSheet,warnings:BoqImportWarning[]):LocalBoqSection[]|null{
  const starts:Array<{row:number;codeIndex:number;code:string;description:string}>=[];for(let r=0;r<sheet.rows.length;r++){const row=sheet.rows[r]??[];for(let c=0;c<Math.min(row.length,4);c++){const code=legacyItemCode(row[c]);if(!code)continue;const description=legacyDescriptionFromRow(row,c);if(description){starts.push({row:r,codeIndex:c,code,description});break;}}}if(starts.length<2)return null;
  let title="Preliminaries";const firstRow=starts[0].row;for(let r=Math.max(0,firstRow-8);r<firstRow;r++){for(const value of nonEmpty(sheet.rows[r]??[])){if(isStrongSectionTitle(value)&&!/bill\s*(nr|no|number)?/i.test(value))title=value;}}
  const section=makeSection(sheet.name,title,0,[]);warnings.push({sheet:sheet.name,message:"Legacy headerless bill layout was inferred conservatively. Quantities default to 1 LS and every recovered line must be reviewed before Project staging."});
  starts.forEach((start,index)=>{const end=starts[index+1]?.row??sheet.rows.length;const parts:string[]=[start.description];for(let r=start.row+1;r<end;r++){const row=sheet.rows[r]??[];for(let c=start.codeIndex+1;c<row.length;c++){const value=text(row[c]);if(!value||asNumber(row[c])!==null||summaryPattern.test(value)||carriedSummaryPattern.test(value))continue;if(!parts.includes(value)&&value.length>2)parts.push(value);}}const description=parts.join(" ").slice(0,1800);const amount=legacyAmount(sheet.rows,start.row,end,start.codeIndex);section.items.push({id:`item-${safeId(sheet.name)}-${start.row+1}-${index+1}`,itemNo:start.code,description,unit:"LS",quantity:1,rate:amount,amount,materialBreakdown:{status:"needs_review",materials:[],assumptions:["Legacy preliminaries layout inferred as a lump-sum line; review description, amount and scope before use."]}});if(amount===null)warnings.push({sheet:sheet.name,row:start.row+1,message:`Legacy item ${start.code} has no confidently associated amount and remains unpriced.`});});
  return section.items.length?[section]:null;
}
function parseBoqWorkbookSheets(sheets:ParsedWorkbookSheet[],fileName="Imported BOQ"):ParsedBoqWorkbook{
  const warnings:BoqImportWarning[]=[];const sections:LocalBoqSection[]=[];const recognizedSheets:string[]=[];const supportSheets:string[]=[];const legacySheets:string[]=[];const skippedSheets:string[]=[];
  sheets.forEach(sheet=>{const classification=classifySheet(sheet);if(classification.role==="support"){supportSheets.push(sheet.name);skippedSheets.push(sheet.name);return;}if(classification.role==="non_boq"){skippedSheets.push(sheet.name);return;}const parsed=classification.role==="legacy"?parseLegacySheet(sheet,warnings):parseDetailSheet(sheet,classification.header!,warnings);if(!parsed){skippedSheets.push(sheet.name);return;}recognizedSheets.push(sheet.name);if(classification.role==="legacy")legacySheets.push(sheet.name);for(const section of parsed){section.id=`${section.id}-${sections.length+1}`;sections.push(section);}});
  const baseName=fileName.replace(/\.(xlsx|xls|csv)$/i,"").trim()||"Imported BOQ";const itemCount=sections.reduce((sum,section)=>sum+section.items.length,0);if(!itemCount&&supportSheets.length)warnings.push({sheet:supportSheets[0],message:"Only support/summary schedules were found. Upload the primary BOQ or detailed bill rather than a material/procurement/summary workbook."});
  return{boq:{id:`import-${safeId(baseName)}-${itemCount}`,name:baseName,currency:"NGN",sections},warnings,recognizedSheets,supportSheets,legacySheets,skippedSheets,itemCount};
}

const REVIEW_COST_CODES=[["01","Preliminaries"],["02","Substructure"],["03","Concrete & Reinforcement"],["04","Blockwork & Masonry"],["05","Structural Steel"],["06","Roofing"],["07","Doors"],["08","Windows & Glazing"],["09","Plastering & Screeding"],["10","Floor Finishes"],["11","Wall Finishes"],["12","Ceilings"],["13","Painting & Decoration"],["14","Joinery & Fixtures"],["15","Plumbing & Sanitary"],["16","Electrical"],["17","Mechanical & HVAC"],["18","External Works"],["19","Plant, Equipment & Specialist Works"],["20","Professional, Statutory & Other"]] as const;
const costName=(code:string|null)=>REVIEW_COST_CODES.find(([candidate])=>candidate===code)?.[1]??null;
const normalizedReview=(value:unknown)=>String(value??"").toLowerCase().replace(/[^a-z0-9]+/g," ").replace(/\s+/g," ").trim();
const includesAny=(value:string,terms:readonly string[])=>terms.some(term=>value.includes(term));
function directSupply(value:string){return includesAny(value,["door","window","glazing","glass","sanitary ware","sanitaryware","water closet"," wc ","wash hand basin","whb","shower mixer","mixer tap","sink","extractor fan","water heater","socket","switch","light fitting","light fixture","luminaire","air conditioner","ac unit","wardrobe","kitchen cabinet","cabinet","ironmongery"]);}
function suggestRecipe(value:string):{family:BoqRecipeFamily;label:string;code:string|null;strong:boolean}{
  if(/\b225\s*mm\b/.test(value)&&includesAny(value,["block","blockwork","walling"]))return{family:"blockwork_225",label:"225mm blockwork",code:"04",strong:true};
  if((/\b150\s*mm\b/.test(value)||includesAny(value,["6 inch","6in"]))&&includesAny(value,["block","blockwork","walling"]))return{family:"blockwork_150",label:"150mm blockwork",code:"04",strong:true};
  if(includesAny(value,["blockwork","sandcrete block","block wall","masonry","walling"]))return{family:"blockwork",label:"Blockwork recipe",code:"04",strong:true};
  if(includesAny(value,["reinforcement","reinforcing bar","rebar","high yield steel","mild steel bar","y8","y10","y12","y16","y20","y25"]))return{family:"reinforcement",label:"Reinforcement recipe",code:"03",strong:true};
  if(includesAny(value,["formwork","shuttering","mould to concrete"]))return{family:"formwork",label:"Formwork recipe",code:"03",strong:true};
  if(includesAny(value,["reinforced concrete","mass concrete","plain concrete","concrete in","concrete work","concrete slab","concrete beam","concrete column","concrete foundation"]))return{family:"concrete",label:"Concrete recipe",code:"03",strong:true};
  if(includesAny(value,["plastering","plaster to","cement sand plaster","rendering","render to"]))return{family:"plastering",label:"Plastering recipe",code:"09",strong:true};
  if(includesAny(value,["screeding","floor screed","cement screed","screed to","levelling screed","leveling screed"]))return{family:"screeding",label:"Screeding recipe",code:"09",strong:true};
  if(includesAny(value,["floor tile","floor tiling","field tiling","stone tiling","marble tiling","porcelain floor","ceramic floor","granite floor","marble floor"]))return{family:"floor_tiling",label:"Floor tiling recipe",code:"10",strong:true};
  if(includesAny(value,["wall tile","wall tiling","ceramic wall","porcelain wall","wall cladding"]))return{family:"wall_tiling",label:"Wall finish recipe",code:"11",strong:true};
  if(includesAny(value,["painting","paint to","paint area","emulsion paint","gloss paint","textured paint","primer coat"]))return{family:"painting",label:"Painting recipe",code:"13",strong:true};
  if(includesAny(value,["roofing sheet","roof covering","longspan","stone coated","aluminium roofing","roof tile","roof membrane"]))return{family:"roofing",label:"Roofing recipe",code:"06",strong:true};
  if(includesAny(value,["ceiling","gypsum board","plasterboard","pop ceiling","suspended ceiling"]))return{family:"ceiling",label:"Ceiling recipe",code:"12",strong:true};
  if(includesAny(value,["pipework","water supply pipe","drainage pipe","soil pipe","waste pipe","pvc pipe","ppr pipe","plumbing installation"]))return{family:"plumbing_installation",label:"Plumbing installation recipe",code:"15",strong:true};
  if(includesAny(value,["cable","conduit","trunking","wiring","electrical installation","distribution board","earthing"]))return{family:"electrical_installation",label:"Electrical installation recipe",code:"16",strong:true};
  if(directSupply(` ${value} `)){let code:string|null=null;if(includesAny(value,["door","ironmongery"]))code="07";else if(includesAny(value,["window","glazing","glass"]))code="08";else if(includesAny(value,["wardrobe","kitchen cabinet","cabinet"]))code="14";else if(includesAny(value,["sanitary","water closet"," wc ","wash hand basin","whb","shower","sink","mixer","water heater"]))code="15";else if(includesAny(value,["socket","switch","light fitting","light fixture","luminaire","extractor fan"]))code="16";else if(includesAny(value,["air conditioner","ac unit"]))code="17";return{family:"direct_supply",label:"Direct supply item",code,strong:true};}
  if(includesAny(value,["excavation","earthwork","earth work","backfilling","back filling","cart away","disposal of excavated"]))return{family:"not_applicable",label:"No material recipe required",code:"02",strong:true};
  if(includesAny(value,["preliminaries","mobilization","mobilisation","site establishment","temporary works","insurance","health and safety"]))return{family:"not_applicable",label:"No material recipe required",code:"01",strong:true};
  if(includesAny(value,["structural steel","steel frame","steel column","steel beam","steel truss"]))return{family:"needs_review",label:"Structural steel recipe needs review",code:"05",strong:true};
  if(includesAny(value,["landscaping","paving","interlock","external drain","fence","gate","external works"]))return{family:"external_works",label:"External works recipe",code:"18",strong:true};
  return{family:"needs_review",label:"Material recipe needs review",code:null,strong:false};
}
function costFromText(value:string,fallback:string|null):string|null{if(fallback)return fallback;const rules:Array<[string,readonly string[]]>=[["17",["hvac","air conditioning","mechanical ventilation","ductwork"]],["16",["electrical","lighting","power installation"]],["15",["plumbing","sanitary","drainage","water supply"]],["14",["joinery","cabinetry","wardrobe","kitchen cabinet"]],["13",["painting","decoration"]],["12",["ceiling","gypsum","pop work","reflective surfaces"]],["11",["wall finish","wall tile","cladding"]],["10",["floor finish","floor tile","flooring","tiling","marble"]],["09",["plaster","render","screed"]],["08",["window","glazing","glass"]],["07",["door","ironmongery"]],["06",["roof","roofing"]],["05",["structural steel","steelwork"]],["04",["blockwork","masonry","walling"]],["03",["concrete","reinforcement","rebar","formwork"]],["02",["substructure","foundation","excavation","earthwork"]],["18",["external works","landscaping","fence","paving"]],["19",["specialist works","equipment","plant"]],["20",["professional fee","statutory","permit","approval fee"]],["01",["preliminaries","prelims","mobilization","mobilisation"]]];return rules.find(([,terms])=>includesAny(value,terms))?.[0]??null;}
type SupplySuggestion={value:BoqSupplyResponsibility;strong:boolean;reason:string};
function explicitItemSupply(value:string):SupplySuggestion|null{if(includesAny(value,["labour only","labor only","laying only","lay only","installation only","install only","fixing only","fix only","workmanship only"]))return{value:"labour_only",strong:true,reason:"Item wording explicitly limits the priced work to labour/installation."};if(includesAny(value,["client supplied","client supply","by client","free issue","free issued","owner supplied","employer supplied"]))return{value:"client",strong:true,reason:"Item wording says the item/material is client supplied."};if(includesAny(value,["nominated subcontractor","nominated supplier","specialist contractor","by specialist","specialist supply"]))return{value:"specialist",strong:true,reason:"Item wording indicates specialist or nominated supply."};if(includesAny(value,["supply and install","supply & install","supply and fix","supply and lay","provide and fix","provide and install","supply deliver and install"])||/^supply\b/.test(value))return{value:"contractor",strong:true,reason:"Item wording explicitly makes supply part of the contractor-priced work."};return null;}
function supplySuggestion(itemText:string,contextTextValue:string,recipe:BoqRecipeFamily):SupplySuggestion{const itemExplicit=explicitItemSupply(itemText);if(itemExplicit)return itemExplicit;if(includesAny(contextTextValue,["labour only","labor only","laying only","lay only","installation only","install only","fixing only","fix only","workmanship only"]))return{value:"labour_only",strong:true,reason:"Section instructions state that these BOQ lines are laying/installation only."};if(includesAny(contextTextValue,["client supplied","client supply","by client","free issue","free issued","owner supplied","employer supplied"]))return{value:"client",strong:true,reason:"Section instructions state that the material/item is client or employer supplied."};if(includesAny(contextTextValue,["nominated subcontractor","nominated supplier","specialist contractor","by specialist","specialist supply"]))return{value:"specialist",strong:true,reason:"Section instructions identify specialist or nominated supply."};if(recipe!=="needs_review"&&recipe!=="not_applicable")return{value:"contractor",strong:false,reason:"Contractor supply is the default working assumption for a material-bearing BOQ item."};return{value:"unknown",strong:false,reason:"Supply responsibility is not clear from the item or section instructions."};}
function suggestBoqItemReview(sectionTitle:string,item:{description:string;unit?:string;quantity?:number},sectionContext:readonly string[]=[]):BoqReviewSuggestion{
  const itemText=normalizedReview(`${item.description} ${item.unit??""}`);const sectionText=normalizedReview(`${sectionTitle} ${sectionContext.join(" ")}`);const recipe=suggestRecipe(itemText||sectionText);const sectionCode=costFromText(sectionText,null);const itemExplicitSupply=explicitItemSupply(itemText);const itemCode=costFromText(itemText,recipe.code);const preferSectionForExplicitConsumable=itemExplicitSupply?.value==="contractor"&&recipe.family==="needs_review"&&sectionCode!==null;const code=preferSectionForExplicitConsumable?sectionCode:(itemCode??sectionCode);const supply=supplySuggestion(itemText,sectionText,recipe.family);const reasons:string[]=[];
  if(recipe.strong)reasons.push(`${recipe.label} detected from the BOQ wording.`);else reasons.push("No confident material-recipe family was found from the description.");if(preferSectionForExplicitConsumable)reasons.push("Explicit supply item is kept in its BOQ trade section instead of being reclassified by incidental material wording.");if(code)reasons.push(`Suggested cost group: ${code} ${costName(code)}.`);if(supply.reason)reasons.push(supply.reason);
  let confidence:BoqReviewConfidence="low";if(code&&recipe.family!=="needs_review"&&supply.value!=="unknown")confidence=recipe.strong&&supply.strong?"high":"medium";else if(code&&recipe.strong)confidence="medium";const requiresAttention=!code||recipe.family==="needs_review"||supply.value==="unknown"||confidence==="low";
  return{costCode:code,costCodeName:costName(code),recipeFamily:recipe.family,recipeLabel:recipe.label,supplyResponsibility:supply.value,confidence,requiresAttention,reasons};
}
function decorateBoqWithReview(boq:LocalSectionedBoq){let clearItems=0;let attentionItems=0;const sections=boq.sections.map(section=>{const items=section.items.map(item=>{const reviewSuggestion=suggestBoqItemReview(section.title,item,section.context??[]);if(reviewSuggestion.requiresAttention)attentionItems++;else clearItems++;return{...item,reviewSuggestion};});return{...section,items};});return{boq:{...boq,sections},reviewSummary:{clearItems,attentionItems,totalItems:clearItems+attentionItems}};}

export function parseBoqLocally(buffer:ArrayBuffer,fileName:string):LocalBoqParseResult{
  if(buffer.byteLength>MAX_BYTES)throw new Error("This BOQ is over the 12 MB preview limit.");
  const ext=fileName.split(".").pop()?.toLowerCase()??"";if(!supported.has(ext))throw new Error("BOQ preview accepts XLSX, XLS or CSV files.");
  const workbook=XLSX.read(new Uint8Array(buffer),{type:"array",raw:false,cellDates:false,dense:false});
  const sheets:ParsedWorkbookSheet[]=workbook.SheetNames.slice(0,MAX_SHEETS).map(sheetName=>{
    const rows=XLSX.utils.sheet_to_json(workbook.Sheets[sheetName],{header:1,defval:"",raw:false,blankrows:true}) as unknown[][];
    return{name:sheetName,rows:rows.slice(0,MAX_ROWS_PER_SHEET).map(row=>row.slice(0,MAX_COLUMNS))};
  });
  const parsed=parseBoqWorkbookSheets(sheets,fileName);const reviewed=decorateBoqWithReview(parsed.boq);
  if(!parsed.itemCount){const supportOnly=parsed.supportSheets.length>0&&parsed.recognizedSheets.length===0;return{...parsed,boq:undefined,reviewSummary:reviewed.reviewSummary,error:supportOnly?`No primary BOQ sheet was found. ${parsed.supportSheets.length} support/summary sheet${parsed.supportSheets.length===1?" was":"s were"} identified and deliberately excluded to prevent double counting. Upload the detailed BOQ/bill workbook.`:"No BOQ item rows were confidently detected. Check the workbook headings or review the sheet structure."};}
  return{...parsed,boq:reviewed.boq,reviewSummary:reviewed.reviewSummary};
}
