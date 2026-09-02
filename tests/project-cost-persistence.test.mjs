import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const bridge = read("supabase/drafts/project_cost_bridge_v1.sql");
const lockdown = read("supabase/drafts/project_cost_bridge_direct_write_lockdown_v1.sql");
const rpc = read("supabase/drafts/project_cost_import_rpc_v1.sql");

test("new project-cost tables explicitly enable RLS and Data API grants", () => {
  for (const table of [
    "construction_cost_codes",
    "project_source_links",
    "project_cost_budgets",
    "project_cost_budget_lines",
    "project_cost_budget_allowances",
  ]) {
    assert.match(bridge, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
    assert.match(bridge, new RegExp(`revoke all on table public\\.${table} from anon`, "i"));
  }
  assert.match(bridge, /grant select on table public\.construction_cost_codes to authenticated,service_role/i);
});

test("authenticated clients cannot bypass reviewed budget RPCs with raw table writes", () => {
  for (const table of [
    "project_source_links",
    "project_cost_budgets",
    "project_cost_budget_lines",
    "project_cost_budget_allowances",
  ]) {
    assert.match(
      lockdown,
      new RegExp(`revoke insert,update,delete,truncate,references,trigger[\\s\\S]*public\\.${table}[\\s\\S]*from authenticated`, "i"),
    );
  }
});

test("private budget implementations remain private and schema-safe", () => {
  assert.match(rpc, /array\['md'\]::public\.company_role\[\]/);
  assert.match(
    rpc,
    /revoke all on function private\.stage_estimator_budget_v1_impl[\s\S]*from public,anon,authenticated/i,
  );
  assert.match(
    rpc,
    /revoke all on function private\.approve_project_cost_budget_v1_impl\(uuid\) from public,anon,authenticated/i,
  );
  assert.doesNotMatch(rpc, /grant execute on function private\.stage_estimator_budget_v1_impl[\s\S]*to authenticated/i);
  assert.doesNotMatch(rpc, /grant execute on function private\.approve_project_cost_budget_v1_impl[\s\S]*to authenticated/i);
});

test("public budget RPCs are the explicit authenticated entry points", () => {
  assert.match(
    rpc,
    /create or replace function public\.stage_estimator_budget_v1[\s\S]*security definer[\s\S]*revoke all on function public\.stage_estimator_budget_v1[\s\S]*from public,anon[\s\S]*grant execute on function public\.stage_estimator_budget_v1[\s\S]*to authenticated/i,
  );
  assert.match(
    rpc,
    /create or replace function public\.approve_project_cost_budget_v1[\s\S]*security definer[\s\S]*revoke all on function public\.approve_project_cost_budget_v1\(uuid\) from public,anon[\s\S]*grant execute on function public\.approve_project_cost_budget_v1\(uuid\) to authenticated/i,
  );
});

test("Estimator persistence stays review-first, reconciled and idempotent", () => {
  assert.match(rpc, /Only an MD can stage an Estimator budget/);
  assert.match(rpc, /Internal budget must equal direct cost plus allowances/);
  assert.match(rpc, /Budget line total must equal reviewed direct cost/);
  assert.match(rpc, /Allowance detail total must equal reviewed allowance budget/);
  assert.match(rpc, /source_fingerprint=estimator_fingerprint/);
  assert.match(rpc, /'status','existing'/);
  assert.match(rpc, /A newer Estimator version is already linked/);
  assert.match(rpc, /Only a draft budget can be approved/);
  assert.match(rpc, /status='superseded'/);
  assert.doesNotMatch(rpc, /update\s+public\.projects\s+set\s+contract_value/i);
});
