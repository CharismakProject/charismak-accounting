# First-principles mobile audit — 2026-09-05

## Governing rule
Preserve the source BOQ first. Classification, material analysis and procurement are later layers and must not block import.

## Deleted from the core flow
- mandatory line-by-line cost-code / recipe / supply confirmation
- mandatory material calculation before a BOQ can continue
- local pseudo-project staging in the Android Projects flow
- project type, contract value and hand-entered matching keywords from first project creation

## BOQ acceptance basis
The mobile workflow is being checked against the different structures already used in Charismak work: simple elemental bills, labour-only bills, repeated headers, multi-bill professional BOQs, carried-forward summaries, specification rows, employer/client-supplied work and support/summary sheets. No single uploaded BOQ is treated as the template.

## Layer separation
1. Measurement: dimensions / geometry / measured quantity.
2. BOQ: sections, descriptions, units, quantities, rates and amounts.
3. Material analysis: conservative base consumption only when specification is sufficient.
4. Procurement: waste, packs, bags, lengths, sheets, trips and supplier decisions — separate from BOQ material consumption.

## Release rule
A BOQ may be imported and reviewed without pricing or material classification. Unpriced lines and source arithmetic mismatches stay visible as exceptions; they are never silently filled. Gated modules remain closed until their backend contract is proven against the live database.
