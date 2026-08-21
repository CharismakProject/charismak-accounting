# Supabase schema source of truth

As of 21 August 2026, the active Charismak Accounting Supabase project is the authoritative database schema during the QA/reset phase.

The earlier repository migration chain was assembled incrementally while the product was being built and did not fully reproduce the live database from zero. It therefore produced false local-replay failures and has been retired from this branch.

## QA rule

- Database/accounting QA is performed against the active Supabase schema using synthetic test companies, projects, accounts and transactions inside database transactions that end with `ROLLBACK` unless a test explicitly requires persistence.
- Real business data must not be mutated by synthetic QA.
- Application regression tests, TypeScript checks and production builds continue to run in GitHub CI.
- New schema changes must be applied deliberately to Supabase and recorded in the live migration history. A clean reproducible baseline will be generated from the authoritative schema before the final business-data reset.

## Accounting posting rule

Future confirmed/postable canonical transactions create balanced journal entries automatically. Project funding is posted to Client Advances / Unearned Revenue rather than being treated as profit merely because cash was received. Company financing is a liability, personal/non-business withdrawals are receivables rather than operating expenses, company overhead remains separate from direct project cost, and manual internal transfers create one balanced transfer journal without duplicating revenue or expense.

Commercial documents are review-first. Invoice, quotation, BOQ and variation extraction may populate document intelligence, but they must not automatically change contract value, revenue, payable, receivable or project cost until their commercial direction is confirmed. Receipts, bills and funding documents may be attached automatically as evidence without creating a second accounting event.

## Seven-module accounting expansion

The live Supabase schema now includes the first production foundation for all seven accounting priorities:

1. **Visual financial evidence pipeline** — image/scanned documents are preserved in `visual_document_reviews`; uploads enter an explicit review queue instead of being silently guessed or posted.
2. **Accounts Receivable and Accounts Payable** — `accounts_receivable`, `accounts_payable` and `business_parties` support client invoices, supplier bills, due dates, partial settlements, retention and tax fields.
3. **Evidence/payment matching** — `payment_match_suggestions`, `document_evidence_links` and atomic settlement RPCs connect statement rows to open invoices/bills so a bank payment is not counted as a second revenue/expense event.
4. **Bank reconciliation** — `bank_reconciliations` and `bank_reconciliation_items` compare statement/account balances with the posted ledger and retain unresolved differences.
5. **Construction WIP and revenue recognition** — `wip_snapshots` calculates cost-to-cost WIP from incurred ledger cost plus Cost-to-Complete and can post reviewed contract revenue to Contract Asset / Contract Billings / Contract Revenue accounts.
6. **Core financial statements** — `v_general_ledger`, `v_trial_balance`, `v_profit_and_loss` and `v_balance_sheet` are derived from posted double-entry journals.
7. **Period controls** — `accounting_periods` plus journal guards block posting into closed/locked periods and allow owner-controlled reopening.

Live migrations applied for this expansion include `accounting_core_modules_phase_one`, `fix_wip_progress_column`, `fix_wip_ledger_cost_and_previous_revenue`, `payment_match_suggestions_and_atomic_confirmation`, and `auto_queue_image_documents_for_visual_review`.

Synthetic rollback QA passed for AP, AR, AP/AR statement settlement, suggested payment matching, bank reconciliation, incurred-cost WIP, cost-to-cost revenue posting, P&L/Balance Sheet/Trial Balance population, period locking and automatic image-document queuing.

## Reset rule

Authentication, the company workspace, role/permission templates, branding configuration and database schema are infrastructure and are not part of the business-data reset. Projects, accounts, statements, transactions, approvals, documents and other operating records may be cleared only as an explicit reset operation.

Before re-enabling fresh-install migration replay, create and validate one clean schema baseline from the authoritative Supabase project, then keep only forward migrations after that baseline.
