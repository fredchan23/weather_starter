## Problem Statement

Users currently have to manually enter latitude and longitude to add a weather location. This creates friction, increases input errors, and makes the first-use experience slower than expected for a Singapore weather app. Users specifically want a one-tap "Use my location" flow that works on localhost without HTTPS, gracefully handles permission/network failures, and still keeps manual entry available as a fallback.

## Solution

Add a "Use my location" button in the add-location entry point. On click, the app will request browser geolocation, resolve to the nearest Singapore forecast area coordinates, and add that location automatically. The flow will be resilient by design:

- Fast geolocation settings tuned for area-level matching.
- Unified coordinate normalization and nearest-area snapping pipeline for both geolocation and manual entry.
- Frontend pre-check for duplicates to switch to existing location without unnecessary create requests.
- Fallback to direct coordinate create when area metadata is unavailable and coordinates are valid.
- Clear inline status and error messaging, accessible semantics, and structured analytics events.

The backend will expose normalized forecast-area metadata under the existing locations API surface with TTL caching and stale-on-upstream-failure behavior to improve reliability.

## User Stories

1. As a weather app user, I want a one-tap Use my location action, so that I can add my current area quickly.
2. As a new user, I want to avoid typing coordinates manually, so that onboarding is easier.
3. As a returning user, I want Use my location in the collapsed add state, so that I can act with minimal taps.
4. As a user on localhost, I want geolocation to work without HTTPS setup, so that local development remains simple.
5. As a user whose browser blocks geolocation, I want clear inline guidance, so that I know how to proceed manually.
6. As a user whose browser does not support geolocation, I want the button disabled with explanation, so that missing behavior is understandable.
7. As a user, I want the app to be responsive when resolving location, so that the action feels reliable.
8. As a user, I want geolocation requests optimized for speed over unnecessary precision, so that completion is fast.
9. As a user in Singapore, I want my location to map to the nearest forecast area, so that forecast labels and readings feel correct.
10. As a user outside Singapore, I want the app to snap to the nearest Singapore forecast area, so that I can still add a relevant location.
11. As a user, I want saved coordinates to match the snapped forecast-area point, so that app behavior is consistent.
12. As a user, I want duplicate detection to prevent redundant cards, so that my sidebar stays clean.
13. As a user, I want duplicate attempts to select the existing location automatically, so that I reach weather data immediately.
14. As a user, I want a message when a location already exists, so that I understand no new location was created.
15. As a user, I want both manual and geolocation adds to behave consistently, so that outcomes are predictable.
16. As a user, I want temporary network issues to be retried once automatically, so that transient failures do not interrupt me.
17. As a user, I want fallback behavior when area metadata is unavailable, so that core add flow still works.
18. As a user, I want errors to be specific and actionable, so that I can recover quickly.
19. As a user, I want inline success messages to explain whether snapping/fallback was used, so that behavior is transparent.
20. As a user, I want status messages to auto-dismiss, so that the UI stays uncluttered.
21. As a keyboard user, I want the button and status states to be accessible, so that the flow is usable without a mouse.
22. As a screen-reader user, I want loading and errors announced clearly, so that I can understand progress and failures.
23. As an engineer, I want analytics events aligned with existing naming conventions, so that dashboards remain coherent.
24. As an engineer, I want structured failure reasons, so that reliability issues are measurable.
25. As an engineer, I want to know whether stale metadata or fallback paths were used, so that diagnostics are actionable.
26. As an engineer, I want area metadata served from a cached backend endpoint, so that upstream dependency is reduced.
27. As an engineer, I want stale cached area data returned when upstream fails, so that user experience remains resilient.
28. As an engineer, I want frontend in-memory metadata caching with TTL refresh, so that repeated operations stay fast without long-lived staleness.
29. As an engineer, I want a shared coordinate helper, so that normalization and snapping logic does not drift.
30. As an engineer, I want tests focused on externally observable behavior, so that refactors do not cause brittle test failures.
31. As a product owner, I want default-on rollout, so that users get immediate value without flag management.
32. As a product owner, I want a measurable success threshold for the flow, so that we can validate release quality.

