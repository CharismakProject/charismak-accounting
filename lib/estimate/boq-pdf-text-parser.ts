import type { SectionedBoq, SectionedBoqItem } from "./sectioned-boq.ts";
import { decorateBoqWithReview } from "./boq-review.ts";

export type PdfBoqSourceMode = "selectable_text" | "ocr";
export type PdfBoqWarning = { line?: number; message: string };
export type ParsedPdfBoq = {
  boq: SectionedBoq;
  warnings: PdfBoqWarning[];
  itemCount: number;
  sourceMode: PdfBoqSourceMode;
  reviewSummary: { clearItems: number; attentionItems: number; totalItems: number };
};

type DraftSection = { title: string; context: string[]; items: SectionedBoqItem[] };
type MeasuredTail = { prefix: string; unit: string; quantity: number; rate: number | null; amount: number | null; lumpSum: boolean };

const moneyLike = /^(?:[₦$€£]?\s*)?(?:[-+]?\d[\d,]*(?:\.\d+)?|[-+]?\.\d+|—|-|--|n\/?a)$/i;
const unitLike = /^(?:m|m2|m3|m²|m³|sqm|sq\.m|sqmt|cum|cm|mm|lm|kg|g|t|ton|tonne|tonnes|bag|bags|nr|nrs|no|nos|number|numbers|item|items|ls|l\/s|sum|lot|set|sets|trip|trips|sheet|sheets|roll|rolls|length|lengths|litre|litres|liter|liters|point|points)$/i;
const summaryLike = /\b(?:sub\s*total|subtotal|grand\s*total|carried\s+to|carried\s+forward|brought\s+forward|to\s+summary|to\s+collection|commercial\s+summary|general\s+summary|bill\s*(?:nr\.?|no\.?)?\s*\d*\s*total|total\s+contract\s+sum)\b/i;
const headerWord = (line:string) => line.toUpperCase().replace(/[^A-Z0-9]/g, "");
const tradeWords = /\b(?:preliminar|substructure|superstructure|excavat|excavation|earthwork|earthworks|concrete|reinforcement|formwork|block|masonry|steel|roof|door|window|glaz|plaster|render|screed|floor|wall|ceiling|paint|joinery|plumbing|sanitary|electrical|mechanical|external|waterproof|demolition|finishing|filling|carcassing|fixtures?|fence|gate|paving|landscap)\b/i;
const safeId=(value:string)=>value.toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-+|-+$/g,"").slice(0,58)||"boq";
const clean=(value:string)=>value.replace(/\u00a0/g," ").replace(/[ \t]+/g," ").trim();
const sectionKey=(value:string)=>clean(value).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();

function numberToken(value:string):number|null{
  const raw=clean(value).replace(/[₦$€£]/g,"").replace(/,/g,"").replace(/^\((.*)\)$/,"-$1");
  if(!raw||/^(?:—|-|--|n\/?a)$/i.test(raw)||!/^[-+]?\d*\.?\d+$/.test(raw))return null;
  const n=Number(raw);return Number.isFinite(n)?n:null;
}
function isHeader(line:string){const c=headerWord(line);return c.includes("DESCRIPTION")&&(c.includes("QTY")||c.includes("QUANTITY"))&&c.includes("RATE")&&c.includes("AMOUNT");}
function isPageNoise(line:string){return /^(?:page\s*\d+|confidential\b|prepared\s+(?:by|with)\b)/i.test(line);}
function stripSerial(prefix:string):{serial?:string;description:string}{
  const m=prefix.match(/^((?:\d+(?:\.\d+)*|[A-Z](?:\.[A-Z])?|[A-Z]\d+))\s*[.)-]?\s+(.+)$/i);
  return m?{serial:m[1],description:clean(m[2])}:{description:clean(prefix)};
}
function looksSection(line:string){
  if(!line||line.length>150||summaryLike.test(line)||isHeader(line)||isPageNoise(line))return false;
  if(/^(?:ELEMENT\s+(?:NR|NO)\.?\s*[\w.]+|[A-Z]\d{1,3}\s*[:.-]|[A-Z]\d{1,3}\s+[A-Z])/i.test(line))return true;
  if(/^\s*[A-Z]\.?\s+[A-Z][A-Z &/()-]{5,}$/.test(line))return true;
  if(line===line.toUpperCase()&&/[A-Z]{3}/.test(line)&&tradeWords.test(line))return true;
  return /^(?:preliminaries|substructures?|concrete works?|internal works?|wall finishing|ceiling finishing|floor finishings?|electrical installations?|mechanical works?|sanitary fixtures?|roof & steel work|painting and decorating|reinforcement|formworks?|filling|waterproofing|carcassing)$/i.test(line);
}
function sectionTitle(line:string){return clean(line.replace(/^\s*[A-Z]\.?\s+(?=[A-Z][A-Z &/()-]{5,}$)/,""));}

