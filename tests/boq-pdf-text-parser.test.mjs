import test from "node:test";
import assert from "node:assert/strict";
import { parseBoqPdfText } from "../lib/estimate/boq-pdf-text-parser.ts";

test("parses standard PDF BOQ rows with Qty before Unit and repeated page headers",()=>{
  const text=`S/N DESCRIPTION QTY UNIT RATE AMOUNT
SUBSTRUCTURES
Trench & Pit Excavation
A Excavate trench for external wall around structure 10.70 m3 5,500.00 58,850.00
CONCRETE WORKS
B Plain insitu concrete in footings and blinding 1.61 m3 150,000.00 241,500.00
S/N DESCRIPTION QTY UNIT RATE AMOUNT
WALL FINISHING
C Internal wall painting 45.21 m2 2,500.00 113,025.00
SUBTOTAL 413,375.00`;
  const result=parseBoqPdfText(text,"sample.pdf");
  assert.equal(result.itemCount,3);
  assert.deepEqual(result.boq.sections.map(s=>s.title),["SUBSTRUCTURES","CONCRETE WORKS","WALL FINISHING"]);
  assert.equal(result.boq.sections[0].items[0].unit,"m3");
  assert.equal(result.boq.sections[0].items[0].amount,58850);
});

test("parses Molti-style Unit before Qty and excludes carried/summary rows",()=>{
  const text=`S/N DESCRIPTION UNIT QTY RATE AMOUNT
ELEMENT NR 2.1 SUBSTRUCTURE
D20 EXCAVATING AND FILLING
A Clearing site vegetation bushes and scrub Sqm 917.00 1,500.00 1,375,500.00
B Excavating top soil average 150mm deep Sqm 917.00 1,500.00 1,375,500.00
Carried to collection 2,751,000.00
ELEMENT NR 2.3: ROOF
A Roof beam Cum 26.06 120,000.00 3,127,200.00
ELEMENT NR 2.3 To Bill Nr 2 3,127,200.00`;
  const result=parseBoqPdfText(text,"large-contract.pdf");
  assert.equal(result.itemCount,3);
  assert.equal(result.boq.sections[0].items[0].quantity,917);
  assert.equal(result.boq.sections.at(-1).title,"ELEMENT NR 2.3: ROOF");
});

test("reconstructs multi-line quotation items with serial on its own line",()=>{
  const text=`DETAILED BILL OF QUANTITIES
S/N DESCRIPTION OF WORK UNIT QTY RATE AMOUNT
A. GLAZING WORKS
2
10mm Clear Tempered Safety Glass — Showroom Frontage with accessories
Supply and installation of clear tempered safety glass panels to existing frames
sqm 15 ₦95,000 ₦1,425,000
3
SEE-THROUGH Roller-Shutter
Supply and fix see through roller shutter
LS 1 500,000 500,000
SUB-TOTAL (excl. VAT) ₦1,925,000.00`;
  const result=parseBoqPdfText(text,"quotation.pdf");
  assert.equal(result.itemCount,2);
  assert.equal(result.boq.sections[0].items[0].itemNo,"2");
  assert.match(result.boq.sections[0].items[0].description,/Tempered Safety Glass/);
  assert.equal(result.boq.sections[0].items[1].amount,500000);
});

test("estimator-generated PDF keeps numeric item, trade group and next-line description",()=>{
  const text=`PRICED BILL OF QUANTITIES
S/N DESCRIPTION UNIT QTY RATE AMOUNT
1 Fence Works
Provide and lay 225mm thick sandcrete blockwork to Front
m² 93.94 ₦15,500.00 ₦1,456,070.00
2 Fence Works
Construct reinforced-concrete fence columns to Front
number 18 ₦165,000.00 ₦2,970,000.00
3 Excavation and Earthworks
Excavate strip foundation in firm lateritic ground for Excavation run
m³ 29.7 ₦7,500.00 ₦222,750.00`;
  const result=parseBoqPdfText(text,"estimator.pdf");
  assert.equal(result.itemCount,3);
  assert.equal(result.boq.sections[0].title,"Fence Works");
  assert.equal(result.boq.sections[0].items[0].itemNo,"1");
  assert.equal(result.boq.sections[1].title,"Excavation and Earthworks");
});

test("LAB header and source arithmetic differences remain review-visible",()=>{
  const text=`S/N DESCRIPTION QTY UNIT RATE LAB AMOUNT
CONCRETE WORKS
A Lintel 0.27 Cum 12,500.00 3,375.00
WALL FINISHING
F Internal Walls 27.00 Sqm 650.00 N/A`;
  const result=parseBoqPdfText(text,"lab-bill.pdf");
  assert.equal(result.itemCount,2);
  assert.ok(result.warnings.some(w=>/does not equal Qty × Rate/.test(w.message))===false);
  assert.equal(result.boq.sections[1].items[0].rate,650);
  assert.equal(result.boq.sections[1].items[0].amount,null);
});

test("OCR mode is explicitly marked review-only in warnings",()=>{
  const result=parseBoqPdfText(`S/N DESCRIPTION QTY UNIT RATE AMOUNT\nROOFING\nA Roof covering 10 m2 20,000 200,000`,"scan.pdf","ocr");
  assert.equal(result.sourceMode,"ocr");
  assert.match(result.warnings[0].message,/required OCR/i);
  assert.match(result.boq.sections[0].items[0].materialBreakdown.assumptions[0],/OCR/);
});
