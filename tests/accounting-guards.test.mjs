import test from "node:test";
import assert from "node:assert/strict";
import {
  categoryForClassification,
  inferFinancialAccountType,
  parseOptionalNonNegativeMoney,
  validateApprovalDecision,
  validateInternalTransfer,
  validateProgressInput,
  validateStatementClassification,
  validateUploadBatch,
} from "../lib/accounting/guards.ts";

test("full approval uses the request amount", () => {
  assert.deepEqual(validateApprovalDecision("approve", 125000), { approvedAmount: 125000, status: "approved" });
});

test("partial approval must be positive and below request", () => {
  assert.deepEqual(validateApprovalDecision("partial_approve", 100000, 40000), { approvedAmount: 40000, status: "partially_approved" });
  assert.throws(() => validateApprovalDecision("partial_approve", 100000, 0), /greater than zero/i);
  assert.throws(() => validateApprovalDecision("partial_approve", 100000, -1), /greater than zero/i);
  assert.throws(() => validateApprovalDecision("partial_approve", 100000, 100000), /less than the original/i);
  assert.throws(() => validateApprovalDecision("partial_approve", 100000, 120000), /less than the original/i);
});

test("internal transfer requires two distinct accounts and positive amount", () => {
  assert.deepEqual(validateInternalTransfer({ amount: 5000, fromAccountId: "a", toAccountId: "b" }), { amount: 5000, fromAccountId: "a", toAccountId: "b" });
  assert.throws(() => validateInternalTransfer({ amount: 0, fromAccountId: "a", toAccountId: "b" }), /greater than zero/i);
  assert.throws(() => validateInternalTransfer({ amount: 5000, fromAccountId: "a", toAccountId: "a" }), /different/i);
  assert.throws(() => validateInternalTransfer({ amount: 5000, fromAccountId: "a", toAccountId: "" }), /both the source and destination/i);
});

test("progress accepts only 0-100 and non-negative cost to complete", () => {
  assert.deepEqual(validateProgressInput(0, ""), { percent: 0, costToComplete: null });
  assert.deepEqual(validateProgressInput(100, 250000), { percent: 100, costToComplete: 250000 });
  assert.throws(() => validateProgressInput(-1, 0), /between 0 and 100/i);
  assert.throws(() => validateProgressInput(101, 0), /between 0 and 100/i);
  assert.throws(() => validateProgressInput(50, -10), /zero or greater/i);
});

test("statement classification rejects unknown and arbitrary values", () => {
  assert.equal(validateStatementClassification("company_expense"), "company_expense");
  assert.equal(validateStatementClassification("company_financing"), "company_financing");
  assert.throws(() => validateStatementClassification("unknown"), /valid accounting classification/i);
  assert.throws(() => validateStatementClassification("drop table"), /valid accounting classification/i);
});

test("company and project expenses keep categories", () => {
  assert.equal(categoryForClassification("company_expense", "Staff Accommodation"), "Staff Accommodation");
  assert.equal(categoryForClassification("project_expense", "Masonry"), "Masonry");
  assert.equal(categoryForClassification("company_expense", ""), "Uncategorised");
  assert.equal(categoryForClassification("company_income", "Other"), null);
});

test("fintech account inference recognises OPay/OWealth", () => {
  assert.equal(inferFinancialAccountType("OPay", "Wallet"), "fintech_wallet");
  assert.equal(inferFinancialAccountType("OPay", "Savings / OWealth"), "fintech_wallet");
  assert.equal(inferFinancialAccountType("Access Bank", "Business Current"), "bank");
});

test("non-negative optional money rejects malformed and negative values", () => {
  assert.equal(parseOptionalNonNegativeMoney("", "Limit"), null);
  assert.equal(parseOptionalNonNegativeMoney("500000", "Limit"), 500000);
  assert.throws(() => parseOptionalNonNegativeMoney("abc", "Limit"), /zero or greater/i);
  assert.throws(() => parseOptionalNonNegativeMoney(-1, "Limit"), /zero or greater/i);
});

test("upload batches are bounded", () => {
  assert.equal(validateUploadBatch(1, 1024), true);
  assert.equal(validateUploadBatch(20, 100 * 1024 * 1024), true);
  assert.throws(() => validateUploadBatch(21, 1024), /up to 20 files/i);
  assert.throws(() => validateUploadBatch(2, 100 * 1024 * 1024 + 1), /100 MB/i);
});
