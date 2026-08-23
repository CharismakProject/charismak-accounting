import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const H={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
const clean=(v:unknown)=>String(v??"").replace(/\u00a0/g," ").replace(/[ \t]+/g," ").replace(/\n{3,}/g,"\n\n").trim();
const norm=(v:unknown)=>clean(v).toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const compact=(v:unknown)=>norm(v).replace(/\s/g,"");
const money=(v:unknown)=>{let s=String(v??"").replace(/[₦,$]/g,"").replace(/NGN/gi,"").replace(/\s/g,"").replace(/[()]/g,"");const n=Number(s);return Number.isFinite(n)?n:null;};
const lastMoney=(line:string)=>{const ms=[...line.matchAll(/(?:₦|NGN|N)?\s*([\d,]+(?:\.\d{1,2})?)/gi)];return ms.length?money(ms[ms.length-1][1]):null;};
const months:{[k:string]:number}={jan:1,january:1,feb:2,february:2,mar:3,march:3,apr:4,april:4,may:5,jun:6,june:6,jul:7,july:7,aug:8,august:8,sep:9,september:9,oct:10,october:10,nov:11,november:11,dec:12,december:12};

function parseDate(v:string){
  const s=v.trim();let m=s.match(/^(20\d{2})[-/](\d{1,2})[-/](\d{1,2})/);if(m)return `${m[1]}-${m[2].padStart(2,"0")}-${m[3].padStart(2,"0")}`;
  m=s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})/);if(m){const y=m[3].length===2?`20${m[3]}`:m[3];return `${y}-${m[2].padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
  m=s.match(/^(\d{1,2})[\s-]+([A-Za-z]{3,9})[\s,-]+(\d{2,4})/);if(m&&months[m[2].toLowerCase()]){const y=m[3].length===2?`20${m[3]}`:m[3];return `${y}-${String(months[m[2].toLowerCase()]).padStart(2,"0")}-${m[1].padStart(2,"0")}`;}
  return null;
}
const DATE_RE=/(?:20\d{2}[-/]\d{1,2}[-/]\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{1,2}[\s-]+(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)[\s,-]+\d{2,4})/i;
const MONEY_RE=/(?:NGN|₦|N)?\s*\(?\d{1,3}(?:,\d{3})*(?:\.\d{2})?\)?/gi;

function institution(text:string){
  const t=` ${text.toLowerCase()} `;
  const banks:[string,string][]=[
    ["owealth","OPay"],["opay","OPay"],["access bank","Access Bank"],["united bank for africa","UBA"],[" uba ","UBA"],
    ["carbon","Carbon"],["gtbank","GTBank"],["guaranty trust","GTBank"],["zenith","Zenith Bank"],["stanbic","Stanbic IBTC"],
    ["first bank","FirstBank"],["firstbank","FirstBank"],["fcmb","FCMB"],["first city monument","FCMB"],["fidelity","Fidelity Bank"],
    ["moniepoint","Moniepoint"],["palmpay","PalmPay"],["kuda","Kuda"],["sterling bank","Sterling Bank"],["wema bank","Wema Bank"],
    [" alat ","Wema Bank"],["union bank","Union Bank"],["polaris","Polaris Bank"],["ecobank","Ecobank"],["keystone","Keystone Bank"],
    ["providus","Providus Bank"],["jaiz","Jaiz Bank"],["taj bank","TAJBank"],["tajbank","TAJBank"],["lotus bank","Lotus Bank"],
    ["globus","Globus Bank"],["premiumtrust","PremiumTrust Bank"],["premium trust","PremiumTrust Bank"],["standard chartered","Standard Chartered"],["citibank","Citibank"],
    ["fairmoney","FairMoney"]
  ];
  for(const [k,n] of banks)if(t.includes(k))return n;
  return null;
}
function accountNumber(text:string){for(const re of [/(?:account\s*(?:number|no\.?|#)|a\/c\s*(?:number|no\.?)?)\s*[:\-]?\s*([0-9*Xx-]{6,20})/i,/\b([0-9]{10})\b/]){const m=text.match(re);if(m)return m[1].replace(/\s/g,"");}return null;}
function accountHolder(text:string){for(const re of [/(?:Account Name|Account Holder|Customer Name|Wallet Name|A\/C Name)\s*[:\-]?\s*([^\n]{3,100})/i,/Bank Statement\s*\n\s*([A-Z][A-Z0-9 &.'()\/-]{3,100})/i,/Hello\s+([A-Z][A-Z0-9 &.'()\/-]{3,100}?)(?:,|\n)/i]){const m=text.match(re);if(m){const x=clean(m[1]);if(x&&!/statement|summary/i.test(x))return x;}}return null;}
function looksStatement(text:string){const t=text.toLowerCase();let score=0;if(/statement of account|account statement|transaction history|bank statement/.test(t))score+=4;if(/opening balance|closing balance|running balance/.test(t))score+=2;if(/debit/.test(t)&&/credit/.test(t)&&/balance/.test(t))score+=3;if(/transaction date|value date|reference/.test(t))score+=2;if(institution(text))score+=1;return score>=5;}

function subtype(text:string){
  const t=text.toLowerCase();
  if(/statement of fund retirement|fund retirement/.test(t))return "fund_retirement";
  if(/request for (?:project )?fund|fund(?:ing)? request|request for payment/.test(t))return "fund_request";
  if(/\bpurchase order\b|\blpo\b/.test(t))return "purchase_order";
  if(/additional works|variation order|\bvariation\b|\bvo\d*/.test(t))return "variation";
  if(/bill of quantities|\bboq\b/.test(t))return "boq";
  if(/\binvoice\b/.test(t))return "invoice";
  if(/\bquotation\b|\bproposal\b/.test(t))return "quotation";
  if(/\breceipt\b/.test(t))return "receipt";
  if(/\bbill\b/.test(t))return "bill";
  return "other";
}
function sourceType(kind:string){return ["invoice","boq","quotation","receipt","bill"].includes(kind)?kind:"other";}
function suggestedEffect(kind:string){if(kind==="fund_retirement")return "funding_reconciliation_evidence";if(kind==="fund_request")return "funding_request_evidence";if(kind==="variation")return "variation_candidate";if(kind==="boq")return "contract_baseline_candidate";if(kind==="quotation")return "commercial_scope_candidate";if(kind==="invoice")return "invoice_direction_review";if(kind==="receipt"||kind==="bill")return "supporting_evidence";return "reference_only";}
function amountByLabels(lines:string[],labels:RegExp[]){for(const re of labels){for(let i=lines.length-1;i>=0;i--){if(!re.test(lines[i]))continue;const n=lastMoney(lines[i]);if(n!==null)return n;}}return null;}
function extractReference(lines:string[],text:string,kind:string){
  for(const re of [/invoice\s*(?:ref(?:erence)?|no\.?|number)\s*[:#-]?\s*([A-Z0-9/._-]+)/i,/quotation\s*(?:ref(?:erence)?|no\.?)\s*[:#-]?\s*([A-Z0-9/._-]+)/i,/proposal\s*(?:ref(?:erence)?|no\.?)\s*[:#-]?\s*([A-Z0-9/._-]+)/i,/purchase order\s*(?:ref(?:erence)?|no\.?|number)?\s*[:#-]?\s*([A-Z0-9/._-]+)/i]){
    for(const l of lines){const m=l.match(re);if(m)return m[1].replace(/[).,;]+$/g,"");}
  }
  if(kind==="purchase_order"){const po=text.match(/\b([A-Z]{2,8}\/LPO\/[A-Z0-9._/-]+)\b/i);if(po)return po[1].replace(/[).,;]+$/g,"");}
  const m=text.match(/\b(PFI\/(?:INV\/)?CPNL\/[A-Z0-9._/-]+)\b/i);return m?.[1]??null;
}
function relatedReference(text:string){for(const re of [/(?:further to|in accordance with|quotation ref\.?|original invoice)\s*(?:invoice|quotation)?\s*[:#-]?\s*([A-Z0-9/._-]{6,})/i,/vendor invoice no\.?\s*\n?\s*([A-Z0-9/._-]{6,})/i,/your reference\s*\n?\s*([A-Z0-9/._-]{6,})/i]){const m=text.match(re);if(m)return m[1]?.replace(/[).,;]+$/g,"")??null;}return null;}
function allReferences(text:string){return Array.from(new Set([...text.matchAll(/\b(?:PFI\/INV\/CPNL\/[A-Z0-9._/-]+|PFI\/CPNL\/[A-Z0-9._/-]+|CPNL\/[A-Z0-9._/-]{5,}|[A-Z]{2,8}\/LPO\/[A-Z0-9._/-]+)\b/gi)].map(m=>m[0].replace(/[).,;]+$/g,"")))).slice(0,20);}
function clientName(lines:string[]){for(const l of lines){const m=l.match(/^\s*client\s*:\s*(.+)$/i);if(m)return m[1].trim().slice(0,200);}return null;}
function projectName(lines:string[]){for(const l of lines){const m=l.match(/^\s*project\s*:\s*(.+)$/i);if(m)return m[1].trim().slice(0,250);}return lines.find(l=>/project|coco|jahi/i.test(l)&&l.length<220)??null;}
function titleFor(lines:string[],kind:string){const pattern=kind==="fund_retirement"?"fund retirement":kind==="fund_request"?"fund|request":kind==="variation"?"additional works|variation":kind==="purchase_order"?"purchase order|lpo":kind;const priority=lines.find(l=>new RegExp(pattern,"i").test(l)&&l.length<260);return (priority??lines.find(l=>l.length>6&&l.length<220)??"Project document").slice(0,260);}

function lineItems(lines:string[]){
  const items:any[]=[];let section:string|null=null;
  for(let i=0;i<lines.length;i++){
    const line=lines[i].trim();if(!line)continue;
    if(/^(section\s+[a-z0-9]+|[A-Z]\.?\s+[A-Z][A-Z &/,-]{5,})/i.test(line)&&!/(total|vat|discount)/i.test(line)){section=line.slice(0,180);continue;}
    if(/subtotal|sub-total|grand total|total contract|total before|vat|discount|amount in words|company.?s details/i.test(line))continue;
    const amt=lastMoney(line);if(amt===null||amt<=0)continue;
    const startsItem=/^(?:[A-Z]?\d+[A-Z]?|[A-Z]\d+)\b/.test(line);
    const hasUnit=/\b(sqm|m2|m²|m3|m³|kg|nr|nrs|no\.?|sum|ls|cum|lm|m)\b/i.test(line);
    if(!startsItem&&!hasUnit)continue;
    const nums=[...line.matchAll(/(?:₦|NGN|N)?\s*([\d,]+(?:\.\d{1,2})?)/gi)].map(m=>money(m[1])).filter((n):n is number=>n!==null);
    const unit=(line.match(/\b(sqm|m2|m²|m3|m³|kg|nr|nrs|no\.?|sum|ls|cum|lm|m)\b/i)||[])[1]??null;
    items.push({section,item_code:(line.match(/^([A-Z]?\d+[A-Z]?|[A-Z]\d+)\b/)||[])[1]??null,description:line.slice(0,700),unit,quantity:nums.length>=3?nums[nums.length-3]:null,rate:nums.length>=2?nums[nums.length-2]:null,amount:amt,confidence:nums.length>=2?82:68,source_line:i+1});
    if(items.length>=160)break;
  }
  return items;
}

function projectScore(text:string,fileName:string,p:any){
  const hay=norm(`${fileName} ${text}`);let score=0;const hits:string[]=[];
  const add=(term:any,points:number)=>{const n=norm(term);if(n.length>=3&&hay.includes(n)){score+=points;hits.push(String(term));}};
  add(p.project_code,55);const root=String(p.project_code||"").split(/[-_/]/)[0];if(root&&root!==p.project_code)add(root,38);add(p.name,48);for(const a of p.aliases??[])add(a,44);add(p.location,20);add(p.site_address,20);add(p.external_reference,28);const c=Array.isArray(p.client)?p.client[0]:p.client;add(c?.name,42);add(c?.contact_person,20);
  return {score:Math.min(score,100),hits:Array.from(new Set(hits))};
}

function statementRows(text:string,engine:string,baseConfidence:number){
  const raw=text.split(/\r?\n/).map(x=>x.replace(/\s+/g," ").trim()).filter(Boolean);
  const blocks:{text:string;source:number}[]=[];let current="",source=0;
  for(let i=0;i<raw.length;i++){
    if(DATE_RE.test(raw[i])){if(current)blocks.push({text:current,source});current=raw[i];source=i+1;}else if(current)current+=` ${raw[i]}`;
  }
  if(current)blocks.push({text:current,source});
  const header=raw.slice(0,120).join(" ").toLowerCase();const hasBalance=/balance/.test(header);const outRows:any[]=[];const candidates:number[][]=[];
  for(const b of blocks){
    const dm=b.text.match(DATE_RE);if(!dm)continue;const d=parseDate(dm[0]);if(!d)continue;
    const nums=(b.text.match(MONEY_RE)||[]).map(x=>Math.abs(money(x)??0)).filter(x=>x>0);if(!nums.length)continue;
    const balance=hasBalance&&nums.length>=2?nums[nums.length-1]:null;
    const candidate=hasBalance&&nums.length>=2?nums[nums.length-2]:nums[nums.length-1];
    const lower=b.text.toLowerCase();let amount:number|null=null;
    if(/\bcredit\b|\bcr\b|received|deposit|transfer from|payment from|tnf[-\s]/.test(lower))amount=Math.abs(candidate);
    else if(/\bdebit\b|\bdr\b|withdraw|charge|fee|purchase|transfer to|payment to|nip\/trf ifo/.test(lower))amount=-Math.abs(candidate);
    outRows.push({date:d,narration:b.text.replace(dm[0],"").trim().slice(0,900)||"Statement transaction",reference:(b.text.match(/\b[A-Z0-9]{10,40}\b/i)||[])[0]??null,amount,balance,source:b.source});candidates.push(nums);
  }
  let prev:number|null=null;
  for(let i=0;i<outRows.length;i++){
    const r=outRows[i];if(r.balance==null)continue;
    if(prev!=null){const delta=Math.round((r.balance-prev)*100)/100;if(Math.abs(delta)>=.01&&candidates[i].some(v=>Math.abs(v-Math.abs(delta))<=.05))r.amount=delta;}
    prev=r.balance;
  }
  return outRows.map(r=>({...r,debit:r.amount!=null&&r.amount<0?Math.abs(r.amount):null,credit:r.amount!=null&&r.amount>0?r.amount:null,confidence:r.amount==null?Math.min(baseConfidence,.62):baseConfidence,parser:engine}));
}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return out({error:"POST required"},405);
  const auth=req.headers.get("Authorization")??"";const url=Deno.env.get("SUPABASE_URL")!;const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}});const {data:{user}}=await sb.auth.getUser();if(!user)return out({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));
  const documentId=String(body?.documentId??"");const batchId=String(body?.batchId??"");const text=clean(String(body?.extractedText??"")).slice(0,700000);
  const engine=String(body?.extractionEngine??"browser_pdf_text_v1").slice(0,80);const extractionConfidence=Math.max(0,Math.min(100,Number(body?.extractionConfidence??98)));
  if(!documentId||!batchId||text.length<4)return out({error:"Document, batch and extracted text are required."},400);
  const {data:doc,error:de}=await sb.from("source_documents").select("id,company_id,project_id,file_name,metadata").eq("id",documentId).single();if(de||!doc)return out({error:de?.message||"Document not found"},404);
  const {data:item}=await sb.from("intake_items").select("id").eq("document_id",documentId).eq("batch_id",batchId).maybeSingle();if(!item)return out({error:"Intake item not found"},404);
  const isOcr=/ocr/i.test(engine);const baseConfidence=isOcr?Math.max(.5,Math.min(.92,extractionConfidence/100)):.98;
  try{
    if(looksStatement(text)){
      const bank=institution(text)||institution(doc.file_name);const holder=accountHolder(text);const acctNo=accountNumber(text);const rows=statementRows(text,engine,baseConfidence);
      if(rows.length<2){await sb.from("source_documents").update({document_type:"bank_statement",project_id:null,metadata:{...(doc.metadata as any),extraction_engine:engine,extraction_confidence:extractionConfidence}}).eq("id",documentId);await sb.from("intake_items").update({detected_type:"bank_statement",detected_project_id:null,confidence:Math.round(baseConfidence*100),status:"needs_review",message:"I recognised a financial statement, but the transaction rows are not clear enough to post safely. The original file is safe for review."}).eq("id",item.id);return out({ok:true,type:"bank_statement",status:"needs_review",message:"Financial statement recognised; transaction rows need review."});}
      const {data:accounts}=await sb.from("financial_accounts").select("id,institution_name,institution_key,account_name,account_number_masked,account_type").eq("company_id",doc.company_id).eq("is_active",true);
      const targetNo=String(acctNo??"").replace(/\D/g,"");const sameNo=(accounts??[]).find((a:any)=>targetNo&&String(a.account_number_masked??"").replace(/\D/g,"")===targetNo);const sameBank=(accounts??[]).filter((a:any)=>bank&&compact(a.institution_name)===compact(bank));let account:any=sameNo||(sameBank.length===1?sameBank[0]:null);
      if(!account&&bank){const created=await sb.from("financial_accounts").insert({company_id:doc.company_id,account_type:/opay|carbon|moniepoint|palmpay|kuda|fairmoney/i.test(bank)?"fintech_wallet":"bank",institution_name:bank,institution_key:compact(bank),account_name:holder||`${bank} Account`,account_number_masked:acctNo,account_scope:"company",created_by:user.id}).select("id,institution_name,institution_key,account_name,account_number_masked,account_type").single();if(!created.error)account=created.data;}
      if(!account){await sb.from("source_documents").update({document_type:"bank_statement",project_id:null,source_name:holder||bank,metadata:{...(doc.metadata as any),extraction_engine:engine,extraction_confidence:extractionConfidence}}).eq("id",documentId);await sb.from("intake_items").update({detected_type:"bank_statement",detected_project_id:null,confidence:Math.round(baseConfidence*100),status:"needs_review",suggested_action:{action:"confirm_financial_account",institution:bank,account_holder:holder,account_number:acctNo},message:"I read the statement but need you to confirm which financial account it belongs to."}).eq("id",item.id);return out({ok:true,type:"bank_statement",status:"needs_review",message:"Account confirmation needed."});}
      let {data:imp}=await sb.from("statement_imports").select("id").eq("document_id",documentId).maybeSingle();if(!imp){const r=await sb.from("statement_imports").insert({document_id:documentId,company_id:doc.company_id,financial_account_id:account.id,detected_institution_name:bank||account.institution_name,detected_account_name:account.account_name,detected_account_number_masked:acctNo,status:"parsing",detected_as_new_account:false,rows_total:0,rows_new:0,rows_already_known:0,rows_need_review:0}).select("id").single();if(r.error)throw new Error(r.error.message);imp=r.data;}
      const {count}=await sb.from("statement_rows").select("id",{head:true,count:"exact"}).eq("import_id",imp.id);if(!count){for(let start=0;start<rows.length;start+=250){const batch=rows.slice(start,start+250).map((r:any,i:number)=>({import_id:imp.id,row_index:start+i+1,transaction_date:r.date,narration:r.narration,reference:r.reference,debit:r.debit,credit:r.credit,signed_amount:r.amount,running_balance:r.balance,detection_status:r.amount==null?"needs_review":"new",raw_payload:{parser:engine,source_row:r.source,parse_confidence:r.confidence}}));const x=await sb.from("statement_rows").insert(batch);if(x.error)throw new Error(x.error.message);}}
      const finalized=await sb.rpc("finalize_statement_import",{target_import:imp.id});if(finalized.error)throw new Error(finalized.error.message);await sb.rpc("discover_statement_projects",{target_import:imp.id});const posted=await sb.rpc("auto_post_statement_matches",{target_import:imp.id,minimum_confidence:94});const last=[...rows].reverse().find((r:any)=>r.balance!=null);
      const warnings:string[]=[];if(rows.some((r:any)=>r.amount==null))warnings.push("Some extracted rows have an unclear debit/credit amount and remain in review.");if(isOcr)warnings.push("This statement was read from scanned imagery; uncertain rows were kept for review.");
      await sb.from("statement_imports").update({closing_balance:last?.balance??null,parser_name:engine,parser_confidence:baseConfidence,parse_warnings:warnings,analysed_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("id",imp.id);
      await sb.from("source_documents").update({document_type:"bank_statement",project_id:null,source_name:holder||bank||account.account_name,metadata:{...(doc.metadata as any),extraction_engine:engine,extraction_confidence:extractionConfidence}}).eq("id",documentId);
      const pending=Number((posted.data as any)?.pendingReview??0);await sb.from("intake_items").update({detected_type:"bank_statement",detected_project_id:null,confidence:Math.round(baseConfidence*100),status:"applied",suggested_action:{action:"open_statement",statement_import_id:imp.id},message:`Statement read safely. ${rows.length} transaction rows extracted; uncertain rows remain for review.`}).eq("id",item.id);
      return out({ok:true,type:"bank_statement",status:"applied",statementImportId:imp.id,rows:rows.length,autoPosted:Number((posted.data as any)?.autoPosted??0),pendingReview:pending,message:`Statement processed: ${rows.length} transaction rows extracted.`});
    }

    const lines=text.split(/\r?\n/).map(clean).filter(Boolean);const kind=subtype(`${doc.file_name}\n${text}`);const reference=extractReference(lines,text,kind);const related=relatedReference(text);const refs=allReferences(text);const subtotal=amountByLabels(lines,[/sub[- ]?total(?!.*section)/i,/total before (?:vat|contingency)/i]);const discount=amountByLabels(lines,[/discount/i]);const vat=amountByLabels(lines,[/\bvat\b/i]);const genericTotal=amountByLabels(lines,[/grand total/i,/total contract sum/i,/contract sum/i,/total amount/i,/total project funding received/i]);const variationDifference=kind==="variation"?amountByLabels(lines,[/\bdifference\b/i,/net variation/i,/variation amount/i]):null;const purchaseOrderTotal=kind==="purchase_order"?amountByLabels(lines,[/^total\b/i,/\btotal amount\b/i]):null;const total=variationDifference??purchaseOrderTotal??genericTotal;const items=lineItems(lines);
    const {data:projects}=await sb.from("projects").select("id,project_code,name,aliases,location,site_address,external_reference,client:clients(name,contact_person)").eq("company_id",doc.company_id).neq("status","archived");const scored=(projects??[]).map((p:any)=>({...p,...projectScore(text,doc.file_name,p)})).sort((a:any,b:any)=>b.score-a.score);const hinted=(projects??[]).find((p:any)=>p.id===doc.project_id);const best=hinted?{...hinted,score:100,hits:["user project selection"]}:scored[0];const second=hinted?null:scored[1];const confident=Boolean(hinted)||(best&&best.score>=55&&(!second||best.score-second.score>=10));
    const warnings:string[]=[];if(!items.length&&["invoice","boq","quotation","variation","bill","purchase_order"].includes(kind))warnings.push("The document was read, but detailed line items were not confidently structured. Confirm the total and scope if needed.");if(kind==="purchase_order")warnings.push("Purchase order detected. It is kept as commercial evidence by default so it does not duplicate an invoice or variation already counted on the project.");if(isOcr)warnings.push("This document was read from scanned imagery. Confirm commercial figures before they affect the project.");
    let confidence=kind==="other"?55:78;if(reference)confidence+=7;if(total!==null)confidence+=7;if(items.length)confidence+=5;if(confident)confidence+=5;if(!isOcr)confidence+=3;confidence=Math.min(confidence,98);
    const firstDate=text.match(DATE_RE)?.[0]??null;const fields={reference,related_reference:related,all_references:refs,client_name:clientName(lines),project_name:projectName(lines),document_date:firstDate?parseDate(firstDate):null,subtotal,discount_amount:discount,vat_amount:vat,grand_total:total,reported_total:genericTotal,purchase_order_total:purchaseOrderTotal,variation_difference:variationDifference,suggested_effect:suggestedEffect(kind),extraction_engine:engine};
    const projectId=confident?best.id:null;await sb.from("source_documents").update({document_type:sourceType(kind),project_id:projectId,amount:total,document_date:fields.document_date,source_name:fields.client_name,metadata:{...(doc.metadata as any),extraction_engine:engine,extraction_confidence:extractionConfidence,detected_subtype:kind,document_reference:reference,related_reference:related,all_references:refs}}).eq("id",documentId);
    if(!projectId){await sb.from("intake_items").update({detected_type:kind,detected_project_id:null,confidence,status:"needs_review",suggested_action:{action:"choose_project",candidate_project_id:best?.id??null,candidate_project_name:best?.name??null},message:best?`This looks related to ${best.name}, but I need confirmation before applying it.`:"I read the document but could not confidently identify the project."}).eq("id",item.id);return out({ok:true,type:kind,status:"needs_review",message:best?`Possible project: ${best.name}. Please confirm.`:"Project confirmation needed."});}
    const now=new Date().toISOString();const {error:ie}=await sb.from("project_document_intelligence").upsert({company_id:doc.company_id,project_id:projectId,document_id:documentId,analysis_status:"ready",review_status:"pending",detected_subtype:kind,confidence,title:titleFor(lines,kind),document_reference:reference,related_reference:related,client_name:fields.client_name,project_name:fields.project_name,document_date:fields.document_date,subtotal,discount_amount:discount,vat_amount:vat,grand_total:total,suggested_effect:suggestedEffect(kind),extracted_fields:fields,extracted_line_items:items,warnings,raw_text_preview:text.slice(0,5000),analysis_version:`extracted_text_v1:${engine}`,analysed_at:now,updated_at:now},{onConflict:"document_id"});if(ie)throw new Error(ie.message);
    const ready=!isOcr&&kind!=="other"&&confidence>=90;const status=ready?"ready":"needs_review";await sb.from("intake_items").update({detected_type:kind,detected_project_id:projectId,confidence,status,suggested_action:{action:"review_project_document",project_id:projectId,project_code:best.project_code},message:ready?`${kind.replaceAll("_"," ")} understood and matched to ${best.name}.`:`I read this ${kind.replaceAll("_"," ")} and matched it to ${best.name}. Confirm the interpretation before it changes accounting.`}).eq("id",item.id);
    return out({ok:true,type:kind,status,projectId,projectName:best.name,confidence,total,lineItems:items.length,message:ready?`Matched to ${best.name}.`:`Matched to ${best.name}; confirmation needed.`});
  }catch(e){const msg=e instanceof Error?e.message:"Extracted document analysis failed";await sb.from("intake_items").update({status:"needs_review",message:`The original file is safe, but analysis needs review: ${msg}`}).eq("id",item.id);return out({error:msg},500);}
});