function measuredTail(line:string):MeasuredTail|null{
  const tokens=clean(line).split(/\s+/).filter(Boolean);
  if(tokens.length<2)return null;
  const at=(i:number)=>tokens[i]??"";
  const n=tokens.length;
  const amountLike=moneyLike.test(at(n-1));
  const rateLike=moneyLike.test(at(n-2));
  if(n>=4&&amountLike&&rateLike){
    const a=numberToken(at(n-1)),r=numberToken(at(n-2));
    const qA=numberToken(at(n-4));const uA=at(n-3);
    if(qA!==null&&unitLike.test(uA))return{prefix:tokens.slice(0,n-4).join(" "),unit:uA,quantity:qA,rate:r,amount:a,lumpSum:false};
    const uB=at(n-4);const qB=numberToken(at(n-3));
    if(unitLike.test(uB)&&qB!==null)return{prefix:tokens.slice(0,n-4).join(" "),unit:uB,quantity:qB,rate:r,amount:a,lumpSum:false};
  }
  if(n>=2&&unitLike.test(at(n-2))&&moneyLike.test(at(n-1))){
    const unit=at(n-2);const amount=numberToken(at(n-1));
    if(/^(?:ls|l\/s|sum|item|lot)$/i.test(unit)&&amount!==null)return{prefix:tokens.slice(0,n-2).join(" "),unit,quantity:1,rate:amount,amount,lumpSum:true};
  }
  return null;
}

function contextCandidate(line:string){
  if(!line||line.length>900||isHeader(line)||summaryLike.test(line)||isPageNoise(line)||looksSection(line))return false;
  return !measuredTail(line);
}
function isCategoryAfterNumericSerial(description:string){return description.length<70&&tradeWords.test(description)&&/\b(?:works?|finishes?|flooring|roofing|fence|earthworks?|paving|landscaping)\b/i.test(description);}

