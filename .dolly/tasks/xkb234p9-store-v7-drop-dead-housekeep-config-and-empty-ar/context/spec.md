<!-- dolly spec · task xkb234p9 -->
# Spec — Store v7: drop dead housekeep config and empty archive dir

**current: v1** · updated 2026-10-20T10:47:36Z by @nick-delirium

<!-- dolly:spec-current -->
<!-- v1 · 2026-10-20T10:47:36Z · @nick-delirium -->

Archiving was scrapped (2rhqyc8c) but config.json still carries housekeep.* keys no code reads and .dolly/archive/ stays as an empty dir. Safe v7 migration removes both; STORE_VERSION → 7 also reserves the bump for compaction's new on-disk shapes (digest: frontmatter, steps.compacted.md).
<!-- /dolly:spec-current -->

---

## Superseded versions

<!-- dolly:spec-history -->
_none — v1 is the first spec_
<!-- /dolly:spec-history -->
