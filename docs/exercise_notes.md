## what is the implementation request

Implement delete-location end to end so a saved location can be removed from the frontend, backend, and database flow.

## implementation challenges

- The backend already had create, list, get, and refresh routes, but no single-location delete route. The delete path needed a dedicated DB helper so the API could return `404` for missing ids and `204` for successful deletes.
- The location card is itself clickable for selection, so the delete control had to stop event propagation. Otherwise a delete click would also select the card.
- The delete affordance needed to stay visually unobtrusive while still being easy to find, so it was placed as a top-right cross button with absolute positioning.
- Deleting the selected location required store-level follow-up logic. After removal, the app has to reload the list and point selection at the next available location, or clear selection if none remain.
- The existing backend tests used HTTP-style integration helpers, which tried to bind a socket in this sandboxed environment. The test strategy had to be adjusted to exercise the router directly instead of opening a server port.
- The README still described delete as a future task. The implementation had to update the API docs and the feature notes so the repository state matched the actual behavior.

## implementation journal

Use this section as a changelog with one entry per feature branch or commit.

### 2026-05-17 | branch `main` | base commit `cd53906` | Delete location

- status: Implemented in the current uncommitted worktree.
- request: Add end-to-end delete support for saved locations.
- touchpoints: `backend/src/db.ts`, `backend/src/routes/locations.ts`, `backend/src/routes/locations.test.ts`, `frontend/src/api.ts`, `frontend/src/state/store.tsx`, `frontend/src/components/SidebarCard.tsx`, `frontend/src/types.ts`, `README.md`.
- risks: Deleting the selected card could leave selection stale unless the store recalculates the active location after reload. The delete button also sits inside a clickable card, so the event needs to stop propagation.
- decisions: Added a dedicated DB helper and a `DELETE /api/locations/:locationId` route, then wired the frontend through a store action that reloads locations and resets selection when necessary. The card uses an absolute-positioned cross button in the top-right corner.
- verification: `npm test`, `npm run build`.
- follow-up: None for this change.

### Template for future entries

### YYYY-MM-DD | branch `...` | commit `...` | summary

- status: Committed, in review, or in-progress.
- request: What is the implementation request?
- touchpoints: Which frontend, backend, and data files need changes?
- risks: What could break or become inconsistent?
- decisions: What approach was chosen and why?
- verification: What tests or builds were run?
- follow-up: What remains to be done, if anything?
