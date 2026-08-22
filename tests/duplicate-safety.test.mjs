import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("app/add/UniversalIntakeV6.tsx", "utf8");
const edge = fs.readFileSync("supabase/functions/fingerprint-upload/index.ts", "utf8");
const migration = fs.readFileSync("supabase/migrations/20260822043000_strict_source_document_duplicate_guard.sql", "utf8");

test("upload flow requires server duplicate verification before source document insert", () => {
  const verifyAt = ui.indexOf("verifyServerFingerprint(path, file, clientHash)");
  const insertAt = ui.indexOf('supabase.from("source_documents").insert');
  assert.ok(verifyAt >= 0, "server fingerprint verification must be invoked");
  assert.ok(insertAt > verifyAt, "source document registration must happen after server fingerprint verification");
  assert.match(ui, /Duplicate-safety verification failed\. Nothing was imported\./);
  assert.match(ui, /server_fingerprint_verified: true/);
});

test("fingerprint service authenticates user but hashes uploaded bytes with protected server access", () => {
  assert.match(edge, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(edge, /userClient\.auth\.getUser\(\)/);
  assert.match(edge, /company_memberships/);
  assert.match(edge, /storagePath\.startsWith\(`\$\{companyId\}\/intake\//);
  assert.match(edge, /createClient\(url, serviceRole/);
  assert.match(edge, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(edge, /\.eq\("file_hash", fileHash\)/);
  assert.match(edge, /integrity check failed/i);
});

test("temporary upload cleanup cannot delete an already-registered document", () => {
  assert.match(edge, /\.eq\("storage_path", storagePath\)/);
  assert.match(edge, /already registered and cannot be treated as a temporary upload/);
  assert.match(edge, /action === "cleanup"/);
  assert.match(ui, /cleanupTemporaryUpload\(path\)/);
});

test("database duplicate guard is independent of detected document type", () => {
  assert.match(migration, /unique \(company_id, file_hash\)/i);
  assert.doesNotMatch(migration, /unique \(company_id, document_type, file_hash\)/i);
  assert.match(migration, /drop constraint if exists source_documents_company_id_document_type_file_hash_key/i);
});

test("upload flow handles a race-condition duplicate without analysing it", () => {
  assert.match(ui, /isDuplicateConstraintError\(doc\.error\)/);
  assert.match(ui, /Database protection blocked the duplicate/);
  const raceGuardAt = ui.indexOf("isDuplicateConstraintError(doc.error)");
  const analysisAt = ui.indexOf('supabase.functions.invoke("analyse-intake-document-v3"');
  assert.ok(raceGuardAt >= 0 && analysisAt > raceGuardAt);
});
