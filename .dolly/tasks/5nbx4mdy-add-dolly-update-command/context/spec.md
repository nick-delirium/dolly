<!-- dolly spec · task 5nbx4mdy -->
# Spec — Add dolly update command

**current: v1** · updated 2026-08-25T17:15:07Z by @nick.delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-08-25T17:15:07Z · @nick.delirium -->

Explicit human command that detects how this copy was installed (linked clone vs npm-global) and updates in place: git pull --ff-only + npm install for a clone, npm i -g github:<slug> for a package. --check reports only, --dry-run prints the plan, refuses on a dirty clone. The passive update notice points at it.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
