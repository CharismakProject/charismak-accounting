# Supabase schema source of truth

As of 21 August 2026, the active Charismak Accounting Supabase project is the authoritative database schema during the QA/reset phase.

The earlier repository migration chain was assembled incrementally while the product was being built and did not fully reproduce the live database from zero. It therefore produced false local-replay failures and has been retired from this branch.

## QA rule

- Database/accounting QA is performed against the active Supabase schema using synthetic test companies, projects, accounts and transactions inside database transactions that end with `ROLLBACK` unless a test explicitly requires persistence.
- Real business data must not be mutated by synthetic QA.
- Application regression tests, TypeScript checks and production builds continue to run in GitHub CI.
- New schema changes must be applied deliberately to Supabase and recorded as clean forward migrations after this reset.

## Reset rule

Authentication, the company workspace, role/permission templates, branding configuration and database schema are infrastructure and are not part of the business-data reset. Projects, accounts, statements, transactions, approvals, documents and other operating records may be cleared only as an explicit reset operation.

Before re-enabling fresh-install migration replay, create and validate one clean schema baseline from the authoritative Supabase project, then keep only forward migrations after that baseline.
