# Charismak App Shared Project Core V1

## Product boundary

Charismak App is a separate construction-software product from the public Charismak website. The public website can offer lightweight estimating/content and link into the App, but it is not the application runtime.

The App's primary product areas are:

- Home
- Estimate
- Projects
- Money
- More (Market, Ask Charismak, settings and supporting tools)

Accounting remains the Money engine inside the App rather than the identity of the whole product.

## Core financial rule

**Estimate is authority for Expected Cost. Money is authority for Actual Money. Project connects them.**

Keep these concepts separate:

- BOQ/client price
- direct construction cost
- contingency/reserve
- internal approved cost budget
- contract value/revenue
- actual cost / actual paid cost
- unpaid commitments
- profit/deficit

Profit, VAT and commercial markups must never silently become internal project cost. The original/base contract value remains a commercial snapshot and must not be substituted for the internal cost budget. Actual cost comes only from confirmed Money records; it is not inferred from the Estimate or Project budget.

## BOQ V1 structure

Every imported or created bill must preserve:

**Section → Item → Quantity → Material Breakdown**

The quantity is an interactive drilldown. When a reviewed material recipe is available, selecting a quantity shows the materials, base quantities, waste/allowances and calculation assumptions attached to that exact BOQ item.

Reverse traceability is also required: a grouped material total must retain the BOQ item IDs/sections that contributed to it.

## Flexible spreadsheet import

BOQ import must not depend on one fixed heading name or order. The parser maps common variants for:

- serial/item number
- description/particulars/scope
- quantity
- unit/UOM
- rate/unit price
- amount/total/value

Priced and unpriced BOQs are both valid. Multi-sheet workbooks and section headings should be preserved. Totals/subtotals are summary rows, not construction items.

## BOQ Review Intelligence

Review suggestions are non-authoritative. Charismak can suggest:

- cost group (01–20)
- material-recipe family
- supply responsibility
- confidence and reasons

The user confirms or corrects the meaning before it becomes authoritative.

Cost classification and material-recipe classification are separate. Concrete, reinforcement and formwork share cost group 03 but use different material logic.

Client-supplied, labour-only, specialist and unknown items must remain distinguishable.

## Rate Engine V1

The Rate Engine carries three separate concepts:

1. imported/user rate
2. Charismak reference range (when reviewed observations exist)
3. selected working rate

Rules:

- imported rate is the default working rate until deliberately changed;
- an unpriced BOQ remains unpriced until a rate is deliberately selected or entered;
- Charismak reference data can warn but cannot overwrite the user's working rate;
- zero is a valid working rate for no-charge/client-supplied situations;
- changing working rate recalculates line amount and working direct total;
- reference observations retain location, date, source and confidence.

No current market price should be hard-coded into application logic.

## BOQ → Materials V1

Material calculations are deterministic and review-first. They require a confirmed recipe family and supply responsibility.

### Calculable in V1

**Blockwork (225mm / 150mm / generic)**
- measured in area;
- 10 blocks/m²;
- 5% block waste;
- 0.0015m³ wet mortar per block;
- 10% mortar allowance;
- 1:6 cement:sand mortar;
- dry-volume factor 1.33;
- 50kg cement bag and 1440kg/m³ cement bulk-density assumption.

**Plastering**
- measured in area;
- 12mm average thickness;
- 1:4 cement:sand mix;
- 10% wet-mortar allowance;
- dry-volume factor 1.33.

**Screeding**
- measured in area;
- 25mm average thickness;
- 1:4 cement:sand mix;
- 10% wet-mortar allowance;
- dry-volume factor 1.33.

**Floor/wall tiling**
- finish area + 5% cutting/waste allowance;
- adhesive and grout remain parameter-required until tile format/product is confirmed.

**Measured reinforcement**
- accepts kg/tonnes;
- converts tonnes to kg;
- 5% steel waste;
- binding wire at 1.5% of measured reinforcement.

**Direct-supply items**
- only when contractor supply is confirmed;
- BOQ quantity is used directly with no hidden conversion.

### Excluded from contractor material totals

- client-supplied lines;
- labour/installation-only lines;
- items explicitly marked no material recipe required.

### Parameter-required in V1

Charismak must not invent materials for these without specification inputs:

- concrete grade/mix or ready-mix basis;
- formwork system/reuse basis;
- painting coats/coverage/product;
- roofing build-up/profile/accessories;
- ceiling system/grid/board specification;
- plumbing and electrical assemblies/accessories;
- generic external/specialist works.

Unknown or incompatible units remain `needs_review` instead of being coerced.

## Material traceability

Material summary rows preserve source BOQ item references. Therefore:

- Quantity → materials works at item level;
- Material total → contributing BOQ lines works at summary level.

This traceability must survive later persistence/export work.

## Project conversion contract

