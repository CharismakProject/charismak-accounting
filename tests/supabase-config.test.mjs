import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const config = read("lib/supabase/config.ts");
const server = read("lib/supabase/server.ts");
const client = read("lib/supabase/client.ts");

test("Accounting Supabase clients require an explicit deployment environment", () => {
  assert.match(config, /NEXT_PUBLIC_SUPABASE_URL/);
  assert.match(config, /NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY/);
  assert.match(config, /is not configured/i);
  assert.doesNotMatch(config, /supabase\.co/);
  assert.doesNotMatch(config, /sb_publishable_/);
  assert.match(server, /getSupabasePublicConfig/);
  assert.match(client, /getSupabasePublicConfig/);
});

test("old Accounting backend fallback cannot silently return", () => {
  for (const source of [config, server, client]) {
    assert.doesNotMatch(source, /qezwpaeqbkoxrprohall/);
    assert.doesNotMatch(source, /FALLBACK_SUPABASE/);
  }
});
