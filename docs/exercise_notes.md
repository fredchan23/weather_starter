# Exercise Notes

Use this as a changelog. Add one entry per branch or commit, and keep the same order inside every entry.

## 2026-05-17 | branch `main` | commit `cd53906` | delete location

- status: implemented
- implementation request: Add end-to-end delete support for saved locations so a user can remove a location from the sidebar and keep the frontend, backend, and database state in sync.
- implementation challenges:
  - No single-location delete path existed in the backend. The route needed a DB helper so it could return `404` for a missing id and `204` for a successful delete.
  - The location card is already clickable for selection, so the delete control had to stop event propagation to avoid accidental selection on delete clicks.
  - The delete affordance needed to be visible without overpowering the card, so it was placed as a compact top-right cross button with absolute positioning.
  - Deleting the selected location required store-level recovery logic. After reload, selection must move to the next available location or clear entirely when the list becomes empty.
  - The existing backend tests used HTTP-style integration helpers that tried to bind a socket in this sandbox, so the tests had to be rewritten to exercise the router directly.
  - The README still described delete as a future task, so the docs had to be updated to match the implemented behavior.
- scope: `backend/src/db.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`, `frontend/src/api.ts`, `frontend/src/state/store.tsx`, `frontend/src/components/SidebarCard.tsx`, `frontend/src/types.ts`, `README.md`.
- decisions: Added a dedicated delete helper, exposed `DELETE /api/locations/:locationId`, wired a store action to reload and reselect after delete, and used a top-right cross button inside the card.
- risks: The selected item can become stale after deletion unless the store re-evaluates selection. The delete button must stop propagation inside a clickable card.
- verification: `npm test`, `npm run build`.
- follow-up: None.

## Entry Template

## YYYY-MM-DD | branch `...` | commit `...` | summary

- status: `implemented`, `in progress`, `reviewed`, or `blocked`
- implementation request: What is being built?
- implementation challenges:
  - What made the work harder than expected?
  - What needed careful coordination across layers?
- scope: Which files or layers change?
- decisions: What approach was chosen?
- risks: What could regress?
- verification: What was run to validate the change?
- follow-up: What remains open?

