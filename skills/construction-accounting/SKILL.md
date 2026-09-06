# Charismak Construction Accounting Skill

## Purpose
Use this skill when designing, reviewing or testing Charismak accounting features for contractors, construction companies and project-based businesses. It is grounded in recent 2026 construction-accounting/job-costing video research and the failures found in the current Charismak APK.

## Governing principle
**Track the truth with the least effort required from the user.**

Accounting truth and construction context are separate but connected:

- **Money truth:** account, date, amount, direction, category, party, evidence.
- **Project context:** which job the money belongs to, if any.
- **Commercial truth:** contract/budget/change/commitment/progress/WIP. This must never be inferred from cash alone.

## Weighted rules
Treat the first group as non-negotiable because it repeated most often across the reviewed sources.

### Weight A — non-negotiable
1. **Job-cost attribution:** every direct construction cost and relevant revenue must be attributable to a project/job. Company/general spending remains separate.
2. **Cash is not profit:** never infer profit from bank balance, client receipts or project funding position.
3. **Keep budget, actual, committed and forecast distinct:** do not overwrite or merge these concepts.
4. **Capture at source:** transaction entry on mobile must be faster than keeping a separate notebook/spreadsheet.
5. **Ledger first:** the accounting ledger is the financial source of truth; project dashboards derive from it.
6. **Readable field UX:** use large text, large touch targets, plain labels, minimal required fields and no unnecessary review loops.

### Weight B — high priority after core transactions work
7. **Frequent variance review:** project cost should be reviewable weekly/monthly so margin drift is visible before completion.
8. **Lean coding:** start with categories/cost codes people can reliably choose. More detail is optional.
9. **Labour attribution:** time/payroll should eventually flow to project/cost category without duplicate manual entry.
10. **Commitments precede cash:** POs/subcontract commitments eventually belong beside actual cost, but never masquerade as paid expense.
11. **WIP for fixed-price construction:** add WIP only after budget, actual cost and progress are trustworthy.
12. **Change control:** change orders must have explicit status and explicit effects on contract/budget.
13. **Retainage:** model separately from normal cash/receivables when introduced.

## Minimum data model
### Financial account
- id
- company/workspace
- name
- type: bank / wallet / cash
- currency
- active status

### Transaction
- id
- date
- type: money in / money out / transfer
- amount > 0
- source account
- destination account only for transfer
- title/description
- category (required for expense; optional/derived for income)
- project/job optional for general accounting, required when classified as direct project cost/funding
- party/contact optional
- evidence optional
- status and audit metadata

### Project/job
Keep V1 small:
- name
- location
- optional code
- optional client
- optional contract value
- status

Do not require BOQ, project type, budget, schedule, progress or aliases merely to create a project.

## V1 user language
Prefer:
- Money in
- Money out
- Transfer
- Account
- Category
- Project / Job
- Paid to / Received from
- Balance
- Received
- Spent
- Cash position

Avoid exposing internal terms such as canonical transaction, journal line, commercial position, WIP, ledger posting or classification unless the user enters a professional report or advanced construction area.

## V1 mobile flows
### Record money out
Required:
1. Amount
2. Account
3. Category
4. Description
Optional:
5. Project/job
6. Paid to
7. Date (defaults today)
8. Note/evidence

### Record money in
Required:
1. Amount
2. Account
3. Description
Optional:
4. Project/job
5. Received from
6. Date
7. Note/evidence

### Transfer
Required:
1. Amount
2. From account
3. To account
4. Date
Do not create income or expense from an internal transfer.

### Create project
Required:
1. Name
2. Location
Optional:
3. Code
4. Client

## Reporting rules
### Home
Show only trusted cash/accounting facts:
- total recorded account balance
- money in for selected period
- money out for selected period
- net cash movement
- recent transactions
- number of active projects/jobs

### Project
V1 may show:
- contract value if explicitly entered
- cash received
- cash spent
- funding/cash position = received - spent

Label this **cash position**, not profit.

### Basic reports
V1:
- money in vs money out by month
- spending by category
- account movement
- project cash received/spent/position

Do not call a cash-only project report a profitability report.

## Error and reconciliation rules
1. Never swallow the database error into only “Please try again.” Show a safe actionable explanation and retain technical detail for diagnostics.
2. Duplicate submission protection is mandatory for money writes.
3. Editing financial history must retain evidence/audit history; corrections beat silent overwrite.
4. Internal transfers must net to zero across company income/expense.
5. A reset must never delete authentication, profile, company/workspace or membership unless the user explicitly requests account deletion.
6. Every release must run a real-device smoke test against the same backend contract used by the APK.

## What to delete/hide in accounting-only V1
- Estimate tab
- BOQ upload/review/material logic from navigation
- procurement/marketplace
- project-cost bridge/forecast/payment-link screens
- field-progress/valuation screens
- approvals if their live backend contract is not proven
- treasury/people/branding/notifications/audit routes that target unavailable schema
- any button whose flow cannot complete end-to-end

Code may be archived outside the mobile route tree for future use, but unfinished routes should not remain discoverable in the accounting-only APK.

## Acceptance tests before APK handoff
1. Existing user sign-in reaches a valid workspace.
2. Fresh workspace can be created without manual database repair.
3. Home loads with zero data.
4. Financial account can be created or a clear empty-state path exists.
5. Project can be created.
6. Money-in can be recorded and appears exactly once.
7. Money-out can be recorded and appears exactly once.
8. Transfer moves balance between two accounts without changing total company income/expense.
9. Project-linked transactions update project received/spent/cash position correctly.
10. Company/general transaction does not require a construction project once the backend supports optional project context.
11. Error states are readable and actionable.
12. Text is comfortably readable on a normal Android phone; no core body text below 13sp, most body text 14–16sp, input/button text 15–16sp.
13. Logout/login preserves data.
14. Refresh/resume reproduces ledger figures exactly.
15. Automated checks, production build and exact APK package all pass; automated success alone is not considered functional proof.

## Scope discipline
When deciding whether to add something:
1. Delete unnecessary steps first.
2. Simplify the remaining workflow.
3. Optimize only after the simple workflow is correct.
4. Automate only after users can understand and verify the manual truth.

Estimating, bank-notification capture, WIP, commitments, retainage, progress valuation and construction-management depth are future layers, not prerequisites for a useful accounting V1.