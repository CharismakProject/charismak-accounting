import test from "node:test";
import assert from "node:assert/strict";
import {
  INTAKE_ACCEPT,
  INTAKE_SUPPORTED_EXTENSIONS,
  extensionFromFileName,
  intakeRouteForExtension,
  isDuplicateConstraintError,
  isSupportedIntakeFileName,
  safeUploadFileName,
} from "../lib/intake/policy.ts";

test("release upload scope is deliberately limited to reliable document formats", () => {
  assert.deepEqual([...INTAKE_SUPPORTED_EXTENSIONS], ["pdf", "xlsx", "xls", "docx", "jpg", "jpeg"]);
  assert.equal(isSupportedIntakeFileName("statement.PDF"), true);
  assert.equal(isSupportedIntakeFileName("access.xlsx"), true);
  assert.equal(isSupportedIntakeFileName("legacy.xls"), true);
  assert.equal(isSupportedIntakeFileName("boq.docx"), true);
  assert.equal(isSupportedIntakeFileName("receipt.jpeg"), true);
  assert.equal(isSupportedIntakeFileName("photo.jpg"), true);
  assert.equal(isSupportedIntakeFileName("statement.csv"), false);
  assert.equal(isSupportedIntakeFileName("scan.png"), false);
  assert.equal(isSupportedIntakeFileName("archive.zip"), false);
  assert.doesNotMatch(INTAKE_ACCEPT, /\.csv|\.png|\.webp/);
});

test("file routes keep Excel, Word, PDF and image analysis separate internally", () => {
  assert.equal(intakeRouteForExtension("xlsx"), "spreadsheet");
  assert.equal(intakeRouteForExtension("xls"), "spreadsheet");
  assert.equal(intakeRouteForExtension("docx"), "word");
  assert.equal(intakeRouteForExtension("pdf"), "pdf");
  assert.equal(intakeRouteForExtension("jpg"), "image");
  assert.equal(intakeRouteForExtension("jpeg"), "image");
  assert.equal(intakeRouteForExtension("csv"), null);
});

test("filename handling is stable for Android and unusual names", () => {
  assert.equal(extensionFromFileName("My Statement.XLSX"), "xlsx");
  assert.equal(extensionFromFileName("invoice.final.pdf?download=1"), "pdf");
  assert.equal(safeUploadFileName("Wandel / COCO statement (Aug).xlsx"), "Wandel_COCO_statement_Aug_.xlsx");
});

test("duplicate constraint detection recognises database race protection", () => {
  assert.equal(isDuplicateConstraintError({ code: "23505", message: "duplicate key value" }), true);
  assert.equal(isDuplicateConstraintError({ message: "source_documents_company_id_file_hash_key" }), true);
  assert.equal(isDuplicateConstraintError({ code: "42501", message: "permission denied" }), false);
});