## Implementation Decisions

- Introduce a primary Use my location entry action in the collapsed add panel; keep manual Add Location available as fallback.
- Handle duplicate outcomes by selecting the existing saved location and showing a non-error informational message.
- Use geolocation options optimized for responsiveness: high accuracy disabled, bounded timeout, and non-zero maximum age.
- Keep geolocation capability visible in unsupported contexts via disabled state with explanatory hint text.
- Standardize coordinate normalization to 4 decimal places before duplicate checks and create calls.
- Implement one shared normalization/snap helper used by both manual and geolocation paths.
- Snap coordinates to nearest forecast-area coordinates for all adds (manual and geolocation), not only outside-Singapore cases.
- For out-of-Singapore inputs, use nearest Singapore forecast-area snapping and communicate that behavior in success copy.
- Expose area metadata from backend under locations namespace as a dedicated endpoint returning normalized area records and fetch timestamp.
- Backend endpoint behavior uses in-memory TTL cache and returns stale cached data with stale indicator when upstream is unavailable.
- Frontend fetches area metadata and computes nearest area locally (two-step model), using simple squared Euclidean ranking in lat/lon space.
- Frontend caches fetched area metadata in memory only, refreshing when cache age exceeds TTL.
- On area metadata fetch failure, perform one short automatic retry before invoking fallback behavior.
- If area metadata is unavailable or empty, allow direct-coordinate create fallback for valid in-bounds coordinates.
- If manual out-of-Singapore coordinate cannot be mapped due to unavailable metadata, block create with explicit inline message.
- Add frontend duplicate pre-check against currently loaded, normalized saved locations before create request.
- Keep backend duplicate protection as authoritative safety net for race conditions or stale client state.
- Use location-prefixed analytics event names to match current telemetry taxonomy.
- Standardize failure analytics metadata with fixed reason enum plus boolean path flags for stale/fallback/duplicate-precheck usage.
- Centralize user-facing status/error copy mapping from reason enums.
- Provide inline status messaging for success/info/error with auto-dismiss (short timeout) and replacement on subsequent actions.
- Ensure accessible semantics: button loading state, associated status/error descriptions, and screen-reader-friendly announcements.
- Ship default-on without feature flag.
- Implementation sequence: backend endpoint and tests first, then frontend geolocation/snap flows and tests, then docs/changelog updates.

## Testing Decisions

- Test principle: verify externally observable behavior, user-visible outcomes, and API contracts rather than internal implementation details.
- Backend tests will cover:
  - Area metadata endpoint contract shape and normalization.
  - TTL cache behavior and cache refresh.
  - Stale cache return path when upstream fails.
- Frontend tests will cover:
  - Geolocation success flow from click to create.
  - Permission denied, timeout, unsupported, and unknown failure paths with correct inline messaging.
  - Duplicate pre-check path selecting existing location without create request.
  - Area fetch retry, stale usage, empty-area fallback, and raw-coordinate fallback behavior.
  - Shared normalization/snap consistency across manual and geolocation adds.
  - Disabled/loading button behavior, single-flight protection, and auto-dismiss status messaging.
  - Accessibility behavior for status announcements and described errors.
- Prior art:
  - Router-level backend tests that invoke handlers directly with mock dependencies.
  - Existing create/delete/refresh location flow tests and weather-client nearest-area/station patterns.
- Validation gate before completion:
  - Run test suite and build checks for both backend and frontend integration paths.

## Out of Scope

- Replacing manual coordinate entry UI with a full searchable forecast-area autocomplete.
- Introducing a map-based picker for add-location.
- Persisting area metadata in database storage.
- Cross-device synchronization of geolocation preferences or consent state.
- New feature-flag infrastructure for this capability.
- Deep analytics pipeline changes beyond event naming and metadata fields required for this feature.

## Further Notes

- Success metric for post-release monitoring:
  - At least 80% of Use my location clicks should result in create or duplicate-selected within 10 seconds.
  - Failure rates should be tracked by structured reason enum to identify primary reliability bottlenecks quickly.
- The feature should remain robust in local development contexts and provide graceful degradation where browser geolocation security requirements differ.
