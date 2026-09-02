import assert from "node:assert/strict";
import test from "node:test";
import { calculateProjectCostPosition } from "../lib/project-cost/budget-vs-actual.ts";

test("budget position does not double count paid commitments", () => {
  const result = calculateProjectCostPosition({
    budgets: [{ costCode: "04", amount: 1_000_000 }],
    allowances: [{ kind: "contingency", amount: 100_000 }],
    actuals: [{ transactionId: "tx-paid", costCode: "04", amount: 300_000 }],
    commitments: [
      {
        commitmentId: "subcontract-1",
        costCode: "04",
        committedAmount: 800_000,
        paidAmount: 300_000,
      },
    ],
  });

  const blockwork = result.byCostCode.find((row) => row.costCode === "04");
  assert.ok(blockwork);
  assert.equal(blockwork.committed, 800_000);
  assert.equal(blockwork.commitmentPaid, 300_000);
  assert.equal(blockwork.unpaidCommitment, 500_000);
  assert.equal(blockwork.actual, 300_000);
  assert.equal(blockwork.exposure, 800_000);
  assert.equal(blockwork.remainingBeforeUncommittedSpend, 200_000);
  assert.equal(result.totalExposure, 800_000);
  assert.equal(result.remainingBudget, 300_000);
});

test("unclassified actual spend is surfaced instead of silently assigned", () => {
  const result = calculateProjectCostPosition({
    budgets: [{ costCode: "03", amount: 500_000 }],
    actuals: [
      { transactionId: "tx-concrete", costCode: "03", amount: 120_000 },
      { transactionId: "tx-unknown", costCode: null, amount: 80_000 },
      { transactionId: "tx-invalid", costCode: "99", amount: 20_000 },
    ],
  });

  assert.equal(result.classifiedActual, 120_000);
  assert.equal(result.unclassifiedActual, 100_000);
  assert.equal(result.actual, 220_000);
  assert.deepEqual(result.unclassifiedTransactionIds, ["tx-unknown", "tx-invalid"]);
});

test("contingency reserve absorbs direct-cost overrun without becoming a trade code", () => {
  const result = calculateProjectCostPosition({
    budgets: [{ costCode: "10", amount: 1_000_000 }],
    allowances: [{ kind: "contingency", amount: 150_000 }],
    actuals: [{ transactionId: "tx-tiles", costCode: "10", amount: 1_080_000 }],
  });

  assert.equal(result.directBudget, 1_000_000);
  assert.equal(result.allowanceBudget, 150_000);
  assert.equal(result.internalCostBudget, 1_150_000);
  assert.equal(result.remainingBudget, 70_000);
  assert.equal(result.contingencyRemainingBeforeUnclassified, 70_000);
  const tiling = result.byCostCode.find((row) => row.costCode === "10");
  assert.equal(tiling?.status, "over_budget");
});

test("near-budget exposure is flagged before it becomes an overrun", () => {
  const result = calculateProjectCostPosition({
    budgets: [{ costCode: "06", amount: 1_000_000 }],
    actuals: [{ transactionId: "tx-roof", costCode: "06", amount: 700_000 }],
    commitments: [
      { commitmentId: "roof-balance", costCode: "06", committedAmount: 250_000 },
    ],
  });
  const roofing = result.byCostCode.find((row) => row.costCode === "06");
  assert.equal(roofing?.exposure, 950_000);
  assert.equal(roofing?.budgetConsumedPercent, 95);
  assert.equal(roofing?.status, "at_risk");
});

test("invalid negative values and overpaid commitments are rejected", () => {
  assert.throws(
    () => calculateProjectCostPosition({ budgets: [{ costCode: "04", amount: -1 }], actuals: [] }),
    /non-negative finite amount/,
  );
  assert.throws(
    () =>
      calculateProjectCostPosition({
        budgets: [],
        actuals: [],
        commitments: [
          { commitmentId: "bad", costCode: "04", committedAmount: 100, paidAmount: 120 },
        ],
      }),
    /Paid amount exceeds commitment/,
  );
});
