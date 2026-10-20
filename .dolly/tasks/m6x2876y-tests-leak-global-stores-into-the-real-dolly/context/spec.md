<!-- dolly spec · task m6x2876y -->
# Spec — Tests leak global stores into the real ~/.dolly

**current: v1** · updated 2026-10-20T10:47:36Z by @nick-delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-10-20T10:47:36Z · @nick-delirium -->

tests/install.test.mjs creates a global store under the developer's real ~/.dolly/projects and tests/migrate.test.mjs writes index.json entries there (29 leftover dolly-test-* dirs found). Every test must run under an isolated DOLLY_HOME/HOME; add a guard test that fails if the suite writes outside its tmp home.
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
