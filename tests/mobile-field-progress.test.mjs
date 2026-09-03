import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { assessMobileFieldEvidence, prepareMobileFieldProgressLines } from "../mobile/lib/field-progress-review.ts";

const work=[
  {budgetLineId:"a",sourceLineId:"1",costCode:"04",description:"Blockwork",unit:"m2",approvedQuantity:100,priorProgressPercent:20,priorCompletedQuantity:20},
  {budgetLineId:"b",sourceLineId:"2",costCode:"13",description:"Painting",unit:"m2",approvedQuantity:200,priorProgressPercent:0,priorCompletedQuantity:null},
];

test("native PM field report must carry the complete approved work list",()=>{
  assert.throws(()=>prepareMobileFieldProgressLines(work,[{budgetLineId:"a",reportedProgressPercent:25,reportedCompletedQuantity:null}]),/every approved work item/i);
});

test("native completed quantity derives progress and cannot go backwards",()=>{
  const rows=prepareMobileFieldProgressLines(work,[
    {budgetLineId:"a",reportedProgressPercent:20,reportedCompletedQuantity:40},
    {budgetLineId:"b",reportedProgressPercent:10,reportedCompletedQuantity:null},
  ]);
  assert.equal(rows[0].effectiveProgressPercent,40);
  assert.throws(()=>prepareMobileFieldProgressLines(work,[
    {budgetLineId:"a",reportedProgressPercent:10,reportedCompletedQuantity:null},
    {budgetLineId:"b",reportedProgressPercent:0,reportedCompletedQuantity:null},
  ]),/cannot reduce/i);
});

test("native field evidence is private-flow compatible and bounded",()=>{
  assert.equal(assessMobileFieldEvidence([]).status,"missing");
  assert.equal(assessMobileFieldEvidence([{name:"site.jpg",mimeType:"image/jpeg",size:1024}]).status,"supported");
  assert.ok(assessMobileFieldEvidence([{name:"site.exe",mimeType:"application/octet-stream",size:1024}]).warnings.length);
});

test("native PM route uses only safe progress RPC and private evidence bucket",()=>{
  const source=readFileSync(new URL("../mobile/app/project-field-progress/[id].tsx",import.meta.url),"utf8");
  assert.match(source,/EXPO_PUBLIC_PROJECT_PROGRESS_FIELD_REVIEW_ENABLED/);
  assert.match(source,/get_project_progress_work_items_v1/);
  assert.match(source,/submit_project_field_progress_v1/);
  assert.match(source,/project-progress-evidence/);
  assert.match(source,/currentRole!=="pm"/);
  assert.doesNotMatch(source,/\.from\("transactions"\)/);
  assert.doesNotMatch(source,/earned_value/);
  assert.doesNotMatch(source,/project_cost_budget_lines/);
});

test("native Project workspace exposes Field Report entry",()=>{
  const project=readFileSync(new URL("../mobile/app/project/[id].tsx",import.meta.url),"utf8");
  assert.match(project,/project-field-progress/);
  assert.match(project,/Field Report/);
});
