# Auto-Central + Geo Upgrade

## Problem Statement
How might we eliminate the blank first-load experience so every visitor — regardless of location — sees meaningful weather immediately, while giving Singapore users a frictionless path to their actual area?

## Recommended Direction
On mount, if the session has zero locations, silently create one using Central Singapore coordinates (`1.3048, 103.8318` → Orchard area, labelled **"Central"**). Weather loads immediately for all visitors. A dismissible banner — *"Showing Central by default. Use your location instead?"* — appears alongside it, offering a single-click geolocation upgrade. On click: browser geo fires, `selectNearestForecastArea` snaps to the nearest forecast area, Central is deleted and the real location is created in its place. If geo fails or returns out-of-bounds coords, the banner dismisses silently and Central stays.

## Key Assumptions to Validate
- [ ] Central auto-add always returns 200 (not 422) — `1.3048, 103.8318` is within `[1.1–1.5, 103.6–104.1]`. ✓
- [ ] Banner dismiss state lives only in React (no persistence) — acceptable because on a return visit, Central is already saved so the banner never re-triggers.
- [ ] Replacing Central with geo result (delete + create) is fast enough to feel seamless — test against the live API.

## MVP Scope
- `store.tsx`: in the mount `useEffect`, after `load()` returns empty, call `create()` with Central coords; set an `isDefaultLocation: true` flag in store state
- New `LocationBanner` component: shown when `isDefaultLocation === true`; "Use my location" button + dismiss X
- Geolocation handler: `getCurrentPosition` → `selectNearestForecastArea` → `deleteLocation(centralId)` → `create(nearestArea)` → clear flag; on error: just clear flag (Central stays)
- No persistence of banner-dismissed state needed

## Not Doing (and Why)
- **IP-based fallback** — adds a third-party dependency for marginal gain; Central default is sufficient
- **Persisting "banner seen" across sessions** — on return visits the banner never shows (Central is already saved), so this solves itself
- **Adding alongside** (keeping both Central and real location) — two cards for one intent is confusing
- **Showing the banner on manually-added sessions** — only triggered when the system added the default, not when the user picked their own area

## Open Questions
- ~~What label to use for the auto-added location?~~ Resolved: **"Central"** (no suffix).
