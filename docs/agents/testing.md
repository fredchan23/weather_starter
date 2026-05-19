# Testing Patterns

## Router-Level Tests

Tests use the router directly — do not bind a real HTTP server. Pass a mock `weatherClient` via `createLocationsRouter({ weatherClient })`.
