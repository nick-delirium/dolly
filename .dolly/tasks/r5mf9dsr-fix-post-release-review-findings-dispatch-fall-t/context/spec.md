<!-- dolly spec · task r5mf9dsr -->
# Spec — Fix post-release review findings: dispatch fall-through, fuzzy gaps, memo date/file bugs

**current: v1** · updated 2026-08-30T11:50:56Z by @nick.delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-08-30T11:50:56Z · @nick.delirium -->

Second review pass on 701d3d9 confirmed real bugs: archive/restore case labels fell through into cmdPlan (archive start creates a task), fuzzy matcher rejects any needle with a space and over-bonuses upper→lower, id generation has modulo bias, memo mixes UTC and local days and lists spec.md as a touched file. Fix all, with tests.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
