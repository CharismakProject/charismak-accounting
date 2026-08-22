import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const intake = fs.readFileSync("supabase/functions/analyse-intake-document/index.ts", "utf8");
const intakeV3 = fs.readFileSync("supabase/functions/analyse-intake-document-v3/index.ts", "utf8");
const ocr = fs.readFileSync("supabase/functions/analyse-ocr-document/index.ts", "utf8");
const ui = fs.readFileSync("app/add/UniversalIntakeV6.tsx", "utf8");
const sqlCorpus = fs.readdirSync("supabase/migrations")
  .filter(name => name.endsWith(".sql"))
  .map(name => fs.readFileSync(path.join("supabase/migrations", name), "utf8"))
  .join("\n");

test("Excel, Word, PDF, scanned PDF and JPEG each have an analysis path", () => {
  assert.match(intakeV3, /if\(ext!=="xlsx"\)return await proxyGeneric\(\)/);
  assert.match(intake, /\["xlsx","xls","csv"\]\.includes\(ext\)/);
  assert.match(intake, /if\(ext==="docx"\)/);
  assert.match(intake, /if\(ext==="pdf"\)/);
  assert.match(ui, /route === "image"/);
  assert.match(ui, /route === "pdf"[\s\S]*needsOcrFallback/);
  assert.match(ui, /analyse-ocr-document/);
  assert.match(ocr, /ocrText/);
});

test("document matching recognises bank and client/project signals rather than project name only", () => {
  assert.match(intake, /client:clients\(name,contact_person\)/);
  assert.match(intake, /add\(c\?\.name,42\)/);
  assert.match(intake, /for\(const a of p\.aliases\?\?\[\]\)add\(a,44\)/);
  assert.match(intake, /institution\(text\)/);
  assert.match(intake, /accountHolder\(text\)/);
});

test("statement-level duplicate protection fingerprints transactions and marks known rows", () => {
  assert.match(sqlCorpus, /finalize_statement_import/i);
  assert.match(sqlCorpus, /normalized_fingerprint/i);
  assert.match(sqlCorpus, /already_known/i);
  assert.match(sqlCorpus, /canonical_transactions/i);
  assert.match(ui, /no duplicate accounting was created/i);
});

test("commercial documents remain review-first instead of silently changing accounts", () => {
  const apply = fs.readFileSync("supabase/functions/auto-apply-project-document/index.ts", "utf8");
  assert.match(apply, /commercial_confirmation_required/);
  assert.match(apply, /\["invoice","quotation","boq","variation"\]\.includes\(kind\)/);
  assert.match(apply, /before it changes the accounts/i);
});
