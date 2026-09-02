# Charismak App

Charismak App is the construction operating product for estimating, projects and money management. It is intentionally separate from the public Charismak Project website.

## Product areas

- **Home** — company/project overview and next actions
- **Estimate** — BOQ import, review, rates, materials and estimating workflows
- **Projects** — project workspace and progress
- **Money** — Accounting, transactions, commitments, approvals and profitability
- **More** — Market, Ask Charismak and supporting settings/tools

The repository is still physically named `charismak-accounting` during the transition, but the application identity is **Charismak App** and Accounting is the Money module.

## Estimate V1 workflow in progress

The current review branch implements the foundation for:

1. Upload XLSX/XLS/CSV BOQ
2. Detect flexible headings and preserve sections
3. Review cost classification, material-recipe family and supply responsibility
4. Review imported/manual working rates
5. Calculate deterministic materials from confirmed supported recipes
6. Drill from a BOQ quantity to its materials
7. Drill from a material summary total back to contributing BOQ lines

Material calculations currently cover reviewed blockwork, plastering, screeding, finish-area tiling, measured reinforcement and contractor direct-supply items. Specification-dependent work such as concrete mixes, formwork systems, painting systems, roofing, ceilings and MEP remains parameter-required rather than guessed.

See `docs/shared-project-core-v1.md` for the full rules and explicit calculation assumptions.

## Development safety

The `shared-project-core-v1` branch and PR #26 are development/review work only.

No production merge, live Supabase migration, production Edge Function deployment, production Vercel deployment or production APK publication should occur without explicit authorization.

The connected Accounting database contains real records and must remain protected while repository/live-schema compatibility is reconciled incrementally.
