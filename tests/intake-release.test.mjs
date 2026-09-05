import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isReleaseUploadSupported, releaseUploadRoute, isProjectSignalNoise, transactionIdentityKey } from "../lib/intake/release-rules.ts";

test("release accepts Excel xlsx",()=>assert.equal(isReleaseUploadSupported("statement.xlsx"),true));
test("release accepts legacy Excel xls",()=>assert.equal(isReleaseUploadSupported("statement.xls"),true));
test("release accepts Word docx",()=>assert.equal(isReleaseUploadSupported("valuation.docx"),true));
test("release accepts normal and scanned PDF",()=>assert.equal(isReleaseUploadSupported("scan.pdf"),true));
test("release accepts JPEG",()=>assert.equal(isReleaseUploadSupported("receipt.JPEG"),true));
test("release rejects formats outside current promise",()=>assert.equal(isReleaseUploadSupported("statement.csv"),false));
test("routing keeps Excel separate internally without separate UX",()=>assert.equal(releaseUploadRoute("cost.xlsx"),"excel"));
test("JPEG is routed to OCR",()=>assert.equal(releaseUploadRoute("receipt.jpg"),"image"));
test("PDF routes to the dedicated PDF path",()=>assert.equal(releaseUploadRoute("statement.pdf"),"pdf"));
test("junk bank headers cannot be project signals",()=>{for(const x of ["DATE","APR","TRANS","CHQ","VALUE","IFO","NIP"])assert.equal(isProjectSignalNoise(x),true)});
test("real client/project words are not blanket-noise",()=>{assert.equal(isProjectSignalNoise("WANDEL"),false);assert.equal(isProjectSignalNoise("COCO"),false)});
test("same overlapping transaction has same identity",()=>{const a={transactionDate:"2026-08-01",valueDate:"2026-08-01",reference:"ABC",signedAmount:-2500,narration:"Bank charge",counterparty:"Bank",runningBalance:95000};assert.equal(transactionIdentityKey(a),transactionIdentityKey({...a}))});
test("same-day same-amount legitimate repeats remain distinct when balance differs",()=>{const a={transactionDate:"2026-08-01",signedAmount:-2500,narration:"Bank charge",runningBalance:95000};const b={...a,runningBalance:92500};assert.notEqual(transactionIdentityKey(a),transactionIdentityKey(b))});
test("value date participates in transaction identity",()=>{const a={transactionDate:"2026-08-01",valueDate:"2026-08-01",signedAmount:5000,narration:"Transfer"};const b={...a,valueDate:"2026-08-02"};assert.notEqual(transactionIdentityKey(a),transactionIdentityKey(b))});

test("V6 requires backend duplicate guard and does not depend on phone hash",()=>{const s=fs.readFileSync(new URL("../app/add/UniversalIntakeV6.tsx",import.meta.url),"utf8");assert.match(s,/check-intake-duplicate/);assert.doesNotMatch(s,/optionalFileHash/);assert.match(s,/Duplicate safety check could not complete/)});
test("backend duplicate guard hashes stored bytes with protected server read",()=>{const s=fs.readFileSync(new URL("../supabase/functions/check-intake-duplicate/index.ts",import.meta.url),"utf8");assert.match(s,/SHA-256/);assert.match(s,/SUPABASE_SERVICE_ROLE_KEY/);assert.match(s,/source_documents/);assert.match(s,/company_memberships/);assert.match(s,/uploaded_at/);assert.doesNotMatch(s,/created_at/)});

test("legacy project upload surface delegates to hardened V6",()=>{const s=fs.readFileSync(new URL("../app/add/UniversalIntakeV3.tsx",import.meta.url),"utf8");assert.match(s,/UniversalIntakeV6/);assert.match(s,/embedded=\{embedded\}/)});
test("V6 PDF path uses browser page-by-page text extraction",()=>{const s=fs.readFileSync(new URL("../app/add/UniversalIntakeV6.tsx",import.meta.url),"utf8");assert.match(s,/readPdfTextDocument/);assert.match(s,/analyse-extracted-document/);assert.match(s,/route==="pdf"/)});
test("V6 does not send PDF route to legacy binary edge parser",()=>{const s=fs.readFileSync(new URL("../app/add/UniversalIntakeV6.tsx",import.meta.url),"utf8");const pdfBlock=s.slice(s.indexOf("async function pdfAnalyse"),s.indexOf("async function analyseFile"));assert.doesNotMatch(pdfBlock,/analyse-intake-document-v3/);assert.match(pdfBlock,/browser_pdf_text_v1/)});
test("client PDF text reader uses pdf.js text content page-by-page",()=>{const s=fs.readFileSync(new URL("../app/add/client-ocr.ts",import.meta.url),"utf8");assert.match(s,/getTextContent/);assert.match(s,/for\(let i=1;i<=pdfDoc\.numPages;i\+\+\)/);assert.match(s,/MAX_TEXT=4_000_000/)});
test("large PDF extracted-text backend never imports unpdf",()=>{const s=fs.readFileSync(new URL("../supabase/functions/analyse-extracted-document/index.ts",import.meta.url),"utf8");assert.doesNotMatch(s,/unpdf|getDocumentProxy|extractText/);assert.match(s,/extractedText/)});
test("extracted-text analyser recognises statement before project routing",()=>{const s=fs.readFileSync(new URL("../supabase/functions/analyse-extracted-document/index.ts",import.meta.url),"utf8");const statement=s.indexOf("if(looksStatement(text))");const projects=s.indexOf('from("projects")');assert.ok(statement>0&&projects>statement)});
test("statement detected inside project is detached from project commercial scope",()=>{const s=fs.readFileSync(new URL("../supabase/functions/analyse-extracted-document/index.ts",import.meta.url),"utf8");assert.match(s,/document_type:"bank_statement",project_id:null/)});
test("OCR commercial documents require confirmation rather than auto-apply",()=>{const s=fs.readFileSync(new URL("../supabase/functions/analyse-extracted-document/index.ts",import.meta.url),"utf8");assert.match(s,/const ready=!isOcr/);assert.match(s,/status:"needs_review"/)});
test("analysis errors retain original and move intake to review",()=>{const s=fs.readFileSync(new URL("../app/add/UniversalIntakeV6.tsx",import.meta.url),"utf8");assert.match(s,/The original file is safe/);assert.match(s,/status:"needs_review"/)});
test("unfinished duplicate uploads retry existing record instead of creating another source document",()=>{const s=fs.readFileSync(new URL("../app/add/UniversalIntakeV6.tsx",import.meta.url),"utf8");assert.match(s,/\["failed","needs_review"\]/);assert.match(s,/Retrying analysis of the existing stored document/);assert.match(s,/retried_existing/)});
