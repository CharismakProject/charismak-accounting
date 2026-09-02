# Shared Project Core V1

## Goal

Create one stable commercial bridge from Estimator to Construction Accounting without merging the two Supabase projects yet.

Estimator remains responsible for expected cost: estimates, BOQ quantities, rate build-ups, materials and price snapshots.
Accounting remains responsible for actual financial truth: transactions, commitments, AR/AP, journals, reconciliation, WIP and financial reporting.

## Canonical project rule

A construction job must eventually have one canonical project UUID in the Accounting/shared core. Estimator records may retain their current text IDs during migration, but must gain a bridge reference to the canonical project rather than creating a second independent project identity.

The bridge must be idempotent: importing or linking the same estimator project twice must not create a duplicate accounting project.

## Commercial separation

Never collapse these values into one field:

- original/base contract value
- approved variations
- identified but unapproved commercial value
- client invoices
- internal cost budget
- commitments
- actual cost
- cost to complete
- forecast final cost

An uploaded BOQ is review-first. Parsing and classification may happen automatically, but commercial/accounting values change only after the document direction and project relationship are confirmed.

## Cost-code contract

`lib/project-cost/cost-codes.ts` is the first cross-product contract.

Every measurable BOQ/estimate item should map to a cost code. The same code is then used by commitments, bills, transactions and budget-vs-actual reporting.

Initial top-level groups:

01 Preliminaries
02 Substructure
03 Concrete & Reinforcement
04 Blockwork & Masonry
05 Structural Steel
06 Roofing
07 Doors
08 Windows & Glazing
09 Plastering & Screeding
10 Floor Finishes
11 Wall Finishes
12 Ceilings
13 Painting & Decoration
14 Joinery & Fixtures
15 Plumbing & Sanitary
16 Electrical
17 Mechanical & HVAC
18 External Works
19 Plant, Equipment & Specialist Works
20 Professional, Statutory & Other

Top-level codes are stable identifiers. More detailed child codes can be introduced without changing these parent codes.

## Estimator bridge payload

The initial bridge should accept a reviewed estimator snapshot shaped conceptually as:

```ts
{
  source: "charismak_estimator",
  sourceProjectId: string,
  sourceEstimateId?: string,
  projectName: string,
  currency: "NGN",
  contractValue?: number,
  internalCostBudget: number,
  priceBasisAt?: string,
  lines: Array<{
    sourceLineId: string,
    description: string,
    unit?: string,
    quantity?: number,
    rate?: number,
    amount: number,
    costCode: string,
    supplyResponsibility?: "contractor" | "client" | "unknown"
  }>
}
```

The Accounting/shared core stores a source fingerprint/reference so repeated imports update or version the same source relationship instead of duplicating the project.

## Budget-vs-actual rule

For every cost code, reporting must be able to show:

- approved internal budget
- committed cost
- paid/actual cost
- unpaid commitment
- cost to complete
- forecast final cost
- variance to budget

Cash spent alone is not the project's total exposure.

## Implementation order

1. Freeze the shared cost-code contract.
2. Add a non-destructive estimator-project bridge to Accounting.
3. Add structured internal project budget headers and budget lines.
4. Map commitments and canonical transactions to compatible cost codes.
5. Import one reviewed Estimator BOQ/budget snapshot end-to-end.
6. Build budget-vs-actual aggregation.
7. Only after successful QA, migrate/retire duplicate Estimator project identities.

## Safety

No live Estimator or Accounting business records are changed by this first step. Database migration follows only after the live Accounting schema is readable and the proposed keys/foreign keys can be checked against the authoritative schema.
