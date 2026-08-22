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
test("PDF remains PDF so text parsing can precede OCR fallback",()=>assert.equal(releaseUploadRoute("statement.pdf"),"pdf"));
test("junk bank headers cannot be project signals",()=>{for(const x of ["DATE","APR","TRANS","CHQ","VALUE","IFO","NIP"])assert.equal(isProjectSignalNoise(x),true)});
test("real client/project words are not blanket-noise",()=>{assert.equal(isProjectSignalNoise("WANDEL"),false);assert.equal(isProjectSignalNoise("COCO"),false)});
test("same overlapping transaction has same identity",()=>{const a={transactionDate:"2026-08-01",valueDate:"2026-08-01",reference:"ABC",signedAmount:-2500,narration:"Bank charge",counterparty:"Bank",runningBalance:95000};assert.equal(transactionIdentityKey(a),transactionIdentityKey({...a}))});
test("same-day same-amount legitimate repeats remain distinct when balance differs",()=>{const a={transactionDate:"2026-08-01",signedAmount:-2500,narration:"Bank charge",runningBalance:95000};const b={...a,runningBalance:92500};assert.notEqual(transactionIdentityKey(a),transactionIdentityKey(b))});
test("value date participates in transaction identity",()=>{const a={transactionDate:"2026-08-01",valueDate:"2026-08-01",signedAmount:5000,narration:"Transfer"};const b={...a,valueDate:"2026-08-02"};assert.notEqual(transactionIdentityKey(a),transactionIdentityKey(b))});

test("V6 requires backend duplicate guard and does not depend on phone hash",()=>{const s=fs.readFileSync(new URL("../app/add/UniversalIntakeV6.tsx",import.meta.url),"utf8");assert.match(s,/check-intake-duplicate/);assert.doesNotMatch(s,/optionalFileHash/);assert.match(s,/Duplicate safety check could not complete/)});
test("backend duplicate guard hashes stored bytes",()=>{const s=fs.readFileSync(new URL("../supabase/functions/check-intake-duplicate/index.ts",import.meta.url),"utf8");assert.match(s,/SHA-256/);assert.match(s,/source_documents/);assert.match(s,/company_memberships/)});
