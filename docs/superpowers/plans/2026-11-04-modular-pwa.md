# Modular PWA and safer persistence implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Keep Liftlog's existing PWA experience while separating responsibilities and protecting saved workouts during failures and synchronization.

**Architecture:** Browser-native, individually scoped JavaScript modules expose explicit factories through `window.Liftlog`. The UI owns rendering and events; the domain owns workout calculations; storage owns validation, persistence and recovery; sync owns network reconciliation. Python emits content-versioned assets and an offline app shell. No runtime framework or package installation is needed.

**Tech Stack:** JavaScript, CSS, localStorage, existing Supabase client, Python build, Node tests, Playwright.

**Spec:** The user's approval in this conversation: implement the recommended PWA refactor and storage safeguards, verify, and push. Health data, watches and other native integrations are excluded. Framework replacement is not required.

## Global Constraints

- Preserve exercise IDs, records, routines, bookmarks, progression settings, elapsed-time behavior and existing JSON exports.
- Keep `liftlog.v1` readable; keep localStorage as primary storage in this release. A separate adapter permits a later IndexedDB migration when justified by measured volume/latency.
- Keep Supabase schema, RLS and deployed server configuration unchanged. Same-key conflict resolution remains last-write-wins; preserve a local recovery checkpoint before remote replacement.
- Do not publish success when local persistence or sync metadata persistence failed.
- Source changes happen in `src/`; `dist/` remains generated and ignored.
- Work in the current clean checkout; user authorized implementation and direct push to the verified current remote/branch. No extra approval or worktree is needed.

## Review Focus

- Corrupt, unsupported or unavailable browser storage must not be silently replaced by empty data.
- Storage quota failures and stale tabs must leave the last committed state intact.
- Edits during a network request must remain dirty and be retried; outgoing values must be immutable snapshots.
- Previously installed PWA versions and interrupted updates must not mix incompatible HTML and JS/CSS.
- Import, cloud replacement and destructive reset must have a readable recovery copy or fail before replacement.

### Task 1: Separate responsibilities and preserve behavior

**Files:** `src/app.html`, `src/styles.css`, `src/js/{catalog,artwork,domain,storage,sync,app}.js`, `build.py`, `scripts/build_artwork.py`, `tests/helpers/source.cjs`, existing Node/browser tests.

**Interfaces:** Catalog/artwork expose immutable reference data. `createDomain({getState, save})` exposes existing calculation functions. Storage and sync expose factories. App composes them without sharing private lexical state.

- [x] Add tests for the storage contract: valid legacy state, invalid state rejection, failed write preservation, recovery checkpoint, stale-tab detection.
- [x] Observe expected failures before implementing storage.
- [x] Extract CSS/reference data/domain/sync; adapt the test loader to execute local scripts in HTML order.
- [x] Build content-versioned scripts/styles and pre-cache the complete shell.
- [x] Run all existing tests and build; commit the verified refactor and storage adapter.

### Task 2: Integrate recovery and synchronization safeguards

**Files:** storage/sync/app modules, `tests/storage.test.cjs`, `tests/sync.test.cjs`, `tests/browser-smoke.cjs`, README.

**Interfaces:** Storage `load`, `save`, `backup`, `recover`, `raw`, and `writeJSON` return data or throw actionable errors. Sync flushes pending edits before pulling and snapshots uploads before awaiting; app displays durable storage warnings and exposes recovery/export actions.

- [x] Add failing regressions for pending edits during pull/push, storage failure blocking upload, malformed imports, and recovery.
- [x] Integrate guarded writes, safe replacement and recovery UI; preserve pending changes in sync.
- [x] Verify Node suite, browser flows in Chromium/WebKit, offline reload and old/new service-worker updates.
- [x] Update README with source map, storage limits, recovery and validation commands.
- [x] Commit; obtain an independent whole-change review, fix substantive findings and rerun affected checks.
- [ ] Push the verified commit to `origin/main` and check the resulting deployment. Remote freshness was verified before commit.

## Verification record

- Baseline: 32 Node tests passed at `799f940`.
- Final: 49 Node tests passed, Python build passed, all app JavaScript syntax checks passed, `git diff --check` clean.
- Chromium and WebKit: 28 browser scenarios passed, including existing UI, legacy records, offline reload, corrupt-data recovery, quota retry, stale tabs, stalled SDK and interrupted/successful service-worker updates.
- Artwork regeneration produced identical bytes.
- Independent review found two regressions: stale modal references on unrelated sync and parser-blocking CDN startup. Both were reproduced/addressed and re-reviewed without remaining critical introduced findings.
- A final build regression test proves worker-only and icon-only changes create a new release cache; repeated builds are deterministic.
- No live Supabase account or physical iPhone was used. Server schema, health and watch integrations are unchanged.

Implementation followed the approved scope in the current clean checkout. Storage remained localStorage as explained during implementation; the new adapter isolates a future measured migration. Task commits were combined so the refactor and its storage integration ship as one verified release.
