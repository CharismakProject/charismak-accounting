import test from "node:test";
import assert from "node:assert/strict";
import { matchStatementAccount, suggestAccountName } from "../lib/statement-account-match.ts";

const accounts = [
  { id: "uba", name: "UBA Business · 1027072467" },
  { id: "opay", name: "OPay Site Wallet" },
  { id: "access", name: "Access Bank · 0724644272" },
];

test("matches an account by bank name in the statement filename", () => {
  assert.equal(matchStatementAccount("UBA_statement_August_2026.xlsx", accounts), "uba");
  assert.equal(matchStatementAccount("opay_transactions.csv", accounts), "opay");
});

test("matches an account by account-number suffix", () => {
  assert.equal(matchStatementAccount("Statement_0724644272.xlsx", accounts), "access");
});

test("does not guess when several accounts are possible", () => {
  assert.equal(matchStatementAccount("company_statement_august.xlsx", accounts), null);
});

test("a single existing account is selected automatically", () => {
  assert.equal(matchStatementAccount("statement.xlsx", [accounts[0]]), "uba");
});

test("suggests a simple account name from known bank filename", () => {
  assert.equal(suggestAccountName("OPay Statement Sep.csv"), "OPay");
  assert.equal(suggestAccountName("Access_bank_statement.xlsx"), "Access Bank");
});
