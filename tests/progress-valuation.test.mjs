import assert from "node:assert/strict";
import test from "node:test";
import { buildProgressValuationPosition } from "../lib/project-cost/progress-valuation.ts";

const budget=[
  {budgetLineId:"b1",sourceLineId:"4.1",costCode:"04",description:"225mm block wall",unit:"m2",quantity:100,amount:1_000_000},
  {budgetLineId:"b2",sourceLineId:"6.1",costCode:"06",description:"Roof covering",unit:"m2",quantity:50,amount:500_000},
];

test("physical progress is weighted by approved line value, not simple trade average",()=>{const r=buildProgressValuationPosition({budgetLines:budget,valuationLines:[{budgetLineId:"b1",completedQuantity:50},{budgetLineId:"b2",progressPercent:100}],actuals:[]});assert.equal(r.earnedValue,1_000_000);assert.equal(r.directBudget,1_500_000);assert.equal(r.physicalProgressPercent,66.7);assert.equal(r.outstandingWorkValue,500_000);});

test("completed quantity derives progress and cannot exceed approved quantity",()=>{const r=buildProgressValuationPosition({budgetLines:[budget[0]],valuationLines:[{budgetLineId:"b1",completedQuantity:25}],actuals:[]});assert.equal(r.lines[0].progressPercent,25);assert.equal(r.lines[0].earnedValue,250_000);assert.throws(()=>buildProgressValuationPosition({budgetLines:[budget[0]],valuationLines:[{budgetLineId:"b1",completedQuantity:101}],actuals:[]}),/exceeds approved quantity/);});

test("earned value stays separate from actual spend and exposes spend-ahead gap",()=>{const r=buildProgressValuationPosition({budgetLines:budget,valuationLines:[{budgetLineId:"b1",progressPercent:30},{budgetLineId:"b2",progressPercent:20}],actuals:[{transactionId:"t1",costCode:"04",amount:500_000},{transactionId:"t2",costCode:"06",amount:50_000}]});assert.equal(r.earnedValue,400_000);assert.equal(r.actualCost,550_000);assert.equal(r.costPositionVariance,-150_000);assert.equal(r.physicalProgressPercent,26.7);assert.equal(r.spendToDirectBudgetPercent,36.7);assert.equal(r.spendProgressGapPoints,10);assert.equal(r.byCostCode.find(x=>x.costCode==="04").status,"spend_ahead");});

test("unclassified actual still counts at project level but not in a trade",()=>{const r=buildProgressValuationPosition({budgetLines:[budget[0]],valuationLines:[{budgetLineId:"b1",progressPercent:50}],actuals:[{transactionId:"u",costCode:null,amount:120_000}]});assert.equal(r.actualCost,120_000);assert.equal(r.unclassifiedActual,120_000);assert.deepEqual(r.unclassifiedTransactionIds,["u"]);assert.equal(r.byCostCode[0].actual,0);assert.match(r.warnings.join(" "),/unclassified/);});

test("missing progress lines are previewed as zero and clearly warned",()=>{const r=buildProgressValuationPosition({budgetLines:budget,valuationLines:[{budgetLineId:"b1",progressPercent:25}],actuals:[]});assert.equal(r.lines.find(x=>x.budgetLineId==="b2").progressPercent,0);assert.match(r.warnings.join(" "),/no progress entry/);});

test("earned value is explicitly not client valuation",()=>{const r=buildProgressValuationPosition({budgetLines:[budget[0]],valuationLines:[{budgetLineId:"b1",progressPercent:50}],actuals:[]});assert.match(r.warnings.join(" "),/not a client valuation/i);});
