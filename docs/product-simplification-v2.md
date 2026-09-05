# Charismak App Product Simplification V2

The product should feel simple even when the underlying construction/accounting logic is sophisticated.

## Main navigation

**Home · Estimate · Projects · Money · More**

Users should not be forced through technical database/accounting terminology.

## Estimate workflow

The primary detailed-estimate path is:

**Upload/Create → Review → Rates → Materials → Summary → Create Project**

### Upload/Create

Accept the user's existing BOQ structure rather than forcing one house format. Column names/order may vary.

### Review

Preserve sections and highlight only items that genuinely need correction. Allow bulk confirmation at section level.

### Rates

Keep imported/user rates until deliberately changed. Reference ranges advise; they do not silently replace rates.

### Materials

The user should be able to tap a BOQ quantity to understand the material breakdown behind it.

The material summary must also work backwards: tap a material total to see the BOQ items that produced it.

Only confirmed deterministic recipes calculate. Unknown/specification-dependent items remain clearly marked for review.

### Summary

Keep commercial totals understandable and separate:

- Direct Cost
- Contingency
- Overhead
- Profit
- Tax/VAT where applicable
- Client Price

Do not collapse profit or VAT into internal project cost.

### Create Project

Project conversion is explicit, not automatic. It creates a reviewed expected-cost baseline that can later be compared with Money/actuals.

## Mobile-first rule

Every important estimate action must remain practical on a phone. Large tables can adapt into compact item cards, but mobile must not become a reduced read-only edition.

## AI rule

AI may interpret, classify and suggest. Deterministic engines calculate. The user confirms financial/material effects.
