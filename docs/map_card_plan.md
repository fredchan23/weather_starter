# Plan: Apple Weather-style Map Card

**Date**: 2026-05-18  
**Status**: Approved — ready for implementation

---

## Overview

Add a `MapCard` component using the already-installed `react-leaflet` library. The card renders a dark-themed Leaflet map inside a glassmorphism tile card (matching the existing `TileShell` styling), showing all saved locations as custom pill-shaped pins with weather labels. An expand button opens a fullscreen modal overlay. Clicking a pin selects that location in the store.

---

## Design Q&A

The following decisions were confirmed during planning:

**Q: What map tile style should the card use?**  
**A: CartoDB DarkMatter** — matches the app's dark blue glassmorphism theme.  
URL: `https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png`  
Free, no API key required.

**Q: When a map pin is clicked, what should happen?**  
**A: Select that location** — calls `select(loc.id)`, which updates the sidebar active card and the Hero weather view. Same behaviour as clicking a sidebar card.

**Q: Show the map card when no location is selected (but locations exist)?**  
**A: Yes** — show the map card as the main content in that state, below the existing "Select a location" prompt text. Gives the user a way to click a pin to select a location directly from the empty state.

---

## Scope

| Type           | File                                                                                 |
| -------------- | ------------------------------------------------------------------------------------ |
| **New**        | `frontend/src/components/MapCard.tsx`                                                |
| Modified       | `frontend/src/components/icons.tsx`                                                  |
| Modified       | `frontend/src/components/Hero.tsx`                                                   |
| Modified       | `frontend/src/main.tsx`                                                              |
| Modified       | `frontend/package.json`                                                              |
| **No changes** | All backend files, `store.tsx`, `types.ts`, `Tiles.tsx`, `Sidebar.tsx`, `Layout.tsx` |

No backend changes are needed. The existing `GET /api/locations` response already returns `latitude`, `longitude`, `weather.condition`, and `weather.temperature_c` — everything the map requires.

---

## Implementation Steps

### Phase 1 — Dependencies

1. Add `"@types/leaflet"` to `devDependencies` in `frontend/package.json`
2. Add `import 'leaflet/dist/leaflet.css'` to `frontend/src/main.tsx` **before** `import './index.css'` — without this, Leaflet tiles render as overlapping squares
3. Run `npm install` to install the types package

### Phase 2 — Icons

4. Add three new SVG exports to `frontend/src/components/icons.tsx`:
   - `MapIcon` — map/grid glyph used in the card header label
   - `ExpandIcon` — outward arrows (open fullscreen)
   - `ShrinkIcon` — inward arrows (close fullscreen)

### Phase 3 — MapCard component

5. Create `frontend/src/components/MapCard.tsx` containing:

   **`makePinIcon(condition, temp, isSelected)`** → `L.DivIcon`  
   Renders inline HTML: a pill bubble (`condition · temp`) + thin 7px stem + dot.
   - Selected pin: white background, dark text, glow ring
   - Unselected pins: dark semi-transparent background, white text
   - Condition truncated at 16 chars with `…` suffix
   - If temperature is `"--°"`, omit separator and temperature

   **`MapInner` internal component**  
   `<MapContainer center={[1.352, 103.82]} zoom={zoom} zoomControl={false} attributionControl={false}>`  
   CartoDB DarkMatter `<TileLayer>` + one `<Marker>` per location with custom icon.  
   Marker `click` calls `select(loc.id)`.

   **`MapCard` export**
   - `locations.length === 0` → returns `null`
   - `useState(false)` for `isExpanded`
   - **Card mode** (`isExpanded=false`): `overflow-hidden rounded-2xl border border-white/15 bg-white/[0.08]` at `h-60`, no internal padding. Glassmorphism overlay header strip (`backdrop-blur`) with `MapIcon + "Map"` on left and `ExpandIcon` button on right.
   - **Expanded mode** (`isExpanded=true`): card's `MapInner` unmounts (replaced by same-height placeholder div — avoids two Leaflet instances); `position: fixed inset-0 z-50` modal mounts with slim header bar (`MapIcon + "Map"` left, `ShrinkIcon` button right) and full-viewport map at zoom 12.
   - Reads `{ locations, selectedId, select }` from `useStore()`

### Phase 4 — Hero integration

6. Modify `frontend/src/components/Hero.tsx`:
   - Import `MapCard`
   - **No-selection early return branch**: append `<MapCard />` below the existing "Select a location" / "Add a Singapore coordinate" prompt text
   - **Main selected-location return**: insert `<MapCard />` between `{hasSupplementaryTiles && <TileGrid weather={selected.weather} />}` and the `<footer>`

### Phase 5 — Verification

7. `npm test` — no backend tests affected; all 9 must still pass
8. `npm run build` — TypeScript must compile cleanly

---

## Dashboard Layout (selected location)

```
Header (area name, temperature, condition, H/L)
HourlyStrip
TenDayForecast          ← conditional on hasDailyForecast
TileGrid                ← conditional on hasSupplementaryTiles
MapCard                 ← new, always shown when locations.length > 0
Footer (refresh button)
```

Card dimensions: full `max-w-5xl` column width, `h-60` (240 px).

---

## Pin Label

```
   ┌──────────────────────┐
   │  Partly Cloudy · 29° │   ← pill (white bg if selected, dark if not)
   └──────────────────────┘
            │               ← 7px stem
            •               ← dot
```

Sourced from `loc.weather.condition` (fallback `"Unknown"`) and `formatTemperature(loc.weather.temperature_c)` (fallback `"--°"`).

---

## Key Design Decisions

| Decision          | Choice                         | Reason                                                                                 |
| ----------------- | ------------------------------ | -------------------------------------------------------------------------------------- |
| Tile provider     | CartoDB DarkMatter             | Matches dark blue theme; free; no key                                                  |
| Card zoom         | 11                             | Singapore island fits at this level                                                    |
| Fullscreen zoom   | 12                             | Slightly closer for detail                                                             |
| Pin click action  | `select(loc.id)`               | Consistent with sidebar card behaviour                                                 |
| Two MapContainers | Card unmounts when modal opens | Avoids double Leaflet instance resource usage                                          |
| Card padding      | None (edge-to-edge map)        | Cannot reuse `TileShell` (which has `p-4`); custom wrapper with overlay header instead |

---

## Out of Scope

- Geolocation / "my location" pin
- Visible zoom controls (Leaflet scroll-zoom still works)
- Animated pin transitions
- Any backend changes
- `exercise_notes.md` changelog entry (added after implementation)
