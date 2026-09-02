# Charismak App Product Boundary

## Non-negotiable product split

### Corporate website — `www.charismakproject.com`

Public-facing Charismak Project Nigeria Limited presence:

- company profile and services;
- project portfolio;
- blog/construction content;
- public construction price information;
- marketing and lead generation;
- lightweight/preliminary estimator where useful;
- links/deep-links into the Charismak App.

The website is **not** the logged-in construction operating product.

### Charismak App — target `app.charismakproject.com` + Android/iOS

The construction operating product informed by the review of PMS, ADLM, Buildam, Arbin X, ConstruC and related tools.

Primary navigation:

1. Home
2. Estimate
3. Projects
4. Money
5. More

`More` temporarily houses advanced/support areas while Market and Ask Charismak mature into first-class modules.

## Module responsibilities

### Estimate

Expected-cost intelligence:

- Quick Estimate
- guided Build Estimate
- Upload BOQ
- Upload Drawing
- Enter measured quantities
- BOQ Studio
- materials/labour schedules
- local rate application
- quotation/BOQ export
- Create Project

### Projects

Operational construction truth:

- active/inactive projects
- project budget baseline
- progress
- documents
- team assignment
- commitments
- variations and project commercial context

### Money

Financial truth. This is the existing Accounting capability evolved as a module rather than the whole product:

- funds and financing
- transactions
- statements/imports
- approvals
- commitments/payables
- project actual cost
- budget vs actual
- treasury
- profitability
- reports and audit controls

### Market

Future first-class procurement/sourcing area:

- materials
- suppliers
- artisans
- professionals
- location-aware rates and verified price sources

### Ask Charismak

Future conversational layer across authorised structured App data, for example:

- How much have we spent on this project?
- Which cost code is overrunning?
- What materials remain?
- What do clients owe us?
- What do we owe suppliers?
- What is the likely final project profit?

AI may interpret and explain. Deterministic code/database records remain the source of numerical and accounting truth.

## Shared-core rule

One construction job eventually has one canonical App/Accounting project UUID. Estimate/BOQ source IDs remain references to that project, not parallel project identities.

Expected cost and actual money must remain distinct but connected:

Estimate → reviewed internal budget → commitments → actual transactions → forecast → profitability.

## Deployment rule

Website changes and App changes are deployed independently. A Charismak App feature must never be pushed into the corporate website merely because the website currently contains a public estimator.