export function parseBoqPdfText(rawText:string,fileName="Imported PDF BOQ",sourceMode:PdfBoqSourceMode="selectable_text"):ParsedPdfBoq{
  const warnings:PdfBoqWarning[]=[];
  const lines=rawText.replace(/\r/g,"").split(/\n/).map(clean).filter(Boolean);
  if(lines.join(" ").length<40)throw new Error("No usable BOQ text was found in this PDF.");
  const sections:DraftSection[]=[];
  let current:DraftSection={title:"General",context:[],items:[]};
  let pendingSerial:string|undefined;
  let pendingParts:string[]=[];
  let itemIndex=0;
  const pushSection=()=>{if(current.items.length){sections.push(current);current={title:"General",context:[],items:[]};}};
  const startSection=(title:string)=>{
    const nextTitle=sectionTitle(title)||"General";
    if(current.items.length&&sectionKey(current.title)===sectionKey(nextTitle)){pendingSerial=undefined;pendingParts=[];return;}
    if(current.items.length)sections.push(current);
    current={title:nextTitle,context:[],items:[]};pendingSerial=undefined;pendingParts=[];
  };
  const addItem=(lineNo:number,tail:MeasuredTail)=>{
    const prefix=clean(tail.prefix);
    const parsed=stripSerial(prefix);
    const serial=parsed.serial??pendingSerial;
    let description=clean([...pendingParts,parsed.description].filter(Boolean).join(" "));
    if(!description&&prefix)description=prefix;
    if(!description){warnings.push({line:lineNo,message:"Measured values were found without a usable description; the line was kept out for review."});pendingSerial=undefined;pendingParts=[];return;}
    if(!serial)warnings.push({line:lineNo,message:`“${description.slice(0,70)}” has measured values but no item number; it was retained for review.`});
    if(tail.lumpSum)warnings.push({line:lineNo,message:`“${description.slice(0,70)}” was interpreted as a lump-sum item with quantity 1.`});
    if(tail.rate!==null&&tail.amount!==null&&Math.abs(tail.quantity*tail.rate-tail.amount)>.05)warnings.push({line:lineNo,message:`Amount for “${description.slice(0,70)}” does not equal Qty × Rate; source values were preserved for review.`});
    itemIndex++;
    current.items.push({id:`pdf-item-${itemIndex}-${safeId(description)}`,itemNo:serial,description,unit:tail.unit,quantity:tail.quantity,rate:tail.rate,amount:tail.amount,materialBreakdown:{status:"needs_review",materials:[],assumptions:[sourceMode==="ocr"?"This item came from OCR and must be reviewed against the source PDF before use.":"Material recipe has not yet been confirmed for this imported PDF BOQ item."]}});
    pendingSerial=undefined;pendingParts=[];
  };

  for(let i=0;i<lines.length;i++){
    const line=lines[i];const lineNo=i+1;
    if(line==="--- PAGE ---"||isHeader(line)||isPageNoise(line))continue;
    if(summaryLike.test(line)){pendingSerial=undefined;pendingParts=[];continue;}
    if(looksSection(line)){startSection(line);continue;}
    const tail=measuredTail(line);
    if(tail){addItem(lineNo,tail);continue;}
    const serialOnly=line.match(/^((?:\d+(?:\.\d+)*|[A-Z](?:\.[A-Z])?|[A-Z]\d+))\s*$/i);
    if(serialOnly){pendingSerial=serialOnly[1];pendingParts=[];continue;}
    const serialText=line.match(/^((?:\d+(?:\.\d+)*|[A-Z](?:\.[A-Z])?|[A-Z]\d+))\s*[.)-]?\s+(.+)$/i);
    if(serialText){
      const rest=clean(serialText[2]);
      if(/^\d/.test(serialText[1])&&isCategoryAfterNumericSerial(rest)){startSection(rest);pendingSerial=serialText[1];continue;}
      pendingSerial=serialText[1];pendingParts=[rest];continue;
    }
    if(pendingSerial||pendingParts.length){pendingParts.push(line);if(pendingParts.join(" ").length>1200){warnings.push({line:lineNo,message:"A multi-line BOQ description became too long and was reset for safety."});pendingSerial=undefined;pendingParts=[];}continue;}
    if(contextCandidate(line)){current.context.push(line);if(current.context.length>10)current.context.shift();}
  }
  pushSection();
  if(!sections.length)throw new Error("No measured BOQ items could be reconstructed from this PDF text.");
  const internal={id:`pdf-${safeId(fileName)}-${itemIndex}`,name:fileName.replace(/\.pdf$/i,"").trim()||"Imported PDF BOQ",currency:"NGN",sections:sections.map((section,index)=>({id:`pdf-sec-${index+1}-${safeId(section.title)}`,title:section.title,context:section.context,items:section.items}))};
  const decorated=decorateBoqWithReview(internal);
  if(sourceMode==="ocr")warnings.unshift({message:"This PDF required OCR. Every extracted quantity, unit, rate and amount must be checked against the original document before Project staging."});
  return{boq:decorated.boq as SectionedBoq,warnings,itemCount:itemIndex,sourceMode,reviewSummary:decorated.reviewSummary};
}
