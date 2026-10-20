<!-- dolly steps · task 355wphgs · append-only, newest at the bottom -->
# Full step context — dolly review: human walkthrough of validating tasks

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001 -->
## 0001 · 2026-10-20T11:18:55Z · @nick-delirium

- task status: working
- files: `src/review.ts`, `src/core/task.ts`, `src/core/render.ts`, `src/cli.ts`, `skills/dolly/SKILL.md`, `README.md`, `tests/review.test.mjs`, `.claude/skills/dolly/SKILL.md`, `.opencode/skills/dolly/SKILL.md`

## dolly review — whole task, one slice

- `src/review.ts` (prints → outside core, like wizard.ts): `runReview({term, open, only?, status?, backTo?})`. Queue = tasks in the review status, oldest `updated` first (or one ref). Per task: short spec (6 lines), hand-over note, files (8), criteria; menu Done / Tick criteria… (only when real criteria exist) / Back to working (non-empty note required) / Skip / Quit. Done with unchecked criteria asks to confirm (default no).
- Locking: every write is `withStoreLock(root,'review', …)` on a store opened fresh and the task re-resolved under the lock — never held while a prompt waits. CLI: `review` is in `writesStore` (so a newer store refuses it via the version gate) but in `INTERACTIVE_WRITERS` with setup/init (no whole-command lock). Test proves a separate `dolly step` process completes while the prompt is open.
- Refusal: `notAHuman()` (same predicate as the wizard) → exit 1 with a message pointing agents at `dolly status <ref> validating --note`. Verified live in this agent session.
- core/task.ts: `criteriaList`, `setCriterion` (changes only the box char; log line starts with "criteria:" so related.ts `classify` reads it as a note, not a step outcome — "criterion …" would have been classified 'step' and shown as the task's latest outcome), `handoffNote(task, status)` (latest `status X → <status>.` line + its indented continuation lines).
- Found: `createTask` writes `- [ ] _TBD_` when no criteria are given; that placeholder counted as a criterion ("1 criteria unchecked — done anyway?" on every such task). Now `checkbox()` skips TBD_LINE placeholders in both listing and toggling, so indexes agree.
- Board ends with "N awaiting a human — `dolly review` walks them in a terminal". Deliberately NOT in session-start: that is agent context and agents must not run review.
- No MCP tool, by design.

Tests: tests/review.test.mjs (7) — toggle exactness + round-trip, hand-over note, numbered walk (tick/done/back/skip, oldest first), arrow-key confirm refusal, lock free while waiting, no-TTY refusal leaves file byte-identical, board hint. Suite 318/318.

Not done: a real interactive run — needs the human (13 tasks are waiting in this repo).
<!-- /dolly:step 0001 -->
