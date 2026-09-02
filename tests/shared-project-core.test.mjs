import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const costCodes = read("lib/project-cost/cost-codes.ts");
const design = read("docs/shared-project-core-v1.md");

test("shared cost-code contract contains stable groups 01 through 20", () => {
  for (let code = 1; code <= 20; code += 1) {
    const padded = String(code).padStart(2, "0");
    assert.match(costCodes, new RegExp(`code: \\\"${padded}\\\"`));
  }
});

test("bridge keeps commercial value, internal budget and actual cost separate", () => {
  assert.match(design, /original\/base contract value/i);
  assert.match(design, /internal cost budget/i);
  assert.match(design, /actual cost/i);
  assert.match(design, /cost to complete/i);
  assert.match(design, /forecast final cost/i);
});

test("bridge is explicitly non-destructive and idempotent", () => {
  assert.match(design, /idempotent/i);
  assert.match(design, /must not create a duplicate accounting project/i);
  assert.match(design, /No live Estimator or Accounting business records are changed/i);
});
