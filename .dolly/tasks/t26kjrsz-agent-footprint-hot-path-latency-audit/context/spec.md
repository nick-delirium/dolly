<!-- dolly spec · task t26kjrsz -->
# Spec — Agent footprint + hot-path latency audit

**current: v1** · updated 2026-10-20T11:40:31Z by @nick-delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-10-20T11:40:31Z · @nick-delirium -->

Measure everything dolly puts into an agent's context (instruction block, MCP tool list + server instructions, skill/command descriptions, session-start, context payload) and the latency of what runs every session/turn (session-start, hook stop, context). Take the easy wins; recommend the config-level ones.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
