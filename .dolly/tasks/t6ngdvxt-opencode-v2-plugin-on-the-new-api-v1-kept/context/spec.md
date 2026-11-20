<!-- dolly spec · task t6ngdvxt -->
# Spec — opencode v2: plugin on the new API, v1 kept

**current: v1** · updated 2026-11-20T09:43:16Z by @nick-delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-11-20T09:43:16Z · @nick-delirium -->

opencode v2 only loads a default export's { id, setup(ctx) }; our plugin was v1-only, so on v2 dolly gave no context injection and no auto-log. One shipped file now serves v2 (setup) and v1 (server() + legacy named export).
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
