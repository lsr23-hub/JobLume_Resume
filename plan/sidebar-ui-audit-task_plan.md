# Sidebar UI audit and polish

## Goal
Inspect the dashboard shell and available profile state; fix verified UI defects without changing user data.

## Phases
- [x] Inspect skill guidance, source, and current browser state.
- [x] Fix sidebar icon clipping and tooltip trigger semantics.
- [x] Verify desktop/mobile layout, build, and detector findings.
- [x] Review diff and summarize remaining limits.

## Decision
- Focus on dashboard shell and profile empty state because the current profile has no selected user.
- Preserve the existing visual style and data flows.
- The current browser profile state has no selected user, so data panels were not changed or exercised.
