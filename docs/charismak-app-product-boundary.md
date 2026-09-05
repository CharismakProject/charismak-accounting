# Charismak App Product Boundary

## Website

`charismakproject.com` remains the public Charismak Project company website. It can provide company information, projects, blog/content, public price information and lightweight estimating entry points.

The public website is not the Charismak App and should not be replaced by the App's estimating workspace.

A public estimate may later offer **Continue in Charismak App**, but the detailed construction workflow belongs to the App.

## Charismak App

The App is the construction operating product. Its primary areas are:

- Home
- Estimate
- Projects
- Money
- More

### Estimate

The detailed estimate product includes:

- Quick Estimate
- Build Estimate
- Upload BOQ
- Upload Drawing
- Enter Quantities
- BOQ Studio
- Rate review
- Material schedules
- Estimate summary and export

BOQs follow the rule:

**Section → Item → Quantity → Materials**

The quantity is interactive. Reviewed recipes allow users to see the materials behind a quantity. Material summary totals retain reverse links to the BOQ lines that produced them.

Material calculations must be deterministic and assumption-visible. Specification-dependent construction work is not guessed merely because an AI classifier recognized the item description.

### Projects

Projects connect expected cost to project delivery, documents, progress and Money.

### Money

Money is the Accounting engine inside the App. It owns actual financial records, including funds, expenses, commitments, approvals and profitability.

### More

More contains Market, Ask Charismak, company settings and supporting tools.

## Authority rule

**Estimate is authority for Expected Cost. Money is authority for Actual Money. Project connects them.**

## Financial concepts must remain separate

The following are never interchangeable:

- BOQ Direct Cost;
- contingency or reviewed project reserve;
- internal project cost budget;
- overhead;
- profit;
- discount;
- tax/VAT;
- client contract value;
- actual cost;
- unpaid commitments.

The App must never silently turn a client-facing Grand Total into the internal construction-cost budget.

## Current estimate review sequence

1. Upload/read the BOQ.
2. Confirm item meaning, shared cost code, recipe family and supply responsibility.
3. Confirm or enter working rates.
4. Calculate supported deterministic material quantities.
5. Review commercial adjustments and the estimate summary.
6. Export the reviewed estimate.
7. Prepare a project staging snapshot.

No stage above posts to Accounting automatically.

## Estimate Summary V1

Commercial calculation order is explicit:

**Direct Cost → Contingency → Overhead → Profit → Discount → Tax/VAT → Grand Total**

All commercial percentages default to zero. The App does not invent a VAT rate, markup, overhead or contingency percentage. Unpriced BOQ items remain visible and keep the commercial total provisional.

Web/PWA exports include:

- commercial summary;
- priced BOQ using reviewed working rates;
- material schedule using reviewed deterministic material quantities.

Print/PDF preview and Excel-compatible export are review snapshots. Exporting does not create a project or post Accounting entries.

## Create Project review stage

Project creation is deliberately separated from estimate pricing.

Before an estimate can be staged as a project, the user explicitly chooses the financial mapping.

### Internal cost budget basis

- Direct Cost only;
- Direct Cost + reviewed contingency; or
- another explicit reviewed internal budget.

An explicit internal budget below reviewed Direct Cost is blocked. Any amount above Direct Cost becomes a visible reviewed reserve/allowance rather than being hidden inside a trade cost code.

### Contract value basis

- tax-inclusive Grand Total;
- subtotal before tax;
- another explicit signed/approved contract value; or
- no contract value yet.

The App does not assume whether VAT is inside or outside the signed contract sum.

A staging snapshot is not ready while required BOQ lines are unpriced, item review is incomplete, or reviewed cost codes are unresolved.

**Stage reviewed project snapshot** currently means only: produce a versioned reviewed hand-off snapshot. It is not a live `Create Project` database mutation.

The current project staging output is persistence-free and versioned. It does not insert a project or budget into the live database. Live creation requires the destination schema/access bridge to be approved first.

## Repository transition

The current working repository remains physically named `charismak-accounting` until a safe repository rename is performed. Application identity is already Charismak App. The repository name must not be interpreted as a product-boundary decision.

## Release safety

Development branches and preview features do not authorize:

- replacing the website;
- merging to production;
- applying live Supabase migrations;
- deploying preview Edge Functions to production;
- publishing a production mobile APK;
- inserting staged project budgets into the live Accounting database.

Those actions require explicit release authorization.
