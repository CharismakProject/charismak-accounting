"use client";

import { readFileArrayBuffer } from "./file-read";

type Progress=(message:string)=>void;
let tesseractLoading:Promise<any>|null=null;
let pdfLoading:Promise<any>|null=null;

function loadScript(src:string,globalName:string){
  const w=window as any;
  if(w[globalName])return Promise.resolve(w[globalName]);
  const existing=window.document.querySelector(`script[data-charismak-src="${src}"]`) as HTMLScriptElement|null;
  if(existing)return new Promise((resolve,reject)=>{
    existing.addEventListener("load",()=>resolve(w[globalName]),{once:true});
    existing.addEventListener("error",()=>reject(new Error(`Could not load ${globalName}. Check your internet connection and retry.`)),{once:true});
  });
  return new Promise((resolve,reject)=>{
    const script=window.document.createElement("script");
    script.src=src;script.async=true;script.dataset.charismakSrc=src;script.crossOrigin="anonymous";
    script.onload=()=>resolve(w[globalName]);
    script.onerror=()=>reject(new Error(`Could not load ${globalName}. Check your internet connection and retry.`));
    window.document.head.appendChild(script);
  });
}

async function tesseract(){
  if(!tesseractLoading)tesseractLoading=loadScript("https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js","Tesseract");
  return tesseractLoading;
}

async function pdfjs(){
  if(!pdfLoading)pdfLoading=loadScript("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js","pdfjsLib").then((lib:any)=>{
    lib.GlobalWorkerOptions.workerSrc="https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
    return lib;
  });
  return pdfLoading;
}

function pageTextFromItems(items:any[]){
  const parts:string[]=[];
  let lastY:number|null=null;
  for(const item of items){
    const text=String(item?.str??"").trim();
    if(!text)continue;
    const y=Number(item?.transform?.[5]);
    if(lastY!==null&&Number.isFinite(y)&&Math.abs(y-lastY)>2.4)parts.push("\n");
    else if(parts.length&&parts[parts.length-1]!=="\n")parts.push(" ");
    parts.push(text);
    if(Number.isFinite(y))lastY=y;
  }
  return parts.join("").replace(/[ \t]+\n/g,"\n").replace(/\n{3,}/g,"\n\n").trim();
}

/**
 * Extract selectable PDF text page-by-page in the browser.
 * This deliberately avoids sending a large PDF binary into an Edge PDF engine,
 * which can exhaust server compute on long/complex statements and BOQs.
 */
export async function readPdfTextDocument(file:File,progress:Progress=()=>{}):Promise<{text:string;pages:number;truncated:boolean}> {
  const ext=file.name.split(".").pop()?.toLowerCase()||"";
  if(ext!=="pdf"&&!/pdf/i.test(file.type))throw new Error("This is not a PDF file.");
  progress("Preparing the PDF safely on this device…");
  const pdf=await pdfjs();
  const bytes=new Uint8Array(await readFileArrayBuffer(file));
  const pdfDoc=await pdf.getDocument({data:bytes}).promise;
  const pages:string[]=[];
  const MAX_TEXT=4_000_000;
  let total=0;
  let truncated=false;
  try{
    for(let i=1;i<=pdfDoc.numPages;i++){
      progress(`Reading PDF text page ${i} of ${pdfDoc.numPages}…`);
      const page=await pdfDoc.getPage(i);
      const content=await page.getTextContent();
      const pageText=pageTextFromItems(content?.items??[]);
      if(pageText){
        const remaining=MAX_TEXT-total;
        if(remaining<=0){truncated=true;break;}
        const add=pageText.slice(0,remaining);
        pages.push(add);
        total+=add.length;
        if(add.length<pageText.length){truncated=true;break;}
      }
      try{page.cleanup?.();}catch{}
    }
  } finally {
    try{await pdfDoc.cleanup?.();}catch{}
    try{await pdfDoc.destroy?.();}catch{}
  }
  return {text:pages.join("\n\n--- PAGE ---\n\n").trim(),pages:pdfDoc.numPages,truncated};
}

async function makeWorker(progress:Progress){
  const T=await tesseract();
  progress("Preparing private on-device text recognition…");
  return T.createWorker("eng",1,{
    workerPath:"https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/worker.min.js",
    langPath:"https://tessdata.projectnaptha.com/4.0.0",
    corePath:"https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1",
    logger:(m:any)=>{
      if(m?.status==="recognizing text"&&Number.isFinite(m.progress))progress(`Reading scan… ${Math.round(m.progress*100)}%`);
    }
  });
}

export async function readVisualDocument(file:File,progress:Progress=()=>{}):Promise<{text:string;confidence:number;pages:number}> {
  const ext=file.name.split(".").pop()?.toLowerCase()||"";
  const worker=await makeWorker(progress);
  try{
    if(["jpg","jpeg","png","webp"].includes(ext)||file.type.startsWith("image/")){
      progress("Reading photo / scanned page…");
      const result=await worker.recognize(file);
      return {text:String(result?.data?.text||"").trim(),confidence:Number(result?.data?.confidence||0),pages:1};
    }
    if(ext!=="pdf")throw new Error("On-device OCR is used for photos and scanned PDFs only.");
    const pdf=await pdfjs();
    const bytes=new Uint8Array(await readFileArrayBuffer(file));
    const pdfDoc=await pdf.getDocument({data:bytes}).promise;
    const pageTexts:string[]=[];const confidences:number[]=[];
    try{
      for(let i=1;i<=pdfDoc.numPages;i++){
        progress(`Reading scanned PDF page ${i} of ${pdfDoc.numPages}…`);
        const page=await pdfDoc.getPage(i);
        const viewport=page.getViewport({scale:1.35});
        const canvas=window.document.createElement("canvas");
        const context=canvas.getContext("2d",{willReadFrequently:true});
        if(!context)throw new Error("Your browser could not prepare this scanned page for reading.");
        canvas.width=Math.ceil(viewport.width);canvas.height=Math.ceil(viewport.height);
        await page.render({canvasContext:context,viewport}).promise;
        const result=await worker.recognize(canvas);
        pageTexts.push(String(result?.data?.text||"").trim());
        confidences.push(Number(result?.data?.confidence||0));
        canvas.width=1;canvas.height=1;
        try{page.cleanup?.();}catch{}
      }
    } finally {
      try{await pdfDoc.cleanup?.();}catch{}
      try{await pdfDoc.destroy?.();}catch{}
    }
    const confidence=confidences.length?confidences.reduce((a,b)=>a+b,0)/confidences.length:0;
    return {text:pageTexts.filter(Boolean).join("\n\n--- PAGE ---\n\n"),confidence,pages:pdfDoc.numPages};
  } finally { await worker.terminate().catch(()=>{}); }
}

export function needsOcrFallback(message:string|undefined){
  return /selectable text|scanned|image[- ]only|no transaction table|could not be recognised|could not.*read.*pdf/i.test(String(message||""));
}
