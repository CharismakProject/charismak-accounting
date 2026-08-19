"use client";

import { FormEvent, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "../../../lib/supabase/client";

type ItemStatus = "ready" | "checking" | "uploading" | "analysing" | "discovering" | "posting" | "done" | "duplicate" | "error";
type BatchItem = { id:string; file:File; institution:string; accountName:string; accountNumber:string; status:ItemStatus; message:string; importId?:string; rows?:number; projectSignals?:number; autoPosted?:number; pendingReview?:number; };

async function sha256(file: File) { const bytes=await file.arrayBuffer(); const digest=await crypto.subtle.digest("SHA-256",bytes); return Array.from(new Uint8Array(digest)).map(b=>b.toString(16).padStart(2,"0")).join(""); }
function safeFileName(name:string){return name.replace(/[^a-zA-Z0-9._-]/g,"_");}
function inferInstitution(name:string){const v=name.toLowerCase();if(v.includes("opay")||v.includes("owealth"))return "OPay";if(v.includes("access"))return "Access Bank";if(v.includes("carbon"))return "Carbon";if(v.includes("gtb")||v.includes("gtbank")||v.includes("guaranty"))return "GTBank";if(v.includes("uba"))return "UBA";if(v.includes("zenith"))return "Zenith Bank";if(v.includes("stanbic"))return "Stanbic IBTC";if(v.includes("firstbank")||v.includes("first_bank"))return "FirstBank";return "";}
function inferAccountType(institution:string){const v=institution.toLowerCase();return v.includes("opay")||v.includes("carbon")||v.includes("palmpay")?"fintech_wallet":"bank";}
function statusLabel(status:ItemStatus){if(status==="checking")return "Checking duplicate/account…";if(status==="uploading")return "Uploading securely…";if(status==="analysing")return "Analysing transactions…";if(status==="discovering")return "Finding projects & keywords…";if(status==="posting")return "Updating matched projects…";if(status==="done")return "Processed";if(status==="duplicate")return "Already uploaded";if(status==="error")return "Needs attention";return "Ready";}

export default function UploadStatementClient(){
  const router=useRouter(); const supabase=useMemo(()=>createClient(),[]); const [items,setItems]=useState<BatchItem[]>([]); const [busy,setBusy]=useState(false); const [batchMessage,setBatchMessage]=useState("");
  const updateItem=(id:string,patch:Partial<BatchItem>)=>setItems(current=>current.map(item=>item.id===id?{...item,...patch}:item));
  function addFiles(files:FileList|null){if(!files?.length)return;setBatchMessage("");setItems(current=>{const existing=new Set(current.map(i=>`${i.file.name}|${i.file.size}|${i.file.lastModified}`));const additions=Array.from(files).filter(f=>!existing.has(`${f.name}|${f.size}|${f.lastModified}`)).map(file=>{const institution=inferInstitution(file.name);return{id:crypto.randomUUID(),file,institution,accountName:institution?`${institution} Account`:"",accountNumber:"",status:"ready" as const,message:"Confirm the account details below before processing."};});return[...current,...additions];});}
  function removeItem(id:string){if(!busy)setItems(current=>current.filter(item=>item.id!==id));}

  async function processItem(item:BatchItem,companyId:string,userId:string){
    const ext=item.file.name.split(".").pop()?.toLowerCase()??"";
    if(!["pdf","csv","xls","xlsx"].includes(ext))throw new Error("Use PDF, CSV, XLS or XLSX.");
    if(item.file.size>20*1024*1024)throw new Error("File is larger than the 20 MB statement limit.");
    if(!item.institution.trim()||!item.accountName.trim())throw new Error("Bank/institution and account label are required.");

    updateItem(item.id,{status:"checking",message:"Checking exact duplicate and matching financial account."});
    const fileHash=await sha256(item.file);
    const {data:duplicate,error:duplicateError}=await supabase.from("source_documents").select("id").eq("company_id",companyId).eq("document_type","bank_statement").eq("file_hash",fileHash).maybeSingle();
    if(duplicateError)throw new Error(duplicateError.message);
    if(duplicate){const {data:existingImport}=await supabase.from("statement_imports").select("id,rows_total,rows_auto_posted,rows_pending_review").eq("document_id",duplicate.id).maybeSingle();updateItem(item.id,{status:"duplicate",importId:existingImport?.id,rows:Number(existingImport?.rows_total??0),autoPosted:Number(existingImport?.rows_auto_posted??0),pendingReview:Number(existingImport?.rows_pending_review??0),message:"This exact file is already stored. Nothing was counted twice."});return;}

    const accountType=inferAccountType(item.institution);
    let accountQuery=supabase.from("financial_accounts").select("id").eq("company_id",companyId).eq("account_type",accountType);
    accountQuery=item.accountNumber.trim()?accountQuery.eq("account_number_masked",item.accountNumber.trim()):accountQuery.ilike("account_name",item.accountName.trim()).ilike("institution_name",item.institution.trim());
    const {data:existingAccount,error:accountLookupError}=await accountQuery.limit(1).maybeSingle(); if(accountLookupError)throw new Error(accountLookupError.message);
    let accountId=existingAccount?.id as string|undefined; const isNewAccount=!accountId;
    if(!accountId){const {data:createdAccount,error:accountError}=await supabase.from("financial_accounts").insert({company_id:companyId,account_type:accountType,institution_name:item.institution.trim(),institution_key:item.institution.trim().toLowerCase().replace(/[^a-z0-9]+/g,"_"),account_name:item.accountName.trim(),account_number_masked:item.accountNumber.trim()||null,created_by:userId}).select("id").single();if(accountError)throw new Error(accountError.message);accountId=createdAccount.id;}

    updateItem(item.id,{status:"uploading",message:"Saving the original statement privately."});
    const storagePath=`${companyId}/bank-statements/${new Date().getUTCFullYear()}/${Date.now()}-${safeFileName(item.file.name)}`;
    const {error:storageError}=await supabase.storage.from("financial-documents").upload(storagePath,item.file,{contentType:item.file.type||"application/octet-stream",upsert:false}); if(storageError)throw new Error(`Secure upload failed: ${storageError.message}`);
    const {data:document,error:documentError}=await supabase.from("source_documents").insert({company_id:companyId,document_type:"bank_statement",file_name:item.file.name,storage_path:storagePath,file_hash:fileHash,source_name:item.institution.trim(),metadata:{original_size:item.file.size,extension:ext,mime_type:item.file.type||null,upload_method:"batch_browser_storage"},uploaded_by:userId}).select("id").single();
    if(documentError){await supabase.storage.from("financial-documents").remove([storagePath]);throw new Error(`Statement registration failed: ${documentError.message}`);}
    const {data:statementImport,error:importError}=await supabase.from("statement_imports").insert({document_id:document.id,company_id:companyId,financial_account_id:accountId,detected_institution_name:item.institution.trim(),detected_account_name:item.accountName.trim(),detected_account_number_masked:item.accountNumber.trim()||null,status:"uploaded",detected_as_new_account:isNewAccount}).select("id").single(); if(importError)throw new Error(`Import registration failed: ${importError.message}`);

    updateItem(item.id,{status:"analysing",importId:statementImport.id,message:"Extracting dates, amounts, references and narrations."});
    const {data:analysis,error:analyseError}=await supabase.functions.invoke("analyse-statement",{body:{importId:statementImport.id}});
    if(analyseError||analysis?.error){updateItem(item.id,{status:"error",importId:statementImport.id,message:`File uploaded, but analysis failed: ${analysis?.error||analyseError?.message||"Unknown analyser error"}`});return;}
    const rowCount=Number(analysis?.rows??analysis?.finalized?.rows??0);

    updateItem(item.id,{status:"discovering",rows:rowCount,message:`Analysed ${rowCount.toLocaleString()} transactions. Matching existing and possible new projects.`});
    const {error:discoveryError}=await supabase.rpc("discover_statement_projects",{target_import:statementImport.id});
    if(discoveryError){updateItem(item.id,{status:"error",rows:rowCount,importId:statementImport.id,message:`Transactions were extracted, but project discovery failed: ${discoveryError.message}`});return;}
    const {data:discoverySummary}=await supabase.rpc("statement_project_discovery_summary",{target_import:statementImport.id});
    const existingCount=Array.isArray(discoverySummary?.existing_projects)?discoverySummary.existing_projects.length:0; const candidateCount=Array.isArray(discoverySummary?.candidates)?discoverySummary.candidates.length:0; const signals=existingCount+candidateCount;

    updateItem(item.id,{status:"posting",rows:rowCount,projectSignals:signals,message:"Updating projects for unique high-confidence matches. Ambiguous rows will stay for review."});
    const {data:posting,error:postingError}=await supabase.rpc("auto_post_statement_matches",{target_import:statementImport.id,minimum_confidence:94});
    if(postingError){updateItem(item.id,{status:"error",rows:rowCount,projectSignals:signals,importId:statementImport.id,message:`Analysis is stored, but automatic project posting failed: ${postingError.message}`});return;}
    const autoPosted=Number(posting?.autoPosted??0),pendingReview=Number(posting?.pendingReview??0);
    updateItem(item.id,{status:"done",rows:rowCount,projectSignals:signals,autoPosted,pendingReview,message:`Complete: ${autoPosted.toLocaleString()} confidently matched transaction${autoPosted===1?"":"s"} posted automatically; ${pendingReview.toLocaleString()} unresolved row${pendingReview===1?"":"s"} left for review.${candidateCount?` ${candidateCount} possible new-project signal${candidateCount===1?"":"s"} need a decision.`:""}`});
  }

  async function submit(event:FormEvent){event.preventDefault();setBatchMessage("");if(!items.length){setBatchMessage("Choose one or more statements first.");return;}setBusy(true);const {data:authData,error:authError}=await supabase.auth.getUser();if(authError||!authData.user){router.push("/login");return;}const {data:membership,error:membershipError}=await supabase.from("company_memberships").select("company_id").eq("user_id",authData.user.id).eq("status","active").limit(1).maybeSingle();if(membershipError||!membership){setBusy(false);setBatchMessage(membershipError?.message||"No active company membership was found.");return;}for(const original of items){try{await processItem(original,membership.company_id,authData.user.id);}catch(cause){updateItem(original.id,{status:"error",message:cause instanceof Error?cause.message:"This statement could not be processed."});}}setBusy(false);setBatchMessage("Batch processing finished. Confident existing-project matches were posted automatically; open review for unresolved rows and possible new projects.");router.refresh();}

  const completed=items.filter(item=>item.status==="done"||item.status==="duplicate").length;
  return <form className="statement-form" onSubmit={submit}>
    <label className="file-drop batch-picker"><input type="file" multiple accept=".pdf,.csv,.xls,.xlsx" onChange={event=>{addFiles(event.target.files);event.currentTarget.value="";}}/><div><strong>{items.length?`${items.length} statement${items.length===1?"":"s"} selected`:"Choose one or more bank statements"}</strong><span>Upload OPay, Access Bank, Carbon and other accounts together · PDF/CSV/XLS/XLSX · max 20 MB each</span></div><b>{items.length?"Add more":"Browse"}</b></label>
    {items.length>0&&<div className="batch-list">{items.map((item,index)=><article className={`batch-item ${item.status==="error"?"has-error":item.status==="done"?"is-done":""}`} key={item.id}><div className="batch-item-head"><div><small>Statement {index+1}</small><strong title={item.file.name}>{item.file.name}</strong><span>{(item.file.size/1024/1024).toFixed(2)} MB</span></div><div className="batch-item-actions"><em>{statusLabel(item.status)}</em>{!busy&&<button type="button" onClick={()=>removeItem(item.id)} aria-label={`Remove ${item.file.name}`}>×</button>}</div></div><div className="batch-fields"><label className="field"><span>Bank / institution</span><input disabled={busy} value={item.institution} onChange={e=>updateItem(item.id,{institution:e.target.value})} placeholder="OPay, Access Bank, Carbon…"/></label><label className="field"><span>Account label</span><input disabled={busy} value={item.accountName} onChange={e=>updateItem(item.id,{accountName:e.target.value})} placeholder="e.g. OPay Business"/></label><label className="field"><span>Account number / identifier</span><input disabled={busy} value={item.accountNumber} onChange={e=>updateItem(item.id,{accountNumber:e.target.value})} placeholder="Optional, but improves account matching"/></label></div><div className={`batch-result ${item.status==="error"?"error":item.status==="done"?"success":item.status==="duplicate"?"warning":""}`}><span>{item.message}</span>{typeof item.rows==="number"&&<b>{item.rows.toLocaleString()} rows</b>}{typeof item.autoPosted==="number"&&<b>{item.autoPosted.toLocaleString()} auto-posted</b>}{typeof item.pendingReview==="number"&&<b>{item.pendingReview.toLocaleString()} review</b>}{item.importId&&<a href={`/statements/${item.importId}`}>Open review →</a>}</div></article>)}</div>}
    {batchMessage&&<div className="info-strip"><b>{busy?"Processing batch":"Batch status"}</b><span>{batchMessage}</span></div>}
    <div className="batch-footer"><span>{items.length?`${completed}/${items.length} complete`:"No files selected"}</span><button className="primary-action" disabled={busy||!items.length} type="submit">{busy?"Processing statements…":`Upload & analyse ${items.length||""} statement${items.length===1?"":"s"}`}</button></div>
  </form>;
}