A reviewed estimate may later create or update a Project cost baseline, but this is a deliberate user action. The persistence bridge must remain versioned, idempotent and review-first.

A repeated source estimate/project import must not create a duplicate Accounting project; the source link and reviewed fingerprint are the idempotency authority.

A source estimate/BOQ should not automatically create transactions or actual spend. No live Estimator or Accounting business records are changed by the shared-core review/staging workflow.

## Budget vs Actual

Project cost position should combine:

- approved budget lines/allowances
- actual transactions
- unpaid commitments
- unclassified actuals

Paid commitments must not be double counted with actuals.

Statuses include within budget, at risk, over budget and not budgeted.

## Progress Valuation V1

Progress Valuation measures physical completion against the **approved internal direct-work BOQ/budget**, not against the client selling price.

Rules:

- every approved budget line carries a reviewed physical completion percentage;
- where a reliable completed quantity and approved quantity exist, progress may be derived from `completed quantity ÷ approved quantity`;
- the overall project percentage is value-weighted: `total Earned Work Value ÷ approved Direct Work budget`;
- Earned Work Value is `approved internal line value × reviewed physical progress`;
- contingency/reserve is excluded from the physical-progress denominator because it is not a work item;
- Work Outstanding is approved Direct Work less Earned Work Value; it is **not** Cost-to-Complete;
- Earned Work Value is an internal control measure; it is **not** a client valuation, invoice or receivable;
- posted project expenses remain Money actuals and are never created or edited by Progress Valuation;
- Cost-position variance is `Earned Work Value − Actual Spend`;
- spend ahead of physical progress is a review signal and may reflect advance procurement/mobilisation rather than waste;
- unclassified actual spend still counts at project level but is not forced into a trade progress row;
- approved progress snapshots are versioned and the prior approved version is superseded rather than edited in place;
- V1 blocks a silent reduction below the previous approved line progress; a deliberate correction/reversal requires a later reviewed correction workflow;
- Progress remains inside each Project workspace, not a separate global App module.

Progress persistence has its own feature gate:

- web/PWA: `PROJECT_PROGRESS_VALUATION_ENABLED`
- native mobile: `EXPO_PUBLIC_PROJECT_PROGRESS_VALUATION_ENABLED`

These flags additionally require the core project-cost bridge flag. They remain off until the reviewed database drafts are explicitly migrated.

## PM Field Progress → MD Review V1

An assigned Project Manager may submit an evidence-backed field report, but a PM submission is **not authoritative project progress** until MD approval.

Rules:

- only an active PM assignment for that Project can submit a field report;
- PM access is deliberately non-financial: the PM receives work description, cost group, unit, approved quantity, prior approved progress and prior completed quantity only;
- PM screens must not expose internal rate, budget amount, Earned Work Value, profit, forecast or Money transactions;
- the report contains the complete approved work-item snapshot, so unchanged items carry the last approved progress rather than disappearing from the valuation basis;
- completed quantities cannot exceed the approved BOQ quantity and reported progress cannot silently reduce below the last approved position;
- each report requires 1–8 site photos or PDFs; JPG, PNG, WebP and PDF are accepted, maximum 10 MB per file;
- evidence belongs to a private project-progress bucket and is attached to the field submission, not to Money or the BOQ baseline;
- only MD may Approve, Request Changes or Decline a submitted PM field report;
- Request Changes and Decline never alter authoritative Progress Valuation;
- MD approval reuses the authoritative Progress Valuation RPC in the same database transaction, so there is no second progress truth;
- if the approved Budget Baseline changes after the PM submits, the pending report cannot be approved and a fresh report is required;
- PM reports and MD decisions remain versioned/auditable;
- evidence URLs are private/signed for authorized review rather than public files.

Field review has a separate feature gate and also requires both project-cost core and Progress Valuation:

- web/PWA: `PROJECT_PROGRESS_FIELD_REVIEW_ENABLED`
- native mobile: `EXPO_PUBLIC_PROJECT_PROGRESS_FIELD_REVIEW_ENABLED`

## Access and live-schema safety

The connected live Accounting Supabase contains real records and is authoritative for current production compatibility.

- `company_members` remains the canonical live membership model.
- `project_assignments` remains the authority for whether a PM currently has access to a Project.
- Do not introduce a duplicate membership truth merely to make newer repository screens compile.
- Internal budget visibility must respect MD/accountant vs PM access.
- Project-cost bridge DDL/RPC files remain drafts until the prerequisite live-schema compatibility phases are completed and explicitly approved.
- Preview/review BOQ, rate, material, progress and PM field-review features do not post to Accounting Money.

## Deployment rule

No production merge, production Vercel deployment, live Supabase migration, Edge Function deployment or production APK publication is implied by development on `shared-project-core-v1`.
