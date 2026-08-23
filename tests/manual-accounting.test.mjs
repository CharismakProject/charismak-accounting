import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const migration = read("supabase/migrations/20260823080000_manual_accounting_v1.sql");
const manualForm = read("app/add/manual/ManualTransactionForm.tsx");
const manualAction = read("app/add/manual/actions.ts");
const addPage = read("app/add/page.tsx");
const approvalAction = read("app/approvals/actions.ts");
const treasuryAction = read("app/treasury/actions.ts");

test("manual posting is idempotent and authenticated", () => {
  assert.match(migration, /unique\(company_id, request_key\)/i);
  assert.match(migration, /if v_user is null then raise exception 'Authentication required'/i);
  assert.match(migration, /already_recorded',true/i);
});

test("manual posting updates transaction, journal, cash and project atomically", () => {
  assert.match(migration, /insert into public\.canonical_transactions/i);
  assert.match(migration, /private\.ensure_canonical_journal/i);
  assert.match(migration, /update public\.financial_accounts[\s\S]*current_balance/i);
  assert.match(migration, /refresh_project_financial_summary/i);
});

test("public RPC wrappers do not bypass caller permissions", () => {
  assert.match(migration, /language sql\s+security invoker/gi);
  assert.match(migration, /revoke all on function public\.post_manual_transaction_atomic[\s\S]*from public,anon/i);
  assert.match(migration, /has_permission\(target_company,'transactions\.confirm'\)/i);
});

test("manual transfer posts two legs and balanced bank journal", () => {
  assert.match(migration, /':debit'/i);
  assert.match(migration, /':credit'/i);
  assert.match(migration, /'Transfer received',abs\(transfer_amount\),0/i);
  assert.match(migration, /'Transfer sent',0,abs\(transfer_amount\)/i);
  assert.match(migration, /creates_due_to_from/i);
});

test("approval payment is limited to approved unpaid value", () => {
  assert.match(migration, /Only approved requests can be paid/i);
  assert.match(migration, /Payment exceeds the approved unpaid amount/i);
  assert.match(migration, /'mark_paid'/i);
  assert.match(approvalAction, /post_manual_transaction_atomic/i);
  assert.match(approvalAction, /entry_amount: amount/i);
});

test("reversal preserves history and cancels accounting effect", () => {
  assert.match(migration, /reversal_of/i);
  assert.match(migration, /update public\.canonical_transactions set reversed_at=now\(\)/i);
  assert.match(migration, /current_balance=coalesce\(current_balance,0\)-v_tx\.signed_amount/i);
});

test("manual-first UI covers essential non-statement entries", () => {
  for (const kind of ["project_funding", "project_expense", "company_expense", "company_income", "company_financing", "project_advance", "reimbursement", "personal_non_business"]) {
    assert.match(manualForm, new RegExp(kind));
  }
  assert.match(addPage, /NO STATEMENT REQUIRED/);
  assert.match(addPage, /\/add\/manual/);
  assert.match(manualAction, /post_manual_transaction_atomic/);
  assert.match(treasuryAction, /post_manual_transfer_atomic/);
});
