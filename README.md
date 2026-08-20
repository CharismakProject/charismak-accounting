# Charismak Accounting

Construction finance, cost-control, treasury and project intelligence for small and medium construction companies.

## Current stage

Active web product with a native Expo mobile application foundation. Both clients share Supabase authentication, permissions, accounting records, document intelligence and audit history.

Core product principles:

- **Track the truth.**
- A contractor should be useful in the app within five minutes without accounting training.
- If Charismak can infer something safely, it should not ask the user to classify it again.
- Everyday construction finance stays simple; advanced accounting remains available by role.
- Every company can upload its own logo, letterhead, contact details and colours so shared reports carry the contractor's brand.

The product uses one shared system with four primary interface families:

- MD / Owner
- Accountant / CFO
- Project Director
- Project / Construction Manager

Sub-positions inherit the interface family of the relevant major position, while permissions determine actual access.

## Product editions

The self-serve Standard edition is designed for small and medium construction companies, including multi-project finance, statements, project documents, budgets, commitments, approvals, treasury, role-based access and reports.

Company branding is included in Standard: owners set it during onboarding or in Company Branding, and printable project reports use that identity without visible Charismak report branding.

The shared data and permissions model remains capable of supporting large projects. Large-company requirements such as multi-subsidiary consolidation, SSO, ERP integrations, regional controls and bespoke approval matrices are enabled only through a Custom Enterprise edition so they do not complicate the standard experience.

## Development

The web application is deployed through Vercel. The native app is in `mobile/` and uses Expo/React Native; it is not a WebView.

See `docs/product-simplification-v2.md` and `docs/product-editions.md` for the current product rules.
