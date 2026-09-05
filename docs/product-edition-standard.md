# Charismak App Product Edition Standard

## One shared construction truth

Different user experiences may simplify or expose more controls, but they must not calculate the same construction item differently without an explicit reviewed assumption.

## Estimate standard

Every detailed estimate supports, where relevant:

- section
- item/reference
- description
- unit
- quantity
- imported rate
- working rate
- working amount
- cost group
- supply responsibility
- material-recipe family
- calculation assumptions
- material source traceability

## Calculation rule

AI interpretation is advisory. Deterministic functions perform quantity, material, rate and total calculations.

A material recipe must expose the assumptions that materially affect the result, such as waste percentage, thickness, mix ratio or conversion basis.

Unsupported or specification-dependent recipes must return a review-required state rather than an invented material quantity.

## Mobile parity

Mobile and web/PWA must provide the same core ability to review a BOQ, change a working rate, calculate supported materials and inspect traceability. Layout may differ to fit the device.

## Persistence rule

Preview calculations are not project budgets or Accounting transactions until the user explicitly saves/converts them through a reviewed persistence flow.
