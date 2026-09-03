import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../supabase/drafts/project_cost_payment_link_transaction_guard_v1.sql",import.meta.url),"utf8");

test("active commitment links block accounting-identity changes to Money transactions",()=>{assert.match(sql,/link\.transaction_id=old\.id[\s\S]*link\.status='active'/i);assert.match(sql,/new\.amount is distinct from old\.amount/i);assert.match(sql,/new\.project_id is distinct from old\.project_id/i);assert.match(sql,/new\.kind is distinct from old\.kind/i);assert.match(sql,/new\.status is distinct from old\.status/i);assert.match(sql,/new\.cost_code is distinct from old\.cost_code/i);assert.match(sql,/Void active commitment payment links before changing a linked Money transaction/i);});

test("guard does not itself mutate Money or commitment data",()=>{assert.doesNotMatch(sql,/update\s+public\.transactions/i);assert.doesNotMatch(sql,/insert\s+into\s+public\.transactions/i);assert.doesNotMatch(sql,/update\s+public\.project_cost_commitments/i);});
