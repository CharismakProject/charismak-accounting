import test from "node:test";
import assert from "node:assert/strict";
import { webcrypto } from "node:crypto";
import { optionalFileHash, readFileArrayBuffer } from "../app/add/file-read.ts";
import { needsOcrFallback } from "../app/add/client-ocr.ts";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", { value: webcrypto, configurable: true });

function namedBlob(bytes, name, type = "application/octet-stream") {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, "name", { value: name, enumerable: true });
  return blob;
}

test("same bytes keep the same SHA-256 even when filename/type changes", async () => {
  const a = namedBlob("identical construction record bytes", "statement.xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  const b = namedBlob("identical construction record bytes", "renamed-statement.pdf", "application/pdf");
  const hashA = await optionalFileHash(a);
  const hashB = await optionalFileHash(b);
  assert.match(hashA || "", /^[0-9a-f]{64}$/);
  assert.equal(hashA, hashB);
});

test("different bytes do not collapse into one duplicate fingerprint", async () => {
  const a = namedBlob("record A", "a.xlsx");
  const b = namedBlob("record B", "b.xlsx");
  assert.notEqual(await optionalFileHash(a), await optionalFileHash(b));
});

test("Android-safe byte reader can read a normal Blob without relying on FileReader", async () => {
  const bytes = await readFileArrayBuffer(new Blob([new Uint8Array([1, 2, 3, 4, 5])]));
  assert.deepEqual([...new Uint8Array(bytes)], [1, 2, 3, 4, 5]);
});

test("scanned and image-only PDF failures trigger OCR, ordinary parser success messages do not", () => {
  for (const message of [
    "No selectable text found in scanned PDF",
    "This appears to be an image-only statement",
    "No transaction table could be recognised",
    "Could not read PDF text",
    "The statement is scanned",
    "Project confirmation needed.",
  ]) assert.equal(needsOcrFallback(message), true, message);

  for (const message of [
    "Statement processed successfully",
    "10 transaction rows found",
    "Document matched to COCO-01",
  ]) assert.equal(needsOcrFallback(message), false, message);
});
