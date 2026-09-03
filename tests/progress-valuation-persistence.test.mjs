import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../supabase/drafts/project_progress_valuation_v1.sql",import.meta.url),"utf8");

test("progress tables are read-only to authenticated clients",()=>{assert.match(sql,/revoke all on table public\.project_progress_valuations from anon,authenticated/i);assert.match(sql,/revoke all on table public\.project_progress_valuation_lines from anon,authenticated/i);assert.match(sql,/grant select on table public\.project_progress_valuations to authenticated/i);assert.match(sql,/grant select on table public\.project_progress_valuation_lines to authenticated/i);});

test("progress approval requires a complete snapshot and rejects duplicate budget lines",()=>{assert.match(sql,/submitted_count<>budget_count[\s\S]*must contain every approved budget line/i);assert.match(sql,/duplicate_count>0[\s\S]*Duplicate progress budget lines are not allowed/i);});

test("approved physical progress cannot silently reduce",()=>{assert.match(sql,/prior_progress[\s\S]*p\+0\.0001<prior_progress[\s\S]*Progress cannot reduce/i);});

test("progress approval uses private definer plus public invoker wrapper",()=>{assert.match(sql,/function private\.approve_project_progress_valuation_v1[\s\S]*security definer/i);assert.match(sql,/function public\.approve_project_progress_valuation_v1[\s\S]*security invoker/i);assert.match(sql,/revoke all on function public\.approve_project_progress_valuation_v1[\s\S]*from public,anon/i);});

test("progress draft never posts Money, commitments, forecast or client billing",()=>{assert.doesNotMatch(sql,/insert\s+into\s+public\.transactions/i);assert.doesNotMatch(sql,/update\s+public\.transactions/i);assert.doesNotMatch(sql,/insert\s+into\s+public\.project_cost_commitments/i);assert.doesNotMatch(sql,/insert\s+into\s+public\.project_cost_forecasts/i);assert.doesNotMatch(sql,/insert\s+into\s+public\.journal_/i);assert.doesNotMatch(sql,/invoice|receivable/i);});

test("earned value is calculated from approved budget amount and physical progress",()=>{assert.match(sql,/earned := round\(b\.amount\*p\/100,2\)/i);assert.match(sql,/physical_progress_percent=case when direct_cost>0 then round\(total_earned\/direct_cost\*100,4\)/i);});
