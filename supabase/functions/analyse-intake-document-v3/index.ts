import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import * as XLSX from "npm:xlsx@0.18.5";

const H={"Access-Control-Allow-Origin":"*","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS"};
const out=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{...H,"content-type":"application/json"}});
const norm=(s:unknown)=>String(s??"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
const compact=(s:unknown)=>norm(s).replace(/\s/g,"");
const safe=(s:string)=>s.replace(/[^a-zA-Z0-9._-]/g,"_").slice(0,120);

function institution(text:string){
  const t=` ${text.toLowerCase()} `;
  const banks:[string,string][]=[
    ["opay","OPay"],["access bank","Access Bank"],["united bank for africa","UBA"],[" uba ","UBA"],
    ["carbon","Carbon"],["gtbank","GTBank"],["guaranty trust","GTBank"],["zenith","Zenith Bank"],
    ["stanbic","Stanbic IBTC"],["first bank","First Bank"],["fcmb","FCMB"],["fidelity","Fidelity Bank"],
    ["moniepoint","Moniepoint"],["palmpay","PalmPay"],["kuda","Kuda"],["sterling bank","Sterling Bank"],
    ["wema bank","Wema Bank"],["alat","Wema Bank"],["union bank","Union Bank"],["polaris","Polaris Bank"],
    ["ecobank","Ecobank"],["keystone","Keystone Bank"],["providus","Providus Bank"],["jaiz","Jaiz Bank"],
    ["globus","Globus Bank"],["standard chartered","Standard Chartered"],["citibank","Citibank"]
  ];
  for(const [key,name] of banks)if(t.includes(key))return name;
  return null;
}
function accountNumber(text:string){for(const re of [/(?:account\s*(?:number|no\.?|#))\s*[:\-]?\s*([0-9*Xx-]{6,20})/i,/\b([0-9]{10})\b/]){const m=text.match(re);if(m)return m[1].replace(/\s/g,"")}return null;}
function looksStatement(text:string,headers:string[]=[]){const t=text.toLowerCase();const header=norm(headers.join(" "));let s=0;if(/statement of account|account statement|transaction history|bank statement/.test(t))s+=4;if(/opening balance|closing balance|running balance/.test(t))s+=2;if(/debit/.test(t)&&/credit/.test(t)&&/balance/.test(t))s+=3;if(/transaction date|value date|reference/.test(t))s+=2;if(header.includes("date")&&(header.includes("debit")||header.includes("credit")||header.includes("amount"))&&(header.includes("balance")||header.includes("description")||header.includes("narration")))s+=5;return s>=5;}
function accountKind(name:string,text=""){const n=norm(`${name} ${text.slice(0,12000)}`);if(/saving|owealth|wealth|interest earned|auto save/.test(n))return "savings";if(/wallet|main account/.test(n))return "wallet";return "account";}
function accountLabel(bank:string,sheet:string,kind:string){return kind==="savings"?`${bank} Savings`:kind==="wallet"?`${bank} Wallet`:`${bank} ${sheet.replace(/transactions?/ig,"").trim()||"Account"}`;}
async function sha256(bytes:Uint8Array){const d=await crypto.subtle.digest("SHA-256",bytes);return Array.from(new Uint8Array(d)).map(b=>b.toString(16).padStart(2,"0")).join("");}
function previewRows(ws:any,maxRows=220){const ref=ws?.["!ref"];if(!ref)return [] as unknown[][];const r=XLSX.utils.decode_range(ref);const range={s:{r:0,c:0},e:{r:Math.min(r.e.r,maxRows-1),c:Math.min(r.e.c,20)}};return XLSX.utils.sheet_to_json(ws,{header:1,defval:"",raw:false,blankrows:false,range}) as unknown[][];}
function readOneSheet(bytes:Uint8Array,name:string){const wb=XLSX.read(bytes,{type:"array",sheets:[name],raw:false,cellDates:true,dense:true,cellStyles:false,cellNF:false,cellHTML:false});return wb.Sheets[name];}

Deno.serve(async(req:Request)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:H});
  if(req.method!=="POST")return out({error:"POST required"},405);
  const auth=req.headers.get("Authorization")??"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")!;
  const url=Deno.env.get("SUPABASE_URL")!;
  const sb=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const {data:{user}}=await sb.auth.getUser();if(!user)return out({error:"Sign in again."},401);
  const body=await req.json().catch(()=>({}));
  const documentId=String(body?.documentId??"");const batchId=String(body?.batchId??"");
  if(!documentId||!batchId)return out({error:"documentId and batchId are required"},400);
  const {data:doc,error:de}=await sb.from("source_documents").select("id,company_id,project_id,file_name,storage_path,metadata").eq("id",documentId).single();if(de||!doc)return out({error:de?.message||"Document not found"},404);
  const {data:item}=await sb.from("intake_items").select("id").eq("document_id",documentId).eq("batch_id",batchId).maybeSingle();if(!item)return out({error:"Intake item not found"},404);

  const proxyGeneric=async()=>{const proxied=await fetch(`${url}/functions/v1/analyse-intake-document`,{method:"POST",headers:{Authorization:auth,apikey:anon,"content-type":"application/json"},body:JSON.stringify({documentId,batchId})});const payload=await proxied.json().catch(()=>({error:"Analysis returned an unreadable response."}));return out(payload,proxied.status);};

  try{
    const ext=String((doc.metadata as any)?.extension??doc.file_name.split(".").pop()??"").toLowerCase();
    if(!["xlsx","xls"].includes(ext))return await proxyGeneric();

    const bucket=String((doc.metadata as any)?.bucket||"universal-intake");
    const {data:blob,error:be}=await sb.storage.from(bucket).download(doc.storage_path);if(be||!blob)throw new Error(be?.message||"Could not read uploaded workbook");
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const meta=XLSX.read(bytes,{type:"array",bookSheets:true});
    const statementSheets:{name:string;text:string;headers:string[]}[]=[];
    for(const name of meta.SheetNames){
      const ws=readOneSheet(bytes,name);const rows=previewRows(ws,220);let header:unknown[]=[];
      for(const row of rows.slice(0,50))if(row.filter(Boolean).length>header.filter(Boolean).length)header=row;
      const headers=header.map(String);const text=rows.map(r=>r.map(v=>String(v??"")).join(" | ")).join("\n");
      if(looksStatement(`${name}\n${text}`,headers))statementSheets.push({name,text,headers});
    }
    if(statementSheets.length===0)return await proxyGeneric();

    const {data:loadedAccounts}=await sb.from("financial_accounts").select("id,institution_name,institution_key,account_name,account_number_masked,account_type").eq("company_id",doc.company_id).eq("is_active",true);
    const accounts:any[]=[...(loadedAccounts??[])];

    const resolveAccount=async(s:{name:string;text:string})=>{
      const detectedBank=institution(`${doc.file_name}\n${s.name}\n${s.text}`);
      const bank=detectedBank||"Bank / financial account";
      const acctNo=accountNumber(s.text);
      const kind=accountKind(s.name,s.text);
      const label=accountLabel(bank,s.name,kind);
      const targetNo=String(acctNo??"").replace(/[^0-9]/g,"");
      const sameNumber=targetNo?accounts.filter((a:any)=>String(a.account_number_masked??"").replace(/[^0-9]/g,"")===targetNo):[];
      const sameBank=detectedBank?accounts.filter((a:any)=>compact(a.institution_name)===compact(bank)||compact(a.institution_key).startsWith(compact(bank))):accounts;
      let account:any=null;
      if(kind==="savings")account=sameBank.find((a:any)=>/saving|owealth|wealth/.test(norm(`${a.account_name} ${a.institution_key}`)))??null;
      else if(kind==="wallet")account=sameBank.find((a:any)=>/wallet/.test(norm(`${a.account_name} ${a.institution_key}`)))??null;
      if(!account&&sameNumber.length===1)account=sameNumber[0];
      if(!account&&kind==="account"&&sameBank.length===1)account=sameBank[0];
      if(!account&&!detectedBank)return {account:null,bank,acctNo,kind,label};
      if(!account){
        const {data:created,error:ce}=await sb.from("financial_accounts").insert({company_id:doc.company_id,account_type:/opay|carbon|moniepoint|palmpay|kuda/i.test(bank)?"fintech_wallet":"bank",institution_name:bank,institution_key:`${compact(bank)}_${kind}`,account_name:label,account_number_masked:acctNo,created_by:user.id}).select("id,institution_name,account_name,account_number_masked,account_type,institution_key").single();
        if(ce||!created)throw new Error(ce?.message||`Could not create ${label}`);account=created;accounts.push(created);
      }
      return {account,bank,acctNo,kind,label};
    };

    // A one-sheet workbook is processed directly. This prevents a Savings/OWealth
    // ledger sharing an account number with a Wallet ledger from being attached to
    // the wrong account merely because the account number is identical.
    if(statementSheets.length===1){
      const s=statementSheets[0];const resolved=await resolveAccount(s);
      if(!resolved.account){
        await sb.from("source_documents").update({document_type:"bank_statement",project_id:null,metadata:{...(doc.metadata as any),bucket,universal_intake_type:"bank_statement",account_kind:resolved.kind}}).eq("id",documentId);
        await sb.from("intake_items").update({detected_type:"bank_statement",detected_project_id:null,confidence:90,status:"needs_review",suggested_action:{action:"confirm_financial_account",institution:resolved.bank,account_number:resolved.acctNo,account_kind:resolved.kind},message:"Statement transactions were recognised, but the financial account needs confirmation before posting."}).eq("id",item.id);
        return out({ok:true,type:"bank_statement",status:"needs_review",message:"Financial account confirmation needed."});
      }
      await sb.from("source_documents").update({document_type:"bank_statement",project_id:null,source_name:resolved.bank,metadata:{...(doc.metadata as any),bucket,universal_intake_type:"bank_statement",detected_institution:resolved.bank,detected_account_number:resolved.acctNo,account_kind:resolved.kind,source_sheet:s.name}}).eq("id",documentId);
      let {data:imp}=await sb.from("statement_imports").select("id,status,rows_total").eq("document_id",documentId).maybeSingle();
      if(!imp){const {data:createdImp,error:ie}=await sb.from("statement_imports").insert({document_id:documentId,company_id:doc.company_id,financial_account_id:resolved.account.id,detected_institution_name:resolved.bank,detected_account_name:resolved.account.account_name,detected_account_number_masked:resolved.acctNo,status:"uploaded",detected_as_new_account:false,rows_total:0,rows_new:0,rows_already_known:0,rows_need_review:0}).select("id,status,rows_total").single();if(ie||!createdImp)throw new Error(ie?.message||"Could not create statement import");imp=createdImp;}
      else await sb.from("statement_imports").update({financial_account_id:resolved.account.id,detected_institution_name:resolved.bank,detected_account_name:resolved.account.account_name,detected_account_number_masked:resolved.acctNo}).eq("id",imp.id);
      const analysed=await fetch(`${url}/functions/v1/analyse-statement`,{method:"POST",headers:{Authorization:auth,apikey:anon,"content-type":"application/json"},body:JSON.stringify({importId:imp.id})});
      const result=await analysed.json().catch(()=>({}));
      const status=analysed.ok?"applied":"needs_review";
      const rows=Number(result?.rows_total??result?.rows??result?.totalRows??0);
      await sb.from("intake_items").update({detected_type:"bank_statement",detected_project_id:null,confidence:99,status,suggested_action:{action:"open_statement",statement_import_id:imp.id},message:analysed.ok?`Statement processed as ${resolved.account.account_name}. ${rows} transaction rows found.`:(result?.error||"Statement needs review.")}).eq("id",item.id);
      return out({ok:true,type:"bank_statement",status,statementImportId:imp.id,statementAccounts:[resolved.account.account_name],rows,message:analysed.ok?`Processed ${resolved.account.account_name}.`:(result?.error||"Statement needs review")});
    }

    const imports:any[]=[];let totalRows=0;let failed=0;
    for(let i=0;i<statementSheets.length;i++){
      const s=statementSheets[i];const resolved=await resolveAccount(s);
      if(!resolved.account){failed++;imports.push({sheet:s.name,account:resolved.label,status:"needs_review",message:"Financial account confirmation needed"});continue;}
      const ws=readOneSheet(bytes,s.name);const childWb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(childWb,ws,s.name.slice(0,31));
      const childBytes=new Uint8Array(XLSX.write(childWb,{type:"array",bookType:"xlsx",bookSST:false}));const childHash=await sha256(childBytes);
      const {data:existingChild}=await sb.from("source_documents").select("id,storage_path,metadata").eq("company_id",doc.company_id).eq("document_type","bank_statement").eq("file_hash",childHash).limit(1).maybeSingle();let child:any=existingChild;
      if(!child){
        const childPath=`${doc.company_id}/intake/split/${new Date().getUTCFullYear()}/${documentId}-${i+1}-${safe(s.name)}.xlsx`;
        const {error:ue}=await sb.storage.from("universal-intake").upload(childPath,childBytes,{contentType:"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",upsert:true});if(ue)throw new Error(ue.message);
        const {data:createdDoc,error:cde}=await sb.from("source_documents").insert({company_id:doc.company_id,project_id:null,document_type:"bank_statement",file_name:`${doc.file_name.replace(/\.[^.]+$/,"")} - ${s.name}.xlsx`,storage_path:childPath,file_hash:childHash,source_name:resolved.bank,metadata:{bucket:"universal-intake",extension:"xlsx",parent_document_id:documentId,source_sheet:s.name,generated_from_multi_sheet:true,account_kind:resolved.kind},uploaded_by:user.id}).select("id,storage_path,metadata").single();if(cde||!createdDoc)throw new Error(cde?.message||"Could not register split statement");child=createdDoc;
      }
      let {data:imp}=await sb.from("statement_imports").select("id,status,rows_total").eq("document_id",child.id).maybeSingle();
      if(!imp){const {data:createdImp,error:ie}=await sb.from("statement_imports").insert({document_id:child.id,company_id:doc.company_id,financial_account_id:resolved.account.id,detected_institution_name:resolved.bank,detected_account_name:resolved.account.account_name,detected_account_number_masked:resolved.acctNo,status:"uploaded",detected_as_new_account:false,rows_total:0,rows_new:0,rows_already_known:0,rows_need_review:0}).select("id,status,rows_total").single();if(ie||!createdImp)throw new Error(ie?.message||"Could not create statement import");imp=createdImp;}
      else await sb.from("statement_imports").update({financial_account_id:resolved.account.id,detected_institution_name:resolved.bank,detected_account_name:resolved.account.account_name,detected_account_number_masked:resolved.acctNo}).eq("id",imp.id);
      const analysed=await fetch(`${url}/functions/v1/analyse-statement`,{method:"POST",headers:{Authorization:auth,apikey:anon,"content-type":"application/json"},body:JSON.stringify({importId:imp.id})});const result=await analysed.json().catch(()=>({}));
      if(!analysed.ok){failed++;imports.push({sheet:s.name,account:resolved.account.account_name,importId:imp.id,status:"needs_review",message:result?.error||"Statement needs review"});continue;}
      const rows=Number(result?.rows_total??result?.rows??result?.totalRows??0);totalRows+=rows;imports.push({sheet:s.name,account:resolved.account.account_name,importId:imp.id,status:"applied",rows});
    }
    const applied=imports.filter(x=>x.status==="applied");const first=imports.find(x=>x.importId)?.importId;const message=failed?`${applied.length} of ${imports.length} statement sheets were processed separately; ${failed} need review.`:`Processed ${imports.length} statement sheets separately (${imports.map(x=>x.account).join(" + ")}).`;
    await sb.from("source_documents").update({document_type:"bank_statement",project_id:null,source_name:imports.map(x=>x.account).join(" + "),metadata:{...(doc.metadata as any),bucket,universal_intake_type:"bank_statement_multi_sheet",split_statement_imports:imports}}).eq("id",documentId);
    await sb.from("intake_items").update({detected_type:"bank_statement",detected_project_id:null,confidence:99,status:failed?"needs_review":"applied",suggested_action:{action:"open_statement",statement_import_id:first,statement_import_ids:imports.filter(x=>x.importId).map(x=>x.importId)},message}).eq("id",item.id);
    return out({ok:true,type:"bank_statement",status:failed?"needs_review":"applied",statementImportId:first,statementImportIds:imports.filter(x=>x.importId).map(x=>x.importId),statementAccounts:imports.map(x=>x.account),rows:totalRows,message});
  }catch(e){const msg=e instanceof Error?e.message:"Intake analysis failed";console.error("intake-v4 failed",msg);await sb.from("intake_items").update({status:"failed",message:msg}).eq("id",item.id);return out({error:msg},500);}
});
