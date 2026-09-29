<!-- dolly spec · task rqdpztdy -->
# Spec — Auto-log targets this session's task; lock store writes

**current: v1** · updated 2026-09-29T13:59:33Z by @nick-delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-09-29T13:59:33Z · @nick-delirium -->

Stop-hook auto-log and 'current' pick the most recently updated working task regardless of session/owner, so unrelated sessions pollute stale tasks (seen: 5nbx4mdy, jd8s6t23, 6qp6wxbq). Resolve the session's own task first; never auto-log onto a task this session is not linked to. Add an exclusive lock around task mutations so parallel steps/hooks cannot duplicate step ids. Stop plugin+project hooks double-firing.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
