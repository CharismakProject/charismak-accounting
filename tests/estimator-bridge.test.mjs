import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const bridge = read("lib/project-cost/estimator-bridge.ts");

test("estimator bridge accepts only explicitly reviewed snapshots", () => {
  assert.match(bridge, /reviewed:\s*z\.literal\(true\)/);
  assert.match(bridge, /Estimator snapshot requires review before import/i);
});

test("estimator bridge never treats AI or heuristic cost-code suggestions as confirmed", () => {
  assert.match(bridge, /costCodeSource:\s*"provided"\s*\|\s*"suggested"\s*\|\s*"unclassified"/);
  assert.match(bridge, /line\.costCodeSource === "provided"/);
  assert.match(bridge, /needs confirmation of suggested cost code/i);
});

test("estimator bridge checks duplicate lines and arithmetic before import", () => {
  assert.match(bridge, /duplicate_source_line_id/);
  assert.match(bridge, /line_arithmetic_mismatch/);
  assert.match(bridge, /budget_line_total_mismatch/);
});

test("estimator bridge preserves contract value separately from internal budget", () => {
  assert.match(bridge, /contractValue:\s*optionalMoney/);
  assert.match(bridge, /internalCostBudget:\s*money/);
  assert.match(bridge, /contractValue:\s*snapshot\.contractValue/);
  assert.match(bridge, /internalCostBudget:\s*roundMoney\(snapshot\.internalCostBudget\)/);
});

test("estimator bridge creates deterministic SHA-256 source fingerprints", () => {
  assert.match(bridge, /canonicalizeForFingerprint/);
  assert.match(bridge, /crypto\.subtle\.digest\("SHA-256"/);
  assert.match(bridge, /sourceProjectId/);
  assert.match(bridge, /sourceVersion/);
});
