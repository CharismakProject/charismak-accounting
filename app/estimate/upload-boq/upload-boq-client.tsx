"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { createClient } from "../../../lib/supabase/client";
import type { SectionedBoq } from "../../../lib/estimate/sectioned-boq";
import type { ReviewedBoqDecisionMap } from "../../../lib/estimate/review-decision";
import type { WorkingRateMap } from "../../../lib/estimate/estimate-summary";
import { initialWorkingRates } from "../../../lib/estimate/estimate-summary";
import { parseBoqPdfText } from "../../../lib/estimate/boq-pdf-text-parser";
import { readPdfTextDocument, readVisualDocument } from "../../add/client-ocr";
import SectionedBoqClient from "../boq/sectioned-boq-client";
import BoqReviewClient from "./boq-review-client";
import BoqRateClient from "./boq-rate-client";
import BoqMaterialsClient from "./boq-materials-client";
import BoqEstimateSummaryClient from "./boq-estimate-summary-client";

type Warning = { sheet: string; row?: number; message: string };
type ParseResult = {
  ok?: boolean;
  error?: string;
  boq?: SectionedBoq;
  warnings?: Warning[];
  recognizedSheets?: string[];
  supportSheets?: string[];
  legacySheets?: string[];
  skippedSheets?: string[];
  itemCount?: number;
  sourceKind?: "workbook"|"pdf_text"|"pdf_ocr";
  reviewSummary?: { clearItems: number; attentionItems: number; totalItems: number };
};

const MAX_BYTES = 12 * 1024 * 1024;
const allowed = new Set(["xlsx", "xls", "csv", "pdf"]);
const safe = (name:string)=>name.replace(/[^a-zA-Z0-9._-]/g,"_");

