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

## Repository transition

The current working repository remains physically named `charismak-accounting` until a safe repository rename is performed. Application identity is already Charismak App. The repository name must not be interpreted as a product-boundary decision.

## Release safety

Development branches and preview features do not authorize:

- replacing the website;
- merging to production;
- applying live Supabase migrations;
- deploying preview Edge Functions to production;
- publishing a production mobile APK.

Those actions require explicit release authorization.
