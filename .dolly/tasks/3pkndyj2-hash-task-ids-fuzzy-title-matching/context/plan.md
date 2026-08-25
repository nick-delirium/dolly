<!-- dolly plan · created 2026-08-25T15:14:54Z · @nick.delirium -->
# Plan — Hash task ids + fuzzy title matching

> Interview record. Every section below must be answered before `dolly plan finalize`.
> Gate: `dolly plan check` fails while a section is empty, `_TBD_`, or an Open Question is unchecked.

## Brief

Task ids become 8-symbol hash-like uuids instead of sequential numbers. Selecting/finding tasks (continue etc.) uses fuzzy matching like fzy on title; single match selects directly, multiple matches open an interactive prefilled picker. Hashes always accepted too so agents can use them.

## Problem

Sequential ids (0001…) carry no information, collide across repos in copy-paste, and selection is numeric-only. User wants hash-like random ids plus fuzzy title search so humans can type 'dolly continue oauth login' instead of remembering numbers.

## Goal

New tasks get 8-symbol no-vowel base32 ids. Any command taking <ref> accepts a hash, an exact/partial title via fuzzy match, or current. One clear fuzzy winner selects directly; several candidates open an interactive picker (prefilled query) in a TTY, or a numbered list when scripted.

## Scope

In:
- id generation: 8 chars, base32 minus vowels/ambiguous glyphs
- ref resolution: hash > legacy id > slug > fuzzy title (fzy-style scoring)
- interactive picker for ambiguous matches (reuse prompt.ts Term), numbered fallback non-TTY
- migrate: rewrite existing numeric ids to hashes (dirs + frontmatter + log/spec references)
- MCP/reindex/--into paths updated

Out:
- changing the .dolly file format beyond the id fields
- fzy as a dependency (hand-roll the scoring)

## Success Criteria

- [ ] new tasks have 8-char vowel-free ids; collision regenerates
- [ ] dolly continue <fuzzy title fragment> picks the single match directly
- [ ] ambiguous match opens interactive picker with the query prefilled; non-TTY prints numbered candidates
- [ ] hashes always accepted everywhere refs are taken
- [ ] dolly migrate rewrites legacy numeric ids losslessly (logs keep pointing at the right tasks); idempotent
- [ ] npm test green

## Changes

Guesses marked (?).
- core: new src/core/fuzzy.ts — fzy-style score (needle in haystack, consecutive/word-boundary bonus), zero deps
- store.ts: nextId() → random 8-char from alphabet 23456789abcdefghjkmnpqrstuvwxyz minus vowels (23456789bcdfghjkmnpqrstvwxyz); regenerate on collision; resolveRef() extended with fuzzy tier + returns candidates
- cli.ts continue/show/context/step/spec/status/archive refs: on ambiguous, picker via prompt.ts (Term injectable); numbered list + exit 1 when non-TTY
- task.ts/createTask: use store.nextId()
- migrate.ts: chain step — for each numeric-id task: generate hash, rename dir, rewrite frontmatter id, rewrite id references in task.md log lines and steps.md headers; fingerprint-detected, idempotent
- mcp.ts: ref args flow through the same resolver (?)
- README commands section

## Risks

- rewriting ids inside prose logs could corrupt unrelated text — only rewrite exact token matches (\bNNNN\b) and verify counts
- teammates' clones mid-migration: schema bump forces migrate before write, existing guard covers it
- fuzzy surprise picks: require score threshold; below it, treat as no match with helpful message
- picker in raw mode: prompt.ts already handles arrow keys + numbered fallback

## Test Plan

- unit: alphabet excludes vowels; collision regeneration
- unit: fzy scoring ranks exact > prefix > substring > gaps
- unit: resolveRef single fuzzy match / ambiguous / no match
- unit: migrate rewrites fixture store with cross-references; rerun no-op
- manual: interactive picker by hand in a TTY

## Open Questions

- [x] Alphabet? → base32 without vowels/ambiguous glyphs (user)
- [x] Legacy ids? → full migration to hashes, not just readability (user)

## Q&A

_none yet_
