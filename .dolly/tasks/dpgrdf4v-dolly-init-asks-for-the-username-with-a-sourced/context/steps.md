<!-- dolly steps · task dpgrdf4v · append-only, newest at the bottom -->
# Full step context — dolly init asks for the username, with a sourced default

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001-nick-delirium -->
## 0001 · 2026-11-20T09:49:04Z · @nick-delirium

- task status: working
- files: `src/prompt.ts`, `src/wizard.ts`, `src/cli.ts`, `README.md`, `tests/prompt.test.mjs`, `tests/wizard.test.mjs`

## What changed
- prompt.ts `text()`: new `placeholder` option and a raw-mode path (`textRaw`) when the terminal can do raw keys — placeholder drawn dim in the empty input with the cursor in front of it (`\x1b[nD`), typing replaces it, backspace / ctrl-u edit, enter takes the typed value or `value`, validation errors print under the line and re-prompt, ctrl-c cancels. Line (numbered) terminals show the placeholder beside the question. review.ts's "what is missing" prompt gets the raw path too.
- wizard.ts: new **You** step right after Task memory (was a "Handle to stamp" line under Behaviour). Suggestion: `--user` if given, else `store.identity` unless its source is `os` (the laptop $USER is never offered). Placeholder `⏎ enter to use|keep <h> · from GitHub|git config|local.json|DOLLY_USER`, or `Write your username` (enter refused until typed). Leading `@` stripped; spaces refused. `WizardOpts.identity` is injectable (tests need no gh).
- Pinning rule CHANGED: a confirmed handle is written to `.dolly/local.json` (gitignored) unless it is already pinned there or is exactly DOLLY_USER. Old rule only pinned when it differed from auto-detection ("don't freeze auto-detection") — reversed on purpose: auto-detection drifting between aliases is the reported problem. If DOLLY_USER is set and differs, the wizard says it still wins in that shell.
- cli.ts: `init --user <handle>` (SETUP_FLAGS) pins it on the non-interactive path; without it, init prints `username: @x (source)` and warns in yellow when the source is the OS account. Help + nonTtyHint mention `--user`.

## Verified
tests/prompt.test.mjs (raw placeholder, default on enter, editing, required input, cancel, line path) and tests/wizard.test.mjs (gh offered + pinned, git offered, neither → "Write your username" + error + typed `@alice` → `alice`, pinned handle kept without rewrite, `init --yes --user`). Manual pty run via `script`: dim placeholder + cursor placement render correctly.
<!-- /dolly:step 0001-nick-delirium -->
