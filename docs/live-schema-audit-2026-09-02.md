# Live Accounting Schema Audit — 2 September 2026

## Purpose

This audit records the schema actually present in the connected **Charismak Construction Accounting** Supabase project before the Estimator → Accounting project-cost bridge is applied.

It exists because the current repository application and the connected live database are not on the same generation of the product. The database contains real operating records, so recovery must be additive and non-destructive.

## Verified live database baseline

The connected Supabase project currently exposes these public base tables:

- `categories`
- `companies`
- `company_members`
- `contacts`
- `financial_accounts`
- `import_batches`
- `import_rows`
- `journal_entries`
- `journal_lines`
- `profiles`
- `project_assignments`
- `projects`
- `transaction_revisions`
- `transactions`

Verified public views:

- `account_recorded_balances`
- `company_financial_positions`
- `project_financial_positions`

All verified public base tables have RLS enabled.

The live migration history is a clean 23-August sequence beginning with `core_database_helpers` and ending, at audit time, with `project_details_import_matching`.

## Important live access model

The live membership table is `company_members`, not `company_memberships`.

Live company roles are:

- `md`
- `accountant`
- `pm`

`private.has_project_access(project_id)` grants:

- MD access to company projects;
- Accountant access to company projects;
- PM access only when an active `project_assignments` row exists.

The live `project_assignments` table has no `can_view_cost` column. Therefore new internal project-cost budgets must not inherit ordinary PM project visibility by default.

## Verified live project model

The live `projects` table currently includes, among other fields:

- `id`
- `company_id`
- `project_code`
- `name`
- `location`
- `status`
- `reported_progress`
- `client_name`
- `import_keywords`
- `project_type`
- `contract_value`
- `start_date`
- `expected_end_date`
- `description`

It does **not** currently contain `internal_cost_budget` or the broader commercial/project fields referenced by the repository UI.

The live `transactions` table is also lean and does not yet contain a construction cost code.

## Verified repository/runtime expectations that are ahead of live schema

Current repository server actions reference a later product model, including examples such as:

- `company_memberships`
- `clients`
- `project_relationships`
- `intake_batches`
- `source_documents`
- `intake_items`
- `project_financial_summaries`
- project fields such as `client_id`, `site_address`, `internal_cost_budget`, `progress_percent`, `external_reference`, `aliases`, `notes`, `project_image_path`, `updated_by`
- manual-accounting RPCs such as `post_manual_transaction_atomic` and `reverse_manual_transaction_atomic`
- approval tables such as `approval_requests` and `approval_actions`
- `user_interface_preferences`

These objects are not part of the verified connected live baseline at audit time.

## Consequence

A successful TypeScript/Next.js build does not prove runtime database compatibility. The application can compile while later-generation queries fail when executed against the lean live database.

Therefore the Estimator integration must not be allowed to mask or worsen this drift.

## Recovery rule

Preserve the populated live database. Do not reset, replay the old repository migration chain blindly, or replace the current schema with an assumed historical schema.

Bring the database forward in deliberate compatibility phases, validating existing rows and RLS after each phase.

## Proposed compatibility phases

### Phase A — Identity and workspace compatibility

Resolve the naming/model split between:

- live `company_members`; and
- repository `company_memberships` expectations.

Choose one canonical membership model and provide a controlled compatibility path before changing every application surface.

Do not introduce duplicate company membership truth.

### Phase B — Project commercial foundation

Add only the project/commercial structures required by the currently intended product, while preserving live projects.

At minimum reconcile:

- client relationship/reference model;
- internal project budget storage;
- project progress and forecast fields;
- source-document relationship;
- project financial summary/forecast model.

Internal budget/profit data must remain restricted to authorised cost roles.

### Phase C — Transaction intelligence and manual posting

Reconcile the current live `transactions`/journal model with the repository's later canonical/manual transaction model.

Do not create two parallel accounting ledgers.

The target must preserve:

- one accounting event per real transaction;
- balanced journals;
- reversible history;
- idempotent manual posting;
- existing imported transaction history.

### Phase D — Intake and document intelligence

Add or reconcile the repository's universal-intake structures only after the core project and transaction identity model is stable.

Uploaded BOQs, invoices, statements and evidence remain review-first and must not silently create duplicate accounting events.

### Phase E — Approval/commercial modules

Add approvals, commitments, AR/AP, reconciliation, WIP and other advanced modules only after their dependencies exist on the current baseline and rollback QA passes.

### Phase F — Estimator project-cost bridge

Apply the Estimator bridge after Phases A–B have established stable project identity and protected internal-cost storage.

The bridge consists of:

- shared construction cost codes;
- idempotent Estimator source links;
- versioned internal project budgets;
- BOQ budget lines;
- contingency/reviewed budget allowances;
- optional cost-code mapping on actual transactions.

The current draft is `supabase/drafts/project_cost_bridge_v1.sql` and must remain unapplied until the live compatibility path is approved and tested.

## Estimator/Accounting invariants

1. One construction job eventually has one canonical Accounting project UUID.
2. Estimator source IDs are references, not a second accounting project identity.
3. Contract value, direct cost, contingency, overhead, profit and VAT remain separate concepts.
4. Internal project budget is not exposed merely because a PM can access a project.
5. Contingency is a budget allowance/reserve, not disguised as a trade cost code.
6. AI suggestions never become financial truth without the required deterministic validation/review step.
7. Existing live business records are never deleted or rewritten merely to make a migration easier.

## Current safe state

- Estimator hand-off code is isolated on its own branch/PR.
- Accounting bridge code is isolated on its own branch/PR.
- No production deployment has been requested.
- No project-cost bridge DDL has been applied to the live Accounting database.
- The connected live database has only been read for this audit.
