import test from "node:test";
import assert from "node:assert/strict";
import { extractPreliminaryPricingFromSheets } from "../mobile/lib/preliminaries-pricing.ts";
import { buildBoqWorkingSummary } from "../mobile/lib/boq-working-summary.ts";

const boq={id:"marina",name:"Marina planning bill",currency:"NGN",sections:[{id:"prelims",title:"Preliminaries",context:[],items:[
  {id:"a",itemNo:"A",description:"Mobilisation",unit:"Item",quantity:1,rate:null,amount:null},
  {id:"b",itemNo:"B",description:"Site security",unit:"Item",quantity:1,rate:null,amount:null},
  {id:"c",itemNo:"C",description:"Site office setup and running",unit:"Item",quantity:1,rate:null,amount:null},
  {id:"d",itemNo:"D",description:"Special allowance",unit:"Item",quantity:1,rate:null,amount:null},
  {id:"e",itemNo:"E",description:"Unpriced preliminary item",unit:"Item",quantity:1,rate:null,amount:null},
  {id:"f",itemNo:"F",description:"Source total only item",unit:"Item",quantity:1,rate:null,amount:null},
]},{id:"works",title:"Measured Works",context:[],items:[
  {id:"m1",itemNo:"1",description:"Blockwork",unit:"m2",quantity:100,rate:2000,amount:200000},
]}]};

const sheets=[{name:"Bill 1 - Preliminaries",rows:[
  ["S/N","DESCRIPTION","Qty","Unit","Fixed Charge","Time Related","Total Charges"],
  ["A","Mobilisation",null,"Item",100000,null,null],
  ["B","Site security",null,"Item",null,50000,null],
  ["C","Site office setup and running",null,"Item",40000,60000,null],
  ["D","Special allowance",null,"Item",10000,20000,35000],
  ["E","Unpriced preliminary item",null,"Item",null,null,null],
  ["F","Source total only item",null,"Item",null,null,70000],
  [null,"Collection",null,null,150000,130000,null],
]}];

test("preliminaries preserve fixed, time, mixed, total-only and genuinely unpriced behaviour",()=>{
  const pricing=extractPreliminaryPricingFromSheets(sheets,boq);
  assert.equal(pricing.a.behaviour,"fixed");
  assert.equal(pricing.a.fixedCharge,100000);
  assert.equal(pricing.a.timeRelatedCharge,null);
  assert.equal(pricing.a.planningTotal,100000);
  assert.equal(pricing.a.planningTotalSource,"derived");

  assert.equal(pricing.b.behaviour,"time_related");
  assert.equal(pricing.b.planningTotal,50000);

  assert.equal(pricing.c.behaviour,"mixed");
  assert.equal(pricing.c.planningTotal,100000);

  assert.equal(pricing.d.behaviour,"mixed");
  assert.equal(pricing.d.sourceTotalCharges,35000);
  assert.equal(pricing.d.planningTotal,35000);
  assert.equal(pricing.d.planningTotalSource,"source");
  assert.equal(pricing.d.componentDifference,5000);

  assert.equal(pricing.e.behaviour,"unpriced");
  assert.equal(pricing.e.planningTotal,null);

  assert.equal(pricing.f.behaviour,"total_only");
  assert.equal(pricing.f.sourceTotalCharges,70000);
  assert.equal(pricing.f.planningTotal,70000);
  assert.equal(pricing.f.planningTotalSource,"source");
});

test("preliminary planning costs are priced without forcing Qty × Rate arithmetic",()=>{
  const pricing=extractPreliminaryPricingFromSheets(sheets,boq);
  const summary=buildBoqWorkingSummary({boq,rates:{m1:"2000"},rateSources:{m1:"imported"},preliminariesPricing:pricing});
  assert.equal(summary.preliminaryItems,6);
  assert.equal(summary.unpricedItems,1);
  assert.equal(summary.arithmeticMismatchItems,0);
  assert.equal(summary.derivedPreliminaryTotals,3);
  assert.equal(summary.workingTotal,555000);
  assert.equal(summary.pricedTotal,555000);
  assert.equal(summary.lines.find(line=>line.itemId==="a")?.workingRate,null);
  assert.equal(summary.lines.find(line=>line.itemId==="a")?.kind,"preliminary");
});
