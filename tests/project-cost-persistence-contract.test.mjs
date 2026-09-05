import assert from "node:assert/strict";
import test from "node:test";
import {
  buildApproveProjectCostBudgetRpcArgs,
  buildStageEstimatorBudgetRpcArgs,
} from "../lib/project-cost/persistence-contract.ts";

const seed = {
  project: {
    name: "Test Project",
    currency: "NGN",
    contract_value: 180,
    internal_cost_budget: 110,
  },
  sourceReference: {
    source_system: "charismak_estimator",
    source_project_id: "est-project-1",
    source_estimate_id: "bill-1",
    source_version: 2,
    source_fingerprint: "abc123",
    price_basis_at: "2026-09-02T12:00:00+01:00",
  },
  financialSummary: {
    original_budget: 110,
    revised_budget: 110,
    expected_contract_revenue: 180,
    forecast_final_cost: 110,
    forecast_cost_to_complete: 110,
    forecast_profit: 70,
  },
  budgetLines: [
    {
      source_line_id: "S1:L1",
      cost_code: "04",
      description: "Blockwork",
      unit: "m2",
      quantity: 10,
      rate: 10,
      amount: 100,
      supply_responsibility: "contractor",
    },
  ],
  budgetAllowances: [
    {
      source_allowance_id: "estimator:contingency",
      kind: "contingency",
      description: "Estimator contingency allowance",
      amount: 10,
    },
  ],
};

test("persistence contract preserves direct cost, allowance, internal budget and contract snapshot separately", () => {
  const args = buildStageEstimatorBudgetRpcArgs({
    companyId: "company-1",
    projectId: "accounting-project-1",
    seed,
  });

  assert.equal(args.budget_direct_cost, 100);
  assert.equal(args.budget_allowance_total, 10);
  assert.equal(args.budget_internal_cost, 110);
  assert.equal(args.budget_contract_value_snapshot, 180);
  assert.equal(args.estimator_project_id, "est-project-1");
  assert.equal(args.estimator_estimate_id, "bill-1");
  assert.equal(args.estimator_version, 2);
  assert.equal(args.estimator_fingerprint, "abc123");
  assert.deepEqual(args.budget_lines, seed.budgetLines);
  assert.deepEqual(args.budget_allowances, seed.budgetAllowances);
});

test("persistence contract refuses a seed whose reviewed totals no longer reconcile", () => {
  assert.throws(
    () =>
      buildStageEstimatorBudgetRpcArgs({
        companyId: "company-1",
        projectId: "project-1",
        seed: {
          ...seed,
          project: { ...seed.project, internal_cost_budget: 109 },
        },
      }),
    /no longer reconciles/i,
  );
});

test("persistence contract requires source and destination identities", () => {
  assert.throws(
    () => buildStageEstimatorBudgetRpcArgs({ companyId: "", projectId: "project-1", seed }),
    /Company and Accounting project IDs are required/,
  );
  assert.throws(
    () =>
      buildStageEstimatorBudgetRpcArgs({
        companyId: "company-1",
        projectId: "project-1",
        seed: {
          ...seed,
          sourceReference: { ...seed.sourceReference, source_fingerprint: "" },
        },
      }),
    /fingerprint is required/i,
  );
});

test("budget approval RPC receives only an explicit budget ID", () => {
  assert.deepEqual(buildApproveProjectCostBudgetRpcArgs("budget-1"), {
    target_budget: "budget-1",
  });
  assert.throws(() => buildApproveProjectCostBudgetRpcArgs(" "), /Budget ID is required/);
});
