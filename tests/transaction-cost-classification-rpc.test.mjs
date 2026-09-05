import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";

const sql=fs.readFileSync(new URL("../supabase/drafts/transaction_cost_classification_rpc_v1.sql",import.meta.url),"utf8").toLowerCase();

test("classification RPC is review-only and audit-backed",()=>{
  assert.match(sql,/has_company_role\(target_company,array\['md','accountant'\]/);
  assert.match(sql,/t\.kind='expense'/);assert.match(sql,/t\.status='posted'/);assert.match(sql,/t\.cost_code is null/);
  assert.match(sql,/insert into public\.transaction_revisions/);assert.match(sql,/revision_type,before_data,after_data/);
  assert.match(sql,/update public\.transactions t\s+set cost_code=x\.cost_code,updated_at=now\(\)/s);
  assert.doesNotMatch(sql,/insert into public\.transactions/);
  assert.doesNotMatch(sql,/set\s+amount\s*=/);assert.doesNotMatch(sql,/set\s+project_id\s*=/);assert.doesNotMatch(sql,/set\s+source_account_id\s*=/);assert.doesNotMatch(sql,/set\s+status\s*=/);
});
