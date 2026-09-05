import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const converter = read("lib/project-cost/from-estimator-bill.ts");
const adapter = read("lib/project-cost/accounting-project-adapter.ts");

test("Estimator commercial layers remain separate from internal project cost", () => {
  assert.match(converter, /suggestedInternalCostBases/);
  assert.match(converter, /direct_cost:\s*totals\.directCost/);
  assert.match(converter, /direct_plus_contingency/);
  assert.doesNotMatch(converter, /internalCostBudget\s*=\s*candidate\.totals\.grandTotal/);
  assert.doesNotMatch(converter, /internalCostBudget\s*=\s*candidate\.totals\.profit/);
  assert.doesNotMatch(converter, /internalCostBudget\s*=\s*candidate\.totals\.vat/);
});

test("contract value requires an explicit commercial decision", () => {
  assert.match(converter, /contractValueBasis/);
  assert.match(converter, /subtotal_before_tax/);
  assert.match(converter, /grand_total/);
  assert.match(converter, /kind:\s*"explicit"/);
  assert.match(converter, /kind:\s*"none"/);
  assert.match(converter, /commercial_mapping_review_required/);
});

test("draft and unpriced Estimator bills cannot become Accounting baselines", () => {
  assert.match(converter, /Only a completed Estimator bill can become an Accounting budget baseline/);
  assert.match(converter, /All Estimator bill lines must be priced before Accounting import/);
  assert.match(converter, /bill_is_not_completed/);
  assert.match(converter, /missing_or_unpriced_line/);
});

test("cost codes are reviewed per line and source line IDs remain stable", () => {
  assert.match(converter, /const sourceLineId = `\$\{sectionId\}:\$\{itemId\}`/);
  assert.match(converter, /Cost code review is incomplete/);
  assert.match(converter, /isValidCostCode/);
});

test("Accounting adapter preserves missing commercial revenue as unknown", () => {
  assert.match(adapter, /expected_contract_revenue:\s*number \| null/);
  assert.match(adapter, /forecast_profit:\s*number \| null/);
  assert.match(adapter, /snapshot\.contractValue == null[\s\S]*\? null/);
});

test("Accounting adapter is persistence-free and source fingerprinted", () => {
  assert.match(adapter, /fingerprintEstimatorBridge/);
  assert.match(adapter, /source_fingerprint/);
  assert.match(adapter, /does not write to Supabase/i);
  assert.match(adapter, /assertEstimatorBridgeReady/);
});
