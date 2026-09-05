import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = readFileSync(
  new URL("../app/projects/estimator-review/actions.ts", import.meta.url),
  "utf8",
);

test("project-cost server actions are feature-gated before any Supabase mutation", () => {
  assert.match(source, /PROJECT_COST_BRIDGE_ENABLED === "true"/);
  const stageStart = source.indexOf("export async function stageReviewedEstimatorBudget");
  const approvalStart = source.indexOf("export async function approveReviewedProjectCostBudget");
  const stageBlock = source.slice(stageStart, approvalStart);
  const approvalBlock = source.slice(approvalStart);
  assert.ok(stageBlock.indexOf("if (!bridgeEnabled())") < stageBlock.indexOf("createClient()"));
  assert.ok(approvalBlock.indexOf("if (!bridgeEnabled())") < approvalBlock.indexOf("createClient()"));
});

test("staging validates destination UUIDs, source identity, totals and bounded reviewed lines", () => {
  assert.match(source, /target_company: z\.string\(\)\.uuid\(\)/);
  assert.match(source, /target_project: z\.string\(\)\.uuid\(\)/);
  assert.match(source, /estimator_version: z\.number\(\)\.int\(\)\.positive\(\)/);
  assert.match(source, /estimator_fingerprint: z\.string\(\)\.trim\(\)\.min\(16\)/);
  assert.match(source, /budget_lines: z\.array\(lineSchema\)\.min\(1\)\.max\(20_000\)/);
  assert.match(source, /\.strict\(\)/);
});

test("staging and approval remain separate authenticated RPC calls", () => {
  assert.match(source, /supabase\.auth\.getUser\(\)/);
  assert.match(source, /"stage_estimator_budget_v1"/);
  assert.match(source, /"approve_project_cost_budget_v1"/);
  assert.match(source, /Sign in before staging an Accounting budget/);
  assert.match(source, /Sign in before approving an Accounting budget/);
});
