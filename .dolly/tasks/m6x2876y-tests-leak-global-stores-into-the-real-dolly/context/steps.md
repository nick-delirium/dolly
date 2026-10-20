<!-- dolly steps · task m6x2876y · append-only, newest at the bottom -->
# Full step context — Tests leak global stores into the real ~/.dolly

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-10-20T10:50:49Z · @nick-delirium

- task status: working
- files: `tests/isolate.mjs`, `tests/isolation.test.mjs`, `package.json`

## Test home isolation

Found by running each test file with HOME pointed at an empty dir: `tests/install.test.mjs` created a global store `~/.dolly/projects/dolly-test-*-<hash>` and `tests/migrate.test.mjs` wrote `~/.dolly/projects/index.json` entries — every run. Developer's real home held 27 such dirs + ~110 index entries for deleted tmp projects.

Second leak, read side: `tests/transcript-opencode.test.mjs` deletes DOLLY_TRANSCRIPT_DIR, so `listSessions` falls back to the real `~/.claude/projects`; the basename fallback in `candidateDirs` matched a unique `*-proj` dir there → "4 !== 1". Passed or failed depending on the machine.

Fix: `tests/isolate.mjs`, preloaded by `npm test` (`node --import ./tests/isolate.mjs --test …`). Once per run it creates a realpath'd tmp home and sets DOLLY_TEST_HOME, DOLLY_HOME, HOME, USERPROFILE; spawned test processes inherit it; removed on exit. realpath matters: os.tmpdir() is a symlink on macOS and `tildeEncode` compares against realpath'd home (tilde test failed without it).

Rejected: setting DOLLY_HOME in `sandbox()` — 14 test files never import helpers.mjs, and a per-test value fights the tests that save/restore DOLLY_HOME themselves.

Guard: `tests/isolation.test.mjs` fails when the suite is run without the preload (plain `node --test`) — the message says to use `npm test`.

Not done: deleting the leftovers in the real ~/.dolly — user's home, left for the human (`dolly projects --prune` + rm of ~/.dolly/projects/dolly-test-*).
<!-- /dolly:step 0001 -->
