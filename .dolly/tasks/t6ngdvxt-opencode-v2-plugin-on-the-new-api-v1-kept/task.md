---
id: t6ngdvxt
slug: opencode-v2-plugin-on-the-new-api-v1-kept
title: "opencode v2: plugin on the new API, v1 kept"
status: validating
owner: nick-delirium
collaborators: [nick-delirium]
tags: [opencode]
steps: 1
spec_version: 1
created: 2026-11-20T09:43:16Z
updated: 2026-11-20T09:43:17Z
sessions: [36d7b4d9-0ca0-4cb9-8bd0-8b3723565119]
---

# t6ngdvxt · opencode v2: plugin on the new API, v1 kept

<!-- dolly:header -->
`validating` · spec v1 · @nick-delirium · 1 step · updated 2026-11-20 09:43Z
<!-- /dolly:header -->

## Spec

opencode v2 only loads a default export's { id, setup(ctx) }; our plugin was v1-only, so on v2 dolly gave no context injection and no auto-log. One shipped file now serves v2 (setup) and v1 (server() + legacy named export).

## Success Criteria

- [ ] _TBD_

## Full Context

- full spec + every superseded version: `context/spec.md`
- full context of every step: `context/steps.md`
- planning interview, when the task was planned: `context/plan.md`

## Log

- `2026-11-20 09:43Z` @nick-delirium: status todo → working.
- `2026-11-20 09:43Z` @nick-delirium: opencode plugin serves both APIs from one shipped file: v2 setup(ctx) (session context/prompt/experimental.idle hooks, session.idle event fallback, ctx.session.context) and v1 server()/named export; tested against fake v1/v2 hosts. Repo AGENTS.md and .opencode/ refreshed.
  files: `plugins/opencode.js`, `src/install.ts`, `package.json`, `README.md`, `tests/opencode-plugin.test.mjs`, `tests/install.test.mjs` +3 more · full: `steps.md#0001-nick-delirium`
- `2026-11-20 09:43Z` @nick-delirium: status working → validating. Open this repo in opencode v2 (and v1 if you still use it): the first model request should carry the dolly session-start text; after a turn that edits a file, dolly context shows an auto-logged step. /dolly-board on v2 goes through the model (no direct path).

