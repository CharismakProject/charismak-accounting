import assert from "node:assert/strict";
import test from "node:test";
import { buildTransactionCostClassificationRpcArgs, suggestTransactionCostCode } from "../lib/project-cost/transaction-cost-review.ts";

test("clear trade wording produces a bulk-ready suggestion",()=>{
  const result=suggestTransactionCostCode({title:"Payment for electrical wiring and sockets",description:null,categoryName:null});
  assert.equal(result.suggestedCostCode,"16");assert.equal(result.confidence,"high");assert.equal(result.readyForBulkConfirm,true);
});

test("generic material or transport wording is not forced into a trade",()=>{
  assert.equal(suggestTransactionCostCode({title:"Cement and sand purchase",description:null,categoryName:null}).suggestedCostCode,null);
  assert.equal(suggestTransactionCostCode({title:"Transport to site",description:null,categoryName:null}).suggestedCostCode,null);
});

test("mixed foundation concrete wording stays ambiguous",()=>{
  const result=suggestTransactionCostCode({title:"Foundation concrete works",description:null,categoryName:null});
  assert.equal(result.suggestedCostCode,null);assert.equal(result.confidence,"low");assert.ok(result.candidateCostCodes.includes("02"));assert.ok(result.candidateCostCodes.includes("03"));
});

test("classification payload requires explicit valid unique selections",()=>{
  const args=buildTransactionCostClassificationRpcArgs("project-1",[{transactionId:"tx-1",costCode:"04"},{transactionId:"tx-2",costCode:"13",reason:"Reviewed painting cost"}]);
  assert.equal(args.target_project,"project-1");assert.equal(args.classifications.length,2);assert.equal(args.classifications[0].cost_code,"04");
  assert.throws(()=>buildTransactionCostClassificationRpcArgs("project-1",[{transactionId:"tx-1",costCode:"04"},{transactionId:"tx-1",costCode:"13"}]),/Duplicate transaction/);
});