export default function UploadBoqClient({ companyId, companyName }: { companyId: string; companyName?: string }){
  const supabase = useMemo(()=>createClient(),[]);
  const [file,setFile]=useState<File|null>(null);
  const [busy,setBusy]=useState(false);
  const [message,setMessage]=useState("");
  const [result,setResult]=useState<ParseResult|null>(null);
  const [reviewDecisions,setReviewDecisions]=useState<ReviewedBoqDecisionMap>({});
  const [materializedBoq,setMaterializedBoq]=useState<SectionedBoq|null>(null);
  const [workingRates,setWorkingRates]=useState<WorkingRateMap>({});
  const [sourceReviewIssue,setSourceReviewIssue]=useState<string|null>(null);

  function resetDerived(){setReviewDecisions({});setMaterializedBoq(null);setWorkingRates({});setSourceReviewIssue(null);}
  function choose(next: File | null){
    setResult(null);setMessage("");setFile(next);resetDerived();
    if(!next)return;
    const ext=(next.name.split(".").pop()||"").toLowerCase();
    if(!allowed.has(ext))setMessage("Choose a BOQ in XLSX, XLS, CSV or PDF format.");
    else if(next.size>MAX_BYTES)setMessage("This BOQ is over the 12 MB preview limit.");
  }

  function acceptParsed(parsed:ParseResult){
    setResult(parsed);setMaterializedBoq(parsed.boq??null);
    if(parsed.boq)setWorkingRates(initialWorkingRates(parsed.boq));
    setMessage(parsed.itemCount?`${parsed.itemCount} primary BOQ item${parsed.itemCount===1?"":"s"} detected. Review meaning and rates, calculate materials, then prepare the estimate summary and project stage.`:"No primary BOQ items were detected.");
  }

  async function parsePdf(next:File){
    let selectableError:unknown=null;
    try{
      const extracted=await readPdfTextDocument(next,setMessage);
      if(extracted.text.trim().length<80)throw new Error("This PDF has too little selectable BOQ text.");
      const parsed=parseBoqPdfText(extracted.text,next.name,"selectable_text");
      const issue=extracted.truncated?"PDF text extraction reached the safety limit, so the full source document has not been verified.":null;
      setSourceReviewIssue(issue);
      acceptParsed({boq:parsed.boq,itemCount:parsed.itemCount,sourceKind:"pdf_text",recognizedSheets:[`PDF · ${extracted.pages} page${extracted.pages===1?"":"s"}`],warnings:parsed.warnings.map(w=>({sheet:"PDF",row:w.line,message:w.message})),reviewSummary:parsed.reviewSummary});
      return;
    }catch(error){selectableError=error;}
    setMessage("Selectable PDF text was not sufficient. Reading the scanned pages on this device for review…");
    try{
      const visual=await readVisualDocument(next,setMessage);
      if(visual.text.trim().length<40)throw new Error("No usable BOQ text could be read from this scanned PDF.");
      const parsed=parseBoqPdfText(visual.text,next.name,"ocr");
      const issue="This BOQ was reconstructed from OCR. Check every extracted item against the original PDF; OCR-derived BOQs are review/export only in V1 and cannot create a Project.";
      setSourceReviewIssue(issue);
      acceptParsed({boq:parsed.boq,itemCount:parsed.itemCount,sourceKind:"pdf_ocr",recognizedSheets:[`Scanned PDF · ${visual.pages} page${visual.pages===1?"":"s"}`],warnings:[...parsed.warnings.map(w=>({sheet:"PDF OCR",row:w.line,message:w.message})),{sheet:"PDF OCR",message:`Average OCR confidence: ${Math.round(visual.confidence)}%.`}],reviewSummary:parsed.reviewSummary});
    }catch(ocrError){
      const first=selectableError instanceof Error?selectableError.message:"Selectable PDF text could not be reconstructed.";
      const second=ocrError instanceof Error?ocrError.message:"OCR could not reconstruct the scanned PDF.";
      throw new Error(`${first} ${second}`);
    }
  }

  async function parse(){
    if(!file||busy)return;
    const ext=(file.name.split(".").pop()||"").toLowerCase();
    if(!allowed.has(ext)||file.size>MAX_BYTES)return;
    setBusy(true);setResult(null);resetDerived();
    let storagePath="";
    try{
      if(ext==="pdf"){
        setMessage("Reading PDF BOQ page by page on this device…");
        await parsePdf(file);
        return;
      }
      setMessage("Uploading a temporary copy for BOQ analysis…");
      storagePath=`${companyId}/boq-preview/${Date.now()}-${crypto.randomUUID().slice(0,8)}-${safe(file.name)}`;
      const {error:uploadError}=await supabase.storage.from("universal-intake").upload(storagePath,file,{contentType:file.type||undefined,upsert:false});
      if(uploadError)throw new Error(uploadError.message);
      setMessage("Detecting primary bill sheets, support schedules, headings, sections and BOQ items…");
      const {data,error}=await supabase.functions.invoke("parse-boq-workbook",{body:{bucket:"universal-intake",storagePath,fileName:file.name}});
      if(error)throw new Error(error.message||"BOQ parser could not run.");
      const parsed=data as ParseResult;
      if(parsed.error&&!parsed.boq)throw new Error(parsed.error);
      acceptParsed({...parsed,sourceKind:"workbook"});
    }catch(error){
      setMessage(error instanceof Error?error.message:"Could not parse this BOQ.");
    }finally{
      if(storagePath)await supabase.storage.from("universal-intake").remove([storagePath]).catch(()=>undefined);
      setBusy(false);
    }
  }

  return <main className="page-canvas">
    <div className="page-wrap" style={{maxWidth:1180}}>
      <div className="page-toolbar"><Link href="/estimate" className="back-link">← Estimate</Link><span style={{fontSize:10,color:"#738292"}}>Charismak App · Upload BOQ</span></div>
      <header className="page-heading compact">
        <p className="page-eyebrow">BOQ IMPORT</p>
        <h1>Upload the BOQ you already use</h1>
        <p>Charismak reads Excel, CSV and PDF bills, separates primary work from support schedules, keeps the bill sectioned, and lets you review meaning, rates, material quantities and commercial adjustments before anything becomes a project budget.</p>
      </header>

      <section className="data-card" style={{padding:18,display:"grid",gap:13}}>
        <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:12,alignItems:"center"}}>
          <label style={{border:"1.5px dashed #9db8ca",borderRadius:14,padding:"18px",background:"#f8fbfd",cursor:"pointer",display:"block"}}>
            <input type="file" accept=".xlsx,.xls,.csv,.pdf" onChange={(event)=>choose(event.target.files?.[0]??null)} style={{display:"none"}}/>
            <b style={{display:"block",fontSize:14,color:"#173f5a"}}>{file?file.name:"Choose BOQ file"}</b>
            <span style={{display:"block",marginTop:4,fontSize:11,color:"#718391"}}>XLSX · XLS · CSV · PDF · up to 12 MB</span>
          </label>
          <button type="button" onClick={parse} disabled={!file||busy||Boolean(message&&file&&file.size>MAX_BYTES)} className="primary-link-button" style={{border:0,cursor:"pointer",opacity:!file||busy?.6:1}}>{busy?"Reading BOQ…":"Read BOQ"}</button>
        </div>
        <div style={{fontSize:11,lineHeight:1.55,color:"#667b8b"}}><b>Accepted examples:</b> S/N · Description · Qty · Unit · Rate · Amount; Section · Item No · Description · Unit · Qty · Rate · Amount; unpriced BOQs; old preliminaries layouts; and text/scanned PDF bills. Scanned PDFs are kept review-only before Project creation.</div>
        {message&&<div style={{borderRadius:10,padding:"10px 12px",background:result?.boq?"#edf8f3":"#fff7df",fontSize:11,color:result?.boq?"#176247":"#775c18"}}>{message}</div>}
      </section>

      {result?.boq&&<>
        <section className="data-card" style={{marginTop:14,padding:16,display:"grid",gap:8}}>
          <small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#16825c"}}>IMPORT REVIEW</small>
          <div style={{display:"flex",flexWrap:"wrap",gap:8,fontSize:11,color:"#5f7484"}}>
            <span><b>{result.recognizedSheets?.length??0}</b> source part(s)</span><span>·</span>
            <span><b>{result.boq.sections.length}</b> section(s)</span><span>·</span>
            <span><b>{result.itemCount??0}</b> item(s)</span>
            {result.sourceKind==="pdf_text"&&<><span>·</span><span>selectable PDF text</span></>}
            {result.sourceKind==="pdf_ocr"&&<><span>·</span><span style={{color:"#8a6514"}}>OCR source · Project blocked</span></>}
            {(result.legacySheets?.length??0)>0&&<><span>·</span><span><b>{result.legacySheets!.length}</b> legacy sheet(s) inferred</span></>}
            {(result.supportSheets?.length??0)>0&&<><span>·</span><span><b>{result.supportSheets!.length}</b> support sheet(s) skipped</span></>}
            {result.reviewSummary&&<><span>·</span><span><b>{result.reviewSummary.clearItems}</b> clear suggestion(s)</span><span>·</span><span><b>{result.reviewSummary.attentionItems}</b> need attention</span></>}
          </div>
          {(result.supportSheets?.length??0)>0&&<p style={{margin:0,fontSize:10,lineHeight:1.5,color:"#718391"}}><b>Skipped as support:</b> {result.supportSheets!.join(" · ")}. These tabs stay outside the BOQ total to prevent double counting.</p>}
          {(result.legacySheets?.length??0)>0&&<p style={{margin:0,fontSize:10,lineHeight:1.5,color:"#8a6514"}}><b>Legacy layout:</b> {result.legacySheets!.join(" · ")} was recovered conservatively and requires line-by-line review before Project staging.</p>}
          {sourceReviewIssue&&<p style={{margin:0,fontSize:10,lineHeight:1.5,color:"#8a6514"}}><b>Source-level gate:</b> {sourceReviewIssue}</p>}
          <p style={{margin:0,fontSize:11,lineHeight:1.55,color:"#6b7f8e"}}>Review order: meaning → working rates → material quantities → commercial summary → project staging. None of these review screens posts to Accounting.</p>
        </section>

        <BoqReviewClient key={`review-${result.boq.id}`} boq={result.boq} onDecisionsChange={setReviewDecisions}/>
        <BoqRateClient key={`rates-${result.boq.id}`} boq={result.boq} onRatesChange={setWorkingRates}/>
        <BoqMaterialsClient key={`materials-${result.boq.id}`} boq={result.boq} decisions={reviewDecisions} onMaterialized={setMaterializedBoq}/>
        <BoqEstimateSummaryClient key={`summary-${result.boq.id}`} boq={result.boq} materializedBoq={materializedBoq} workingRates={workingRates} decisions={reviewDecisions} companyName={companyName} sourceReviewIssue={sourceReviewIssue}/>

        <section style={{marginTop:14}}>
          <div style={{fontSize:11,color:"#687d8c",marginBottom:8}}><b>Quantity drilldown:</b> click a blue quantity below after calculating reviewed materials to see the exact components, waste allowance and assumptions for that BOQ item.</div>
          <SectionedBoqClient boq={materializedBoq??result.boq}/>
        </section>

        {(result.warnings?.length??0)>0&&<section className="data-card" style={{marginTop:14,padding:16}}>
          <small style={{fontSize:9,fontWeight:900,letterSpacing:".1em",color:"#936814"}}>IMPORT NOTES</small>
          <h2 style={{margin:"5px 0 8px",fontSize:16,color:"#173f5a"}}>{result.warnings!.length} import note{result.warnings!.length===1?"":"s"}</h2>
          <div style={{display:"grid",gap:6,maxHeight:280,overflowY:"auto"}}>{result.warnings!.map((warning,index)=><div key={`${warning.sheet}-${warning.row??0}-${index}`} style={{fontSize:11,lineHeight:1.45,color:"#6e6250",borderTop:index?"1px solid #edf0f2":0,paddingTop:index?7:0}}><b>{warning.sheet}{warning.row?` · line ${warning.row}`:""}:</b> {warning.message}</div>)}</div>
        </section>}
      </>}
    </div>
  </main>;
}
