import assert from "node:assert/strict";
import test from "node:test";
import { buildMobileProjectCostControl } from "../mobile/lib/project-cost-control.ts";
import { buildMobileProjectHealth } from "../mobile/lib/project-health.ts";

test("mobile commercial health shows erosion before loss",()=>{const control=buildMobileProjectCostControl({budgets:[{costCode:"04",amount:1_000_000}],allowances:[],actuals:[{transactionId:"a",costCode:"04",amount:500_000}],commitments:[],contractValue:1_500_000,forecastCostToComplete:700_000});const result=buildMobileProjectHealth({control,contractValue:1_500_000,forecastLines:[{costCode:"04",amount:700_000}]});assert.equal(control.expectedProfitAtBudget,500_000);assert.equal(control.forecastProfit,300_000);assert.equal(result.profitDrift,-200_000);assert.equal(result.status,"profit_eroding");assert.equal(result.topRisks[0].status,"over_budget");});

test("mobile commercial health remains not ready without reviewed forecast",()=>{const control=buildMobileProjectCostControl({budgets:[{costCode:"04",amount:1_000_000}],allowances:[],actuals:[],commitments:null,contractValue:1_500_000,forecastCostToComplete:null});const result=buildMobileProjectHealth({control,contractValue:1_500_000,forecastLines:null});assert.equal(result.status,"not_ready");assert.equal(result.readyForCommercialDecision,false);});
