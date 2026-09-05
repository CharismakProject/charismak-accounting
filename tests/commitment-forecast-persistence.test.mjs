import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../supabase/drafts/project_cost_commitment_forecast_v1.sql",import.meta.url),"utf8");

test("commitment forecast tables are direct-write locked for authenticated clients",()=>{assert.match(sql,/revoke insert,update,delete,truncate,references,trigger[\s\S]*project_cost_commitments[\s\S]*from authenticated/i);assert.match(sql,/grant select[\s\S]*project_cost_forecasts[\s\S]*to authenticated/i);});

test("forecast approval requires every open commitment code to be covered server-side",()=>{assert.match(sql,/server-side completeness guard/i);assert.match(sql,/from public\.project_cost_commitments commitment[\s\S]*commitment\.status='open'[\s\S]*group by commitment\.cost_code/i);assert.match(sql,/where submitted\.value->>'costCode'=code/i);assert.match(sql,/ctc \+ 0\.005 < unpaid[\s\S]*Forecast CTC for cost code % is below unpaid commitments/i);});

test("forecast payload rejects duplicate cost codes",()=>{assert.match(sql,/having count\(\*\) > 1[\s\S]*Forecast contains duplicate cost codes/i);});

test("commitment forecast draft does not post Money transactions",()=>{assert.doesNotMatch(sql,/insert\s+into\s+public\.transactions/i);assert.doesNotMatch(sql,/update\s+public\.transactions/i);assert.doesNotMatch(sql,/insert\s+into\s+public\.journal_/i);});

test("closed commitment must be fully paid",()=>{assert.match(sql,/Closed commitment must be fully paid/i);assert.match(sql,/status <> 'closed' or round\(paid_amount,2\)=round\(committed_amount,2\)/i);});
