# Live Schema Audit — 2026-09-02

## Authority

The connected live Accounting Supabase is authoritative for current production compatibility. The repository contains later-generation objects that are not all present in the live database, so repository migrations must not be replayed blindly.

## Live database summary

The live populated model includes the lean Accounting foundation such as:

- companies
- company_members
- profiles
- projects
- project_assignments
- transactions
- transaction_revisions
- financial_accounts
- contacts
- categories
- import_batches / import_rows
- journal_entries / journal_lines
- financial-position views

RLS is enabled on the base tables.

`company_members` is the canonical membership truth. Do not create a second membership model merely to satisfy newer repository screens.

## Important repository/live drift

Later repository code references objects such as:

- company_memberships
- clients
- project_relationships
- intake/source-document structures
- advanced project fields
- newer access/audit/manual-posting RPCs

A compatibility alias for one missing table is not a complete fix because dependent RPCs and pages may still be absent.

## Project-cost bridge state

The live database does not currently contain the new project-cost bridge objects, including:

- construction cost-code persistence for transactions
- project_cost_budgets and related lines/allowances
- Estimator/BOQ staging RPCs

The bridge SQL remains draft/review work. It was QA-tested transactionally using BEGIN/ROLLBACK and should stay unapplied until prerequisite compatibility work is complete and explicitly approved.

## Compatibility phases

A. Identity/workspace compatibility

B. Project commercial foundation

C. Transaction/manual posting compatibility

D. Intake/document intelligence compatibility

E. Approvals/commercial modules

F. Estimate/Project cost bridge

The Estimate product can continue developing deterministic preview/review logic before Phase F because those calculations do not require live database writes.

Current BOQ work—spreadsheet parsing, review suggestions, Rate Engine and BOQ → Materials—is preview-only on the development branch. Material recipe calculations do not create project budgets, transactions or commitments.

## Production rule

Do not apply bridge migrations, enable bridge persistence, deploy preview Edge Functions, or merge/deploy the App to production merely because application CI is green. Live-schema compatibility and release approval are separate gates.
