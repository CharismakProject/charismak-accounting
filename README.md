# Charismak App

Mobile-first construction operating app for estimating, BOQs, project control, construction money, procurement intelligence and AI-assisted project questions.

## Product boundary

This repository is the working codebase for the **Charismak App**. It is not the corporate website.

- `www.charismakproject.com` remains the public company website, project portfolio, blog, services and lightweight/public estimator.
- The Charismak App is the logged-in construction product: Estimate, Projects, Money, Market and Ask Charismak.
- Accounting is a major module inside the App under **Money**; it remains the source of financial truth for transactions, journals, approvals, project funding and reporting.
- Estimating/BOQ logic produces expected cost and approved budget baselines. It must never silently overwrite accounting truth.

## Main app areas

1. **Home** — company/project standing and next actions.
2. **Estimate** — quick estimate, build estimate, drawing/BOQ intake, BOQ Studio and materials schedules.
3. **Projects** — active jobs, budget, progress, documents and team.
4. **Money** — funds, transactions, commitments, approvals, budget-vs-actual and profitability.
5. **More** — Market, Ask Charismak, people/access, branding, audit and settings while those areas mature into first-class modules.

## Release intake

The accounting/document-intelligence foundation supports Excel (XLSX/XLS), Word (DOCX), PDF including scanned PDF OCR fallback, and JPG/JPEG images. Exact document duplicates are checked using a server-side SHA-256 hash before analysis, and statement transaction fingerprints include value date and running balance to reduce duplicate-posting errors.

## Safety rule

The website and App are separate product surfaces. App development must not replace or redesign the public website estimator unless a website change is explicitly requested.
