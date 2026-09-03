import assert from "node:assert/strict";
import test from "node:test";
import { buildMobileProgressPosition } from "../mobile/lib/progress-valuation.ts";

test("mobile progress uses weighted earned work and keeps actual cost separate",()=>{const r=buildMobileProgressPosition({budgetLines:[{budgetLineId:"a",sourceLineId:"4.1",costCode:"04",description:"Block wall",unit:"m2",quantity:100,amount:1_000_000},{budgetLineId:"b",sourceLineId:"6.1",costCode:"06",description:"Roof",unit:"m2",quantity:50,amount:500_000}],valuationLines:[{budgetLineId:"a",progressPercent:50,completedQuantity:null},{budgetLineId:"b",progressPercent:100,completedQuantity:null}],actuals:[{transactionId:"t",costCode:"04",amount:600_000}]});assert.equal(r.physicalProgressPercent,66.7);assert.equal(r.earnedValue,1_000_000);assert.equal(r.actualCost,600_000);assert.equal(r.outstandingWorkValue,500_000);});

test("mobile completed quantity derives progress and rejects excess",()=>{const base={budgetLineId:"a",sourceLineId:"4.1",costCode:"04",description:"Block wall",unit:"m2",quantity:100,amount:1_000_000};const r=buildMobileProgressPosition({budgetLines:[base],valuationLines:[{budgetLineId:"a",progressPercent:0,completedQuantity:25}],actuals:[]});assert.equal(r.physicalProgressPercent,25);assert.throws(()=>buildMobileProgressPosition({budgetLines:[base],valuationLines:[{budgetLineId:"a",progressPercent:0,completedQuantity:101}],actuals:[]}),/Invalid completed quantity/);});

test("mobile warns that outstanding work is not Cost-to-Complete",()=>{const r=buildMobileProgressPosition({budgetLines:[],valuationLines:[],actuals:[]});assert.match(r.warnings.join(" "),/not Cost-to-Complete/i);});
