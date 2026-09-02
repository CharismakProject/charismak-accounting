# Shared Project Core V1

## Goal

Create one stable commercial bridge from Estimate to Construction Accounting inside **Charismak App**, while keeping the public Charismak website separate.

Estimate remains responsible for expected cost: estimates, BOQ quantities, rate build-ups, materials and price snapshots.
Money/Accounting remains responsible for actual financial truth: transactions, commitments, journals, reconciliation and financial reporting.

## Canonical project rule

A construction job must eventually have one canonical project UUID in the Accounting/shared core. Estimate records may retain their current source IDs during migration, but must gain a bridge reference to the canonical project rather than creating a second independent project identity.

The bridge must be idempotent: importing or linking the same estimate twice must not create a duplicate accounting project.

## Sectioned BOQ rule

A BOQ is never flattened into one undifferentiated list.

Every bill keeps a hierarchy:

`BOQ → Section → Item → Quantity → Material Breakdown`

Examples of sections include Substructure, Concrete & Reinforcement, Blockwork & Masonry, Roofing, Finishes, Plumbing and Electrical. Imported source headings should remain sections wherever possible. Charismak may suggest a missing or cleaner section, but the user can review the classification and the original source relationship must remain traceable.

The **Quantity** is an interactive project-cost object, not just display text. Selecting a quantity must expose the material breakdown for that exact BOQ item, including:

- material name;
- calculated base quantity;
- waste allowance;
- final material quantity;
- calculation/recipe source;
- assumptions that materially affect the result;
- review state when a recipe has not yet been confirmed.

The reverse trace must also work: a material summary such as total Cement must retain the contributing BOQ section/item references so the user can see which measured quantities produced the total.

Material recipes are deterministic after review. AI may classify an item or suggest a recipe, but it must not silently invent authoritative material quantities.

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

### Estimate total mapping rule

The Estimate module deliberately carries several commercial layers. They are not interchangeable Accounting values:

- `directCost` — priced work-item cost before commercial adjustments
- `contingency` — separately identified risk allowance
- `overhead` — separately identified overhead/commercial allowance
- `profit` — selling margin, never project cost
- `discount` — commercial adjustment
- `subTotalBeforeTax` — commercial total before VAT
- `vat` — tax, never project cost
- `grandTotal` — commercial total including VAT

Therefore an Estimate never silently maps `grandTotal` to `internal_cost_budget`.

The review flow proposes two internal-cost candidates only:

1. direct cost; or
2. direct cost plus contingency.

An authorised reviewer may also enter an explicit internal budget. Overhead remains visible and separate because Money already tracks allocated company overhead separately from direct project cost.

Contract value is also an explicit commercial decision: before-tax total, VAT-inclusive grand total, an explicit approved amount, or unknown. Missing contract value remains `null`; it must not create a false project loss by pretending expected revenue is zero.

Only a **completed and fully priced** Estimate can be approved as an Accounting budget baseline.

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

## Estimate bridge payload

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

`lib/project-cost/from-estimator-bill.ts` converts a raw Estimator Bill shape into a review candidate first. It does not create accounting truth. The reviewer explicitly confirms cost basis, contract-value basis, cost codes and supply responsibility before `reviewed: true` can be produced.

`lib/project-cost/estimator-bridge.ts` then validates arithmetic, duplicate source line IDs, cost-code confirmation and budget totals. Suggested/heuristic cost codes are never authoritative.

`lib/project-cost/accounting-project-adapter.ts` converts only a ready reviewed snapshot into a persistence-free Accounting project seed. Missing commercial revenue and forecast profit remain unknown (`null`) rather than fabricating a loss.

The shared core stores a source fingerprint/reference so repeated imports update or version the same source relationship instead of duplicating the project.

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

1. Freeze the shared cost-code and sectioned-BOQ contracts.
2. Finish App foundation and Estimate workspace.
3. Build Upload BOQ (Excel first) into the sectioned BOQ structure.
4. Build BOQ review intelligence and bulk section/recipe confirmation.
5. Add the rate engine.
6. Expand BOQ → Materials using deterministic construction recipes.
7. Add estimate summary and PDF/Excel export.
8. Create Project from an approved estimate/budget baseline.
9. Map commitments and actual transactions to compatible cost codes.
10. Build Budget vs Actual and later Ask Charismak over the combined data.

## Safety

No live Estimate or Accounting business records are changed by this design work. Database migration follows only after the live Accounting schema and compatibility path have been verified. The public company website remains a separate product surface and is not replaced by this App.
