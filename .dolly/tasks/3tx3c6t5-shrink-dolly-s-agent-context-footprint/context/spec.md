<!-- dolly spec · task 3tx3c6t5 -->
# Spec — Shrink dolly's agent context footprint

**current: v1** · updated 2026-09-29T13:59:33Z by @nick-delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-09-29T13:59:33Z · @nick-delirium -->

Cut what dolly injects into agent context: slim always-loaded instruction block (~20 lines) with full guide in skill + new 'dolly guide' command; session-start injection ~6KB→~2KB (no repeated boilerplate, brief cut at section boundaries, active task only when session-linked or fresh); dolly context drops finalized plan, dedups auto-step bodies, caps log/files; MCP off by default + trimmed descriptions; drop duplicate checkpoint command.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
