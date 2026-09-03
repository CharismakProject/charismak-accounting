import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";
const sql=fs.readFileSync(new URL("../supabase/drafts/project_cost_commitment_payment_link_v1.sql",import.meta.url),"utf8");

test("payment link only allocates existing posted expenses and never posts Money",()=>{assert.match(sql,/t\.kind='expense' and t\.status='posted'/i);assert.doesNotMatch(sql,/insert\s+into\s+public\.transactions/i);assert.doesNotMatch(sql,/update\s+public\.transactions/i);assert.doesNotMatch(sql,/journal_/i);});
test("payment must already share the confirmed commitment cost code",()=>{assert.match(sql,/Classify this Money expense before linking/i);assert.match(sql,/does not match commitment cost code/i);});
test("allocations cannot exceed transaction or commitment remaining values",()=>{assert.match(sql,/Payment allocations exceed the Money transaction amount/i);assert.match(sql,/Payment allocation exceeds the commitment unpaid balance/i);});
test("one transaction can split but the same active commitment pair is unique",()=>{assert.match(sql,/one_active_pair_idx[\s\S]*\(commitment_id,transaction_id\)[\s\S]*status='active'/i);assert.doesNotMatch(sql,/unique\s*\(transaction_id\)/i);});
test("void reverses commitment allocation only and preserves audit",()=>{assert.match(sql,/status='void'/i);assert.match(sql,/payment_unlinked/i);assert.match(sql,/payment_linked/i);});
test("authenticated clients cannot bypass payment-link RPC",()=>{assert.match(sql,/revoke insert,update,delete,truncate,references,trigger[\s\S]*project_cost_commitment_payment_links[\s\S]*authenticated/i);});
