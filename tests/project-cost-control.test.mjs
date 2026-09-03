import assert from "node:assert/strict";
import test from "node:test";
import { buildProjectCostControl } from "../lib/project-cost/project-cost-control.ts";

test("missing commitment source is unavailable, not silently zero",()=>{const result=buildProjectCostControl({budgets:[{costCode:"04",amount:1_000_000}],actuals:[{transactionId:"e1",costCode:"04",amount:300_000}],commitments:null,contractValue:1_500_000});assert.equal(result.commitmentsStatus,"not_connected");assert.equal(result.position.actual,300_000);assert.equal(result.position.remainingBudget,700_000);assert.match(result.warnings.join(" "),/Commitments are not connected/);});

test("unclassified expense still reduces project remaining budget",()=>{const result=buildProjectCostControl({budgets:[{costCode:"03",amount:500_000}],actuals:[{transactionId:"a",costCode:"03",amount:100_000},{transactionId:"b",costCode:null,amount:80_000}],commitments:null});assert.equal(result.position.classifiedActual,100_000);assert.equal(result.position.unclassifiedActual,80_000);assert.equal(result.position.actual,180_000);assert.equal(result.position.remainingBudget,320_000);assert.deepEqual(result.position.unclassifiedTransactionIds,["b"]);});

test("forecast is not invented from remaining budget",()=>{const result=buildProjectCostControl({budgets:[{costCode:"06",amount:1_000_000}],actuals:[{transactionId:"r",costCode:"06",amount:400_000}],commitments:[],contractValue:1_400_000});assert.equal(result.forecastFinalCost,null);assert.equal(result.forecastProfit,null);assert.equal(result.expectedProfitAtBudget,400_000);});

test("reviewed cost to complete produces explicit forecast and warns below commitments",()=>{const result=buildProjectCostControl({budgets:[{costCode:"06",amount:1_000_000}],actuals:[{transactionId:"r",costCode:"06",amount:400_000}],commitments:[{commitmentId:"c",costCode:"06",committedAmount:500_000,paidAmount:100_000}],contractValue:1_400_000,forecastCostToComplete:300_000});assert.equal(result.position.unpaidCommitment,400_000);assert.equal(result.forecastFinalCost,700_000);assert.equal(result.forecastProfit,700_000);assert.match(result.warnings.join(" "),/below known unpaid commitments/);});
