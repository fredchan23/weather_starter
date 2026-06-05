# ADR-002: Per-browser anonymous session isolation via `wsid` cookie

## Status
Accepted

## Date
2026-06-05

## Context

The weather starter is a personal dashboard — each user saves their own set of Singapore weather locations. Before this change, all locations were stored in a single flat table and every visitor to the server saw the same list. Three forces drove the need for isolation:

1. **Multiple users on one server.** Family members, colleagues, or curious visitors using the same deployment each want their own location set.
2. **No user identity exists.** The app has no signup/login flow and no intention of adding one.
3. **Snapshot model is server-side.** Weather readings are fetched from data.gov.sg on demand, merged into a SQLite row, and served from there. This cannot move to the client without rewriting the entire data layer.

## Decision

Assign each browser a UUID session identifier via a `wsid` `HttpOnly` cookie on first visit. Store the identifier as a `session_id TEXT NOT NULL DEFAULT 'legacy'` column in the `locations` table. Scope all five DB helpers (`listLocations`, `createLocation`, `getLocation`, `deleteLocation`, `updateWeather`) to `session_id`. Session middleware lives in `backend/src/server.ts`; it reads `wsid`, validates it as a UUID, generates a fresh one if absent or invalid, and writes it to `res.locals.sessionId` for all downstream handlers.

Cookie attributes: `HttpOnly`, `SameSite=Lax`, 1-year `Max-Age`. No `Secure` flag in development; the production deployment is behind Caddy with TLS termination which handles HTTPS enforcement.

## Alternatives Considered

### localStorage-only (no server changes)

- **Pros:** Purely client-side; zero backend migration.
- **Cons:** The snapshot model stores weather readings in SQLite rows on the server — there is no client-side snapshot. Moving to localStorage would require rewriting the store, the refresh flow, the route handlers, and the entire test suite. It also loses data when the user clears browser storage.
- **Rejected:** Disproportionate rewrite; breaks the snapshot model that is core to the design.

### Full authentication (OAuth / email)

- **Pros:** Portable identity; works across devices and browsers.
- **Cons:** Login friction is not worth it for a dashboard with no sensitive data. OAuth requires app registration with a provider; email auth requires an email delivery system. Both add third-party dependencies for a problem that anonymous sessions solve completely.
- **Rejected:** Overcomplicated for the use case. See `docs/ideas/location-picker-and-sessions.md`.

### URL-based session ID (query parameter or path prefix)

- **Pros:** Works without cookies; shareable if desired.
- **Cons:** Session ID appears in browser history, server access logs, and any URL shared with another person. Not appropriate for persistent personal state.
- **Rejected:** Privacy and UX issues outweigh the simplicity benefit.

### No isolation (status quo)

- **Rejected:** The shared-list problem is directly observable — two users on the same server immediately interfere with each other.

## Consequences

- **`session_id` column with `DEFAULT 'legacy'`:** Existing rows before this migration get `session_id = 'legacy'`. Since no real browser will ever send `wsid=legacy`, these rows are effectively invisible to new sessions — a safe data migration with no clean-up needed.
- **Unique index changed:** The uniqueness constraint was `(latitude, longitude)`; it is now `(session_id, latitude, longitude)`. Two different sessions may save the same coordinates independently — this is the desired behaviour.
- **Test helpers:** Route tests must include `locals: { sessionId: 'test-session' }` when calling handlers. `createMockResponse()` defaults `locals` to `{ sessionId: 'test-session' }` so existing tests required no per-call changes; only the two new cross-session tests set a different session ID.
- **Cookie clearing resets state.** There is no account recovery — if a user clears cookies they start fresh. Accepted for a personal dashboard.
- **No cross-device sync.** Intentionally out of scope.

## References

- [`docs/ideas/location-picker-and-sessions.md`](../ideas/location-picker-and-sessions.md) — original design doc
- [`docs/exercise_notes.md`](../exercise_notes.md) — implementation log (2026-06-05 Checkpoint 1 entry)
- `backend/src/server.ts` — `sessionMiddleware` implementation
- `backend/src/db.ts` — all DB helpers scoped to `session_id`
