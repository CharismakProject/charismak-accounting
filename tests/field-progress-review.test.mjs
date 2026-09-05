import assert from "node:assert/strict";
import test from "node:test";
import { assessFieldEvidence, prepareFieldProgressLines, safeWorkItemForPm } from "../lib/project-cost/field-progress-review.ts";

const work=[
  {budgetLineId:"a",sourceLineId:"4.1",costCode:"04",description:"225mm block wall",unit:"m2",approvedQuantity:100,priorProgressPercent:20,priorCompletedQuantity:20},
  {budgetLineId:"b",sourceLineId:"6.1",costCode:"06",description:"Roof covering",unit:"m2",approvedQuantity:null,priorProgressPercent:10,priorCompletedQuantity:null},
];

test("PM field report must contain every approved work item",()=>{
  assert.throws(()=>prepareFieldProgressLines(work,[{budgetLineId:"a",reportedProgressPercent:30,reportedCompletedQuantity:null}]),/every approved work item/i);
});

test("completed quantity derives progress without exposing financial values",()=>{
  const rows=prepareFieldProgressLines(work,[
    {budgetLineId:"a",reportedProgressPercent:0,reportedCompletedQuantity:45,lineNote:"West wing complete"},
    {budgetLineId:"b",reportedProgressPercent:25,reportedCompletedQuantity:null},
  ]);
  assert.equal(rows[0].effectiveProgressPercent,45);
  assert.equal(rows[0].lineNote,"West wing complete");
  assert.equal("amount" in rows[0],false);
  assert.equal("rate" in rows[0],false);
});

test("PM cannot report progress below the current approved position",()=>{
  assert.throws(()=>prepareFieldProgressLines(work,[
    {budgetLineId:"a",reportedProgressPercent:19,reportedCompletedQuantity:null},
    {budgetLineId:"b",reportedProgressPercent:10,reportedCompletedQuantity:null},
  ]),/cannot reduce below/i);
});

test("completed quantity cannot exceed approved BOQ quantity",()=>{
  assert.throws(()=>prepareFieldProgressLines(work,[
    {budgetLineId:"a",reportedProgressPercent:0,reportedCompletedQuantity:101},
    {budgetLineId:"b",reportedProgressPercent:10,reportedCompletedQuantity:null},
  ]),/exceeds the approved quantity/i);
});

test("field evidence is required and bounded",()=>{
  assert.equal(assessFieldEvidence([]).status,"missing");
  assert.equal(assessFieldEvidence([{name:"site.jpg",mimeType:"image/jpeg",size:500_000}]).status,"supported");
  assert.equal(assessFieldEvidence([{name:"video.mp4",mimeType:"video/mp4",size:500_000}]).status,"missing");
  assert.equal(assessFieldEvidence([{name:"huge.pdf",mimeType:"application/pdf",size:11*1024*1024}]).status,"missing");
});

test("safe PM work item omits internal budget amount and rate",()=>{
  const safe=safeWorkItemForPm(work[0]);
  assert.equal(safe.description,"225mm block wall");
  assert.equal(safe.approvedQuantity,100);
  assert.equal("amount" in safe,false);
  assert.equal("rate" in safe,false);
  assert.equal("earnedValue" in safe,false);
});
