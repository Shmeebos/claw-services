# Claw Services CRM Control Room

A private, responsive CRM and KPI prototype for Claw Services.

The product includes:

- five in-page operating views for overview, pipeline, accounts, delivery, and governance;
- eight executive KPI cards backed by clearly labeled synthetic fixtures;
- an authoritative empty-ledger mode;
- a deterministic Demo Copilot that summarizes visible data without making writes;
- responsive layouts, keyboard focus states, and mobile record cards.

This first version has no database, authentication layer, external CRM, live AI
model, environment variables, or persistent edits.

## Local commands

- `npm run dev` — start the local preview
- `npm run build` — create the Sites production build
- `npm test` — build and run the KPI, copilot, filter, empty-state, and render tests
