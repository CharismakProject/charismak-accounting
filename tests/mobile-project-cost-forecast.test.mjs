import assert from "node:assert/strict";
import test from "node:test";
import { buildMobileProjectCostControl } from "../mobile/lib/project-cost-control.ts";

test("mobile Cost Control adds only unpaid commitment balance to exposure",()=>{const r=buildMobileProjectCostControl({budgets:[{costCode:"04",amount:2_000_000}],allowances:[],actuals:[{transactionId:"a",costCode:"04",amount:600_000}],commitments:[{commitmentId:"c",costCode:"04",committedAmount:1_200_000,paidAmount:400_000}],contractValue:2_600_000,forecastCostToComplete:1_100_000});assert.equal(r.unpaidCommitment,800_000);assert.equal(r.rows.find(x=>x.costCode==="04")?.exposure,1_400_000);assert.equal(r.forecastFinalCost,1_700_000);assert.equal(r.forecastProfit,900_000);});

test("mobile Cost Control preserves unavailable commitment state",()=>{const r=buildMobileProjectCostControl({budgets:[{costCode:"06",amount:1_000_000}],allowances:[],actuals:[],commitments:null,contractValue:null,forecastCostToComplete:null});assert.equal(r.commitmentsStatus,"not_connected");assert.equal(r.unpaidCommitment,0);assert.equal(r.forecastFinalCost,null);assert.match(r.warnings.join(" "),/not connected/i);});
