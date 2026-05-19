# Conventions

## Domain Constraints

Locations must be within Singapore bounds: lat 1.1–1.5, lon 103.6–104.1. The backend enforces this with a 422 response.

## Environment

Set `WEATHER_API_KEY` before `npm run dev` to avoid rate limits (optional; the API works without a key).

## Changelog

After every implementation, add a dated entry to [docs/exercise_notes.md](../../docs/exercise_notes.md) following the existing format:

```
## YYYY-MM-DD | branch `name` | commit `hash` | short description

- status: implemented
- implementation request: …
- implementation challenges: …
- scope: <files changed>
- decisions: …
- verification: <commands run>
- follow-up: …
```
