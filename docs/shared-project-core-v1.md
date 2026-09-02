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

### Estimator total mapping rule

The current Estimator deliberately carries several commercial layers. They are not interchangeable Accounting values:

- `directCost` — priced work-item cost before commercial adjustments
- `contingency` — separately identified risk allowance
- `overhead` — separately identified overhead/commercial allowance
- `profit` — selling margin, never project cost
- `discount` — commercial adjustment
- `subTotalBeforeTax` — commercial total before VAT
- `vat` — tax, never project cost
- `grandTotal` — commercial total including VAT

Therefore an Estimator bill never silently maps `grandTotal` to `internal_cost_budget`.

The review flow proposes two internal-cost candidates only:

1. direct cost; or
2. direct cost plus contingency.

An authorised reviewer may also enter an explicit internal budget. Overhead remains visible and separate because Accounting already tracks allocated company overhead separately from direct project cost.

Contract value is also an explicit commercial decision: before-tax total, VAT-inclusive grand total, an explicit approved amount, or unknown. Missing contract value remains `null`; it must not create a false project loss by pretending expected revenue is zero.

Only a **completed and fully priced** Estimator bill can be approved as an Accounting budget baseline.

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

The reviewed bridge accepts a snapshot shaped conceptually as:

```ts
{
  source: "charismak_estimator",
  sourceProjectId: string,
  sourceEstimateId?: string,
  sourceVersion: number,
  projectName: string,
  currency: "NGN",
  contractValue?: number,
  internalCostBudget: number,
  priceBasisAt?: string,
  reviewed: true,
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

`lib/project-cost/from-estimator-bill.ts` converts the current raw Estimator Bill shape into a review candidate first. It does not create accounting truth. The reviewer explicitly confirms cost basis, contract-value basis, cost codes and supply responsibility before `reviewed: true` can be produced.

`lib/project-cost/estimator-bridge.ts` then validates arithmetic, duplicate source line IDs, cost-code confirmation and budget totals. Suggested/heuristic cost codes are never authoritative.

`lib/project-cost/accounting-project-adapter.ts` converts only a ready reviewed snapshot into a persistence-free Accounting project seed. Missing commercial revenue and forecast profit remain unknown (`null`) rather than fabricating a loss.

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
2. Add the reviewed Estimator bridge and commercial-mapping guardrails.
3. Add a non-destructive estimator-project source link to Accounting.
4. Add structured internal project budget headers and budget lines.
5. Map commitments and canonical transactions to compatible cost codes.
6. Import one reviewed Estimator BOQ/budget snapshot end-to-end.
7. Build budget-vs-actual aggregation.
8. Only after successful QA, migrate/retire duplicate Estimator project identities.

## Safety

No live Estimator or Accounting business records are changed by this first step. Database migration follows only after the live Accounting schema is readable and the proposed keys/foreign keys and cost-visibility RLS rules can be checked against the authoritative schema.
