import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

const root=new URL("../",import.meta.url);
const read=(path)=>readFileSync(new URL(path,root),"utf8");
const tabs=read("mobile/app/(tabs)/_layout.tsx");
const home=read("mobile/app/(tabs)/index.tsx");
const money=read("mobile/app/(tabs)/money.tsx");
const projects=read("mobile/app/(tabs)/projects.tsx");
const project=read("mobile/app/project/[id].tsx");
const reports=read("mobile/app/(tabs)/reports.tsx");
const account=read("mobile/app/new-account.tsx");
const transaction=read("mobile/app/new-transaction.tsx");
const appJson=JSON.parse(read("mobile/app.json"));

test("accounting-only Android navigation removes Estimate from primary product",()=>{
  for(const label of ["Home","Money","Projects","Reports","More"]) assert.match(tabs,new RegExp(`title:\"${label}\"`));
  assert.match(tabs,/name=\"estimate\" options=\{\{href:null\}\}/);
  assert.doesNotMatch(home,/Upload BOQ/);
  assert.doesNotMatch(projects,/Upload BOQ/);
  assert.doesNotMatch(project,/Upload BOQ/);
});

test("mobile money posting uses the atomic accounting RPC instead of direct transaction writes",()=>{
  assert.match(transaction,/post_manual_transaction_atomic/);
  for(const arg of ["request_key","target_company","target_account","target_project","entry_kind","entry_amount","entry_narration"]) assert.match(transaction,new RegExp(arg));
  assert.doesNotMatch(transaction,/from\(\"transactions\"\)\.insert/);
  for(const kind of ["project_funding","company_project_funding","company_income","company_financing","project_expense","project_advance","reimbursement","company_expense"]) assert.match(transaction,new RegExp(kind));
});

test("account setup keeps opening balance separate from income",()=>{
  assert.match(account,/financial_accounts/);
  assert.match(account,/Opening balance is not income/);
  assert.match(account,/bank/);
  assert.match(account,/fintech_wallet/);
  assert.match(account,/cash/);
  assert.match(account,/site_imprest/);
});

test("construction accounting surfaces separate cash position from profit",()=>{
  assert.match(home,/Money in this month/);
  assert.match(home,/Money out this month/);
  assert.match(money,/Project cash position/);
  assert.match(project,/Cash position is not profit/);
  assert.match(reports,/Cash ≠ profit/);
});

test("reports read posted ledger statements and open receivables/payables",()=>{
  assert.match(reports,/v_profit_and_loss/);
  assert.match(reports,/v_balance_sheet/);
  assert.match(reports,/accounts_receivable/);
  assert.match(reports,/accounts_payable/);
  assert.match(reports,/project_financial_positions/);
});

test("internal APK is versioned as Charismak Accounting 0.2.2",()=>{
  assert.equal(appJson.expo.name,"Charismak Accounting");
  assert.equal(appJson.expo.version,"0.2.2");
  assert.equal(appJson.expo.android.versionCode,7);
  assert.equal(appJson.expo.android.package,"com.charismakproject.app");
});
