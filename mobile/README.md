# Charismak Accounting Mobile

Native Expo/React Native client for the Charismak Accounting platform.

This is **not a WebView**. It uses the same Supabase authentication, projects, accounting records, permissions, approvals, audit rules and document-intelligence backend as the web app, with a mobile-first interface.

## Core mobile navigation

- Home
- Projects
- Add
- Approvals
- More

## Current native scope

- Supabase login/session persistence
- Role-aware Home dashboard with live financial data and chart
- Project portfolio and native project workspace
- Universal mixed-document intake (statements, invoices, BOQs, receipts, Word/Excel/PDF/images)
- Duplicate protection using SHA-256
- Approval request/decision workflow
- MD multi-role switching through More

## Environment

Copy `.env.example` to `.env` and provide the public Supabase URL and publishable key. Never place service-role keys or other server secrets in the mobile app.

## Development

```bash
npm install
npm run typecheck
npm start
```

Android/iOS packaging should be performed through an approved Expo/EAS build configuration after the native validation workflow is green.
