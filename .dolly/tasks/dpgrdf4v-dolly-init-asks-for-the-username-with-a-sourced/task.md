---
id: dpgrdf4v
slug: dolly-init-asks-for-the-username-with-a-sourced
title: dolly init asks for the username, with a sourced default
status: done
owner: nick-delirium
collaborators: [nick-delirium]
tags: [init]
steps: 1
spec_version: 1
created: 2026-11-20T09:49:03Z
updated: 2026-11-20T10:00:12Z
sessions: [36d7b4d9-0ca0-4cb9-8bd0-8b3723565119]
---

# dpgrdf4v · dolly init asks for the username, with a sourced default

<!-- dolly:header -->
`done` · spec v1 · @nick-delirium · 1 step · updated 2026-11-20 10:00Z
<!-- /dolly:header -->

## Spec

A teammate asked: init should ask for the username — with several aliases (gh login, work email, laptop account) the auto-picked one is hard to remember. Own step in the wizard with an inline placeholder: gh login, else git config, else 'Write your username'; the confirmed handle is pinned in local.json.

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 09:49Z` @nick-delirium: status todo → working.
- `2026-11-20 09:49Z` @nick-delirium: dolly init asks for the username as its own step: inline placeholder offers the gh login, else git config, else 'Write your username' (OS account never offered); the confirmed handle is pinned in local.json; --user for scripts.
  files: `src/prompt.ts`, `src/wizard.ts`, `src/cli.ts`, `README.md`, `tests/prompt.test.mjs`, `tests/wizard.test.mjs` · full: `steps.md#0001-nick-delirium`
- `2026-11-20 09:49Z` @nick-delirium: status working → validating. In a real terminal: dolly init in a scratch repo — the You step shows '⏎ enter to use <gh login> · from GitHub' dimmed in the input; typing replaces it; .dolly/local.json gets the user. Without gh signed in it offers the git config name.
- `2026-11-20 10:00Z` @nick-delirium: status validating → done. Reviewed: built and tested this session (362 tests green). Checked in a real pty.

