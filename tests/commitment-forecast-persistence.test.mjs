import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../supabase/drafts/project_cost_commitment_forecast_v1.sql",import.meta.url),"utf8");

test("commitment forecast tables are direct-write locked for authenticated clients",()=>{assert.match(sql,/revoke insert,update,delete,truncate,references,trigger[\s\S]*project_cost_commitments[\s\S]*from authenticated/i);assert.match(sql,/grant select[\s\S]*project_cost_forecasts[\s\S]*to authenticated/i);});

test("forecast approval requires cost to complete to cover unpaid commitments",()=>{assert.match(sql,/if ctc < unpaid then raise exception 'Forecast CTC for cost code % is below unpaid commitments'/i);});

test("commitment forecast draft does not post Money transactions",()=>{assert.doesNotMatch(sql,/insert\s+into\s+public\.transactions/i);assert.doesNotMatch(sql,/update\s+public\.transactions/i);assert.doesNotMatch(sql,/insert\s+into\s+public\.journal_/i);});

test("closed commitment must be fully paid",()=>{assert.match(sql,/Closed commitment must be fully paid/i);assert.match(sql,/status <> 'closed' or round\(paid_amount,2\)=round\(committed_amount,2\)/i);});
