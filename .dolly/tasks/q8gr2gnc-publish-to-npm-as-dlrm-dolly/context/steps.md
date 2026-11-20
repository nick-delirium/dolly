<!-- dolly steps · task q8gr2gnc · append-only, newest at the bottom -->
# Full step context — Publish to npm as @dlrm/dolly

Short summaries live in `../task.md`. Each entry below is the full context of one step:
decisions and why, options rejected, gotchas, snippets, what to do next.

<!-- dolly:step 0001-nick-delirium -->
## 0001 · 2026-11-20T10:20:52Z · @nick-delirium

- task status: working
- files: `.claude-plugin/plugin.json`, `README.md`, `package-lock.json`, `package.json`, `src/core/pkg.ts`, `src/core/selfupdate.ts`, `src/core/store.ts`, `src/core/update.ts`, `tests/update.test.mjs`

## Why
`npm publish` failed with E403: the unscoped name `dolly` belongs to an unrelated package (owner brianchirls, v0.0.3, 2022). The user chose `@dlrm/dolly`. The bin stays `dolly` (plus the `dollie` alias).

## Changes
- package.json: name `@dlrm/dolly`, `publishConfig.access: public` (scoped packages default to restricted, so a plain `npm publish` would fail without it).
- src/core/pkg.ts: exports `PKG_NAME`, read from package.json like VERSION, falling back to `@dlrm/dolly`.
- src/core/update.ts: `latestFromNpm(PKG_NAME)`. Before this it queried `dolly`, got back the stranger's 0.0.3, never fell back to git tags, so npm-installed users never saw an update notice. The registry accepts `/@scope/name/latest` with a literal slash (checked against @types/node).
- src/core/selfupdate.ts: a package install now updates with `npm install -g @dlrm/dolly@latest` instead of `github:<slug>` (that installed unreleased main). Dropped the now-unused repoSlug import there.
- src/core/store.ts: the generated store README says `npm i -g @dlrm/dolly` (it used to say `npm i -g dolly`, which installs the wrong package). Existing stores keep the old line, because the README is only written when it is missing. This repo's .dolly/README.md still has it.
- README: npm install is now the first option, GitHub second.
- .claude-plugin/plugin.json and package-lock synced to 1.0.0 (the user's bump had broken the "plugin.json version matches package.json" test).

## Still blocking publish
The npm scope `@dlrm` does not exist yet (`npm org ls dlrm` → Scope not found). The user must create the org `dlrm` at npmjs.com/org/create (free for public packages) while logged in as deliriumvt. Then `npm publish`.
<!-- /dolly:step 0001-nick-delirium -->

<!-- dolly:step 0002-nick-delirium -->
## 0002 · 2026-11-20T10:38:16Z · @nick-delirium

- task status: validating
- files: `.claude-plugin/plugin.json`, `README.md`, `package-lock.json`, `package.json`, `src/core/pkg.ts`, `src/core/selfupdate.ts`, `src/core/store.ts`, `src/core/update.ts`, `tests/update.test.mjs`

## Outcome
Pre-release snapshots ship via the npm `next` dist-tag (user's choice), not via `npm i -g github:`.

## Why not GitHub installs (verified, npm 11.6.2)
npm exports every non-default CLI config to child envs (@npmcli/config set-envs.js; only if-present/workspace* are exempt), so `-g` leaks as npm_config_global=true into the nested `npm install` pacote runs in the git clone (pacote/lib/git.js:185). Effects: devDeps never installed (tsc fails on node types); the nested install links the temp clone into the global prefix and the outer install extracts through it, leaving a dangling bin; a reinstall fails with ENOTEMPTY as both processes retire the same dir. Workarounds in a build script got the first install working but not reinstalls, and depended on npm internals — dropped.

## Design
- InstallKind stays 'clone' | 'package'. A package install's channel = channelOf(version): prerelease → `next`, else `latest` (npm records nowhere which tag/source a global package came from).
- `dolly update`: `npm install -g @dlrm/dolly@<channel>`; update check fetches registry.npmjs.org/@dlrm/dolly/<channel>.
- cmpSemver now does real semver prerelease ordering (was: prereleases sort as base, which would hide every new snapshot from `next` users).
- bin paths normalized to `dist/cli.js` (npm publish printed a misleading "script name ... was invalid and removed" for `./dist/cli.js`; it only normalizes).
- README: npm + @next install, migration note (old `dolly` registration → EEXIST; `npm uninstall -g dolly` first), release steps incl. moving `next` up to each release.

## Verified
- Old `dolly` installed → installing `@dlrm/dolly` fails EEXIST (registry or git); after `npm uninstall -g dolly` it works.
- Release and next tarballs in a temp prefix: switching either way is "changed 1 package"; update plan follows the version.
- npm pack --dry-run: @dlrm/dolly@1.0.0, 53 files, no warnings. npm refuses a prerelease publish without --tag (publish.js:122).
- 363/363 tests.

## Next
User: `npm uninstall -g dolly` (their global is an `npm link` registered as `dolly`), then `npm link` or install the published package; `npm publish`.
<!-- /dolly:step 0002-nick-delirium -->
