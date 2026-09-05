import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const page = read("app/projects/estimator-review/page.tsx");
const review = read("app/projects/estimator-review/review-client.tsx");
const projects = read("app/projects/page.tsx");

test("Projects exposes a clear Estimator BOQ review entry point", () => {
  assert.match(projects, /href="\/projects\/estimator-review"/);
  assert.match(projects, /Review Estimator BOQ/);
});

test("Estimator review page reads only project fields common to the inspected live schema", () => {
  assert.match(page, /id,company_id,project_code,name,location,contract_value/);
  assert.doesNotMatch(page, /company_memberships|project_financial_summaries|clients\(/);
});

test("Estimator review requires the versioned review-required hand-off contract", () => {
  assert.match(review, /parsed\.schemaVersion !== 1/);
  assert.match(review, /parsed\.sourceSystem !== "charismak_estimator"/);
  assert.match(review, /parsed\.reviewRequired !== true/);
});

test("review blocks validation until destination project and every cost code are explicit", () => {
  assert.match(review, /Choose the matching Accounting project/);
  assert.match(review, /Review the construction cost code for/);
  assert.match(review, /isValidCostCode/);
  assert.match(review, /Apply code to section/);
});

test("review keeps internal budget and commercial value as separate decisions", () => {
  assert.match(review, /Direct cost \+ contingency/);
  assert.match(review, /Direct cost only/);
  assert.match(review, /Custom reviewed budget/);
  assert.match(review, /Do not import a contract value/);
  assert.match(review, /BOQ subtotal before VAT/);
  assert.match(review, /BOQ grand total/);
});

test("database staging stays feature-gated and approval remains a separate step", () => {
  assert.match(page, /PROJECT_COST_BRIDGE_ENABLED === "true"/);
  assert.match(review, /Stage disabled until migration approval/);
  assert.match(review, /stageReviewedEstimatorBudget/);
  assert.match(review, /approveReviewedProjectCostBudget/);
  assert.match(review, /Stage draft budget/);
  assert.match(review, /Approve reviewed budget/);
});

test("cost-code review rows use a responsive auto-fit grid", () => {
  assert.match(review, /repeat\(auto-fit,minmax\(min\(100%,220px\),1fr\)\)/);
  assert.doesNotMatch(review, /minmax\(0,1\.4fr\) minmax\(180px/);
});
