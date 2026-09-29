---
id: xj6mxdp6
slug: fix-full-repo-review-findings-data-loss-arg-pars
title: "Fix full-repo review findings: data loss, arg parsing, version gate, install safety, dead code"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: [review]
steps: 4
spec_version: 1
created: 2026-09-29T13:59:19Z
updated: 2026-09-29T14:25:50Z
sessions: [9b8fa6e3-cae2-461d-83e8-303d1b261b96]
---

# xj6mxdp6 · Fix full-repo review findings: data loss, arg parsing, version gate, install safety, dead code

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 4 steps · updated 2026-09-29 14:25Z
<!-- /dolly:header -->

## Spec

Fix every bug from the 2026-09-29 whole-repo review (three parallel reviewers: core model, cli/mcp/reindex/migrate, install/wizard/generated files) except auto-log targeting + store locking (own task). Remove confirmed dead code and stale shipped files; fix docs drift.

## Success Criteria

- [ ] frontmatter scalar round-trip lossless for quotes/backslashes; regression test
- [ ] unparseable JSON config never overwritten by install; unparseable .dolly/config.json never stamped
- [ ] boolean flags never swallow the next positional; unknown flags rejected per command
- [ ] version gate by operation: hook stop refuses newer store, read-only subcommands allowed
- [ ] install prunes stale shipped command files; pi --global no longer writes SYSTEM.md; slash commands use bare $ARGUMENTS
- [ ] medium findings fixed with tests (sections, markers, retitle, resolve tiers, stdin, mcp protocol, setBlock, symlinks, cleanLegacy, toml, scope, hooks persisted, git<2.31, worktree files, related trailers, transcript fallback)
- [ ] dead code removed; full suite + tsc clean

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-09-29 14:00Z` @nick-delirium: status todo → working.
- `2026-09-29 14:09Z` @nick-delirium: Core integrity fixed: frontmatter escapes now round-trip (was doubling per save), user '## ' lines demoted instead of ending sections, orphan markers refused, spec/step writes validated first, step ids never reused, >6 files kept for related, broken JSON never overwritten. Dead core helpers removed.
  files: `src/core/md.ts`, `src/core/task.ts`, `src/core/fsx.ts`, `src/core/store.ts`, `src/core/git.ts`, `src/core/related.ts` +7 more · full: `steps.md#0001`
- `2026-09-29 14:15Z` @nick-delirium: Flags parse per command (switches can't eat refs, typos rejected), version gate is per operation (hook stop silent on newer store, reads allowed), stdin only on '-', multi-word refs; MCP stops answering notifications, validates args, and warns instead of blocking on the .dollie orphan (now a warning, not a migration).
  files: `src/core/args.ts`, `src/cli.ts`, `src/mcp.ts`, `src/migrate.ts`, `tests/cli-args.test.mjs`, `tests/mcp.test.mjs` +1 more · full: `steps.md#0002`
- `2026-09-29 14:21Z` @nick-delirium: Install no longer wipes unparseable configs (skips with a note), merges MCP entries instead of replacing, prunes commands it stopped shipping, honours --global per target, writes pi's AGENTS.md not SYSTEM.md, guards hook commands for teammates without dolly; slash commands use bare $ARGUMENTS; prompt key() cancels on EOF.
  files: `src/install.ts`, `src/wizard.ts`, `src/prompt.ts`, `src/core/types.ts`, `src/cli.ts`, `commands/adopt.md` +7 more · full: `steps.md#0003`
- `2026-09-29 14:25Z` @nick-delirium: Last findings closed: caches honour DOLLY_HOME (gh identity expires after 7d), memo rejects impossible dates and reuses parseLog, reindex folds turns only after a real interrupt and never borrows another project's transcripts; stale docs fixed. 266/266.
  files: `src/core/home.ts`, `src/core/store.ts`, `src/core/identity.ts`, `src/core/update.ts`, `src/core/memo.ts`, `src/core/transcript.ts` +8 more · full: `steps.md#0004`
- `2026-09-29 14:25Z` @nick-delirium: status working → validating. Review diff; run npm test (266). Spot-check: dolly context --brief <ref>, dolly step x --file a (should error), install into a repo with a JSONC opencode.json (skipped, untouched).

