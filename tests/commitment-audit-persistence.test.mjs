import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const sql=fs.readFileSync(new URL("../supabase/drafts/project_cost_commitment_audit_v1.sql",import.meta.url),"utf8");

test("commitment edits retain immutable before and after snapshots",()=>{assert.match(sql,/project_cost_commitment_revisions/i);assert.match(sql,/before_data jsonb/i);assert.match(sql,/after_data jsonb not null/i);assert.match(sql,/revision_type[^\n]*'created','updated'/i);assert.match(sql,/values\(result_id,target_project_id,'updated',before_snapshot,after_snapshot,actor\)/i);});

test("authenticated clients cannot bypass commitment audit table writes",()=>{assert.match(sql,/revoke insert,update,delete,truncate,references,trigger[\s\S]*project_cost_commitment_revisions[\s\S]*authenticated/i);assert.match(sql,/grant select[\s\S]*project_cost_commitment_revisions[\s\S]*authenticated/i);});

test("audited commitment save does not alter Money transactions",()=>{assert.doesNotMatch(sql,/insert\s+into\s+public\.transactions/i);assert.doesNotMatch(sql,/update\s+public\.transactions/i);assert.doesNotMatch(sql,/journal_/i);});
