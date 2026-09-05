import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const upload=fs.readFileSync(new URL("../app/estimate/upload-boq/upload-boq-client.tsx",import.meta.url),"utf8");
const summary=fs.readFileSync(new URL("../app/estimate/upload-boq/boq-estimate-summary-client.tsx",import.meta.url),"utf8");
const project=fs.readFileSync(new URL("../app/estimate/upload-boq/boq-project-preview-client.tsx",import.meta.url),"utf8");

test("web BOQ upload accepts PDF and reuses browser page-by-page extraction",()=>{
  assert.match(upload,/\.xlsx,\.xls,\.csv,\.pdf/);
  assert.match(upload,/readPdfTextDocument/);
  assert.match(upload,/parseBoqPdfText/);
});

test("scanned PDF falls back to existing on-device OCR rather than silent failure",()=>{
  assert.match(upload,/readVisualDocument/);
  assert.match(upload,/sourceKind:\"pdf_ocr\"/);
  assert.match(upload,/Average OCR confidence/);
});

test("OCR-derived BOQ stays review-export only and cannot stage a Project",()=>{
  assert.match(upload,/OCR-derived BOQs are review\/export only in V1 and cannot create a Project/);
  assert.match(summary,/sourceReviewIssue/);
  assert.match(project,/const readyToStage=preview\.readyToStage&&!sourceReviewIssue/);
  assert.match(project,/Source document review required/);
});
