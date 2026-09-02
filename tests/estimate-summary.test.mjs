import test from "node:test";
import assert from "node:assert/strict";
import { buildEstimatePrintHtml, buildEstimateSpreadsheetXml, buildEstimateSummary, initialWorkingRates } from "../lib/estimate/estimate-summary.ts";

const boq={id:"b1",name:"Sample",currency:"NGN",sections:[{id:"s1",title:"Blockwork",items:[{id:"i1",itemNo:"4.1",description:"225mm blockwork",unit:"m2",quantity:100,rate:10000,amount:1000000,materialBreakdown:{status:"available",materials:[{id:"m1",material:"225mm blocks",unit:"pcs",baseQuantity:1000,wastePercent:5,totalQuantity:1050,source:"recipe"}],assumptions:["5% waste"]}},{id:"i2",itemNo:"4.2",description:"Extra wall",unit:"m2",quantity:20,rate:null,amount:null,materialBreakdown:{status:"needs_review",materials:[]}}]}]};

test("initial rates preserve imported rate and unpriced state",()=>{const rates=initialWorkingRates(boq);assert.deepEqual(rates.i1,{rate:10000,source:"imported"});assert.deepEqual(rates.i2,{rate:null,source:null});});

test("summary applies commercial adjustments in documented order",()=>{const summary=buildEstimateSummary({boq,workingRates:{i1:{rate:10000,source:"imported"},i2:{rate:5000,source:"manual"}},settings:{contingencyPercent:5,overheadPercent:10,profitPercent:20,discountPercent:2,taxPercent:7.5}});assert.equal(summary.directCost,1100000);assert.equal(summary.contingency,55000);assert.equal(summary.overhead,115500);assert.equal(summary.profit,254100);assert.equal(summary.discount,30492);assert.equal(summary.subtotalBeforeTax,1494108);assert.equal(summary.tax,112058.1);assert.equal(summary.grandTotal,1606166.1);assert.equal(summary.unpricedItems,0);assert.equal(summary.isCommercialTotalComplete,true);});

test("unpriced lines keep commercial total provisional",()=>{const summary=buildEstimateSummary({boq});assert.equal(summary.directCost,1000000);assert.equal(summary.unpricedItems,1);assert.equal(summary.isCommercialTotalComplete,false);});

test("materials are taken from materialized BOQ",()=>{const summary=buildEstimateSummary({boq,materializedBoq:boq});assert.equal(summary.materials.length,1);assert.equal(summary.materials[0].quantity,1050);assert.equal(summary.materials[0].sourceItems[0].itemId,"i1");});

test("print and spreadsheet exports contain summary, BOQ and materials",()=>{const summary=buildEstimateSummary({boq});const html=buildEstimatePrintHtml({boq,summary});const xml=buildEstimateSpreadsheetXml({boq,summary});assert.match(html,/Commercial Summary/);assert.match(html,/Priced BOQ/);assert.match(html,/Material Schedule/);assert.match(xml,/Estimate Summary/);assert.match(xml,/Priced BOQ/);assert.match(xml,/Materials/);assert.match(xml,/UNPRICED|<Data ss:Type="String"><\/Data>/);});
