# Testing Patterns

## Router-Level Tests

Tests use the router directly — do not bind a real HTTP server. Pass a mock `weatherClient` via `createLocationsRouter({ weatherClient })`.

## Session ID in Route Tests

All route handlers read `res.locals.sessionId`. `createMockResponse()` in `locations.test.ts` defaults `locals` to `{ sessionId: 'test-session' }`. When testing cross-session behaviour, override it per call:

```typescript
// Two different sessions — same coords must both succeed
await callRoute(router, 'POST', '/locations', body, { locals: { sessionId: 'session-a' } });
await callRoute(router, 'POST', '/locations', body, { locals: { sessionId: 'session-b' } });
```

## Component Tests

The vitest environment is `node` — no jsdom or React Testing Library. Frontend component behaviour must be verified manually via `npm run dev`. Pure logic (helpers, data maps) is unit-testable; see `locationHelpers.test.ts` and `regionMap.test.ts` for examples.
