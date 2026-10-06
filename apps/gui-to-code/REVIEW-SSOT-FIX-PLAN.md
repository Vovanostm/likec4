# GUI-to-code SSOT remediation plan

Status: plan only; no product-code changes are included in this document.

This plan follows the findings and evidence in
[`REVIEW-SSOT-RESEARCH.md`](./REVIEW-SSOT-RESEARCH.md). It is intentionally
ordered around ownership and data-integrity contracts: fix the durable state
boundary first, then make source identity explicit, then repair user-facing
recovery and history behavior. The implementation must not broaden the
legacy brace/string prototype while these contracts are being repaired.

## 1. Target contract

### One owner per concern

| Concern                 | Sole owner                                 | Derived consumers                                        | Must not own a competing copy                |
| ----------------------- | ------------------------------------------ | -------------------------------------------------------- | -------------------------------------------- |
| Semantic source files   | `EditorWorkspace.committedSources`         | compiler, tree, inspector, DSL preview, canvas           | React state, `document.ts`, XYFlow state     |
| In-progress source edit | `EditorWorkspace.draftSources`             | code editor and diagnostics                              | `localStorage`, a second string reducer      |
| Entry document          | `EditorWorkspaceState.entryDocumentUri`    | code editor, default document planners, DSL export label | sorted source order or `model.c4` constant   |
| Revision/history        | `EditorWorkspace.revision` and `history`   | stale guards, Undo/Redo, persistence envelope            | hydration default `0`, browser timestamps    |
| Durable workspace       | IndexedDB active record plus backup record | hydration, save status, conflict UI                      | source/layout `localStorage` keys            |
| Manual geometry         | `manualLayouts` and standard snapshots     | diagram renderer and layout controls                     | semantic source, an independent XYFlow graph |
| Conflict state          | durable hook/runtime status                | banner, reload/export actions, command gating            | repeated blind saves                         |

### State invariants

1. Every accepted semantic or layout mutation has one source/layout candidate,
   one compile/verification step, one revision increment, and at most one
   history entry.
2. An invalid candidate changes neither committed sources nor the last valid
   rendered model. The editable invalid draft and diagnostics remain visible.
3. A byte-identical candidate is a no-op: it does not increment revision,
   append history, clear redo, or trigger a durable write.
4. Hydration preserves the persisted `revision`, `workspaceId`, source set,
   entry URI, and snapshots. Hydration itself is not an edit.
5. A save conflict never overwrites the newer durable workspace and never
   retries indefinitely with the same stale expected revision.
6. Source order is presentation/determinism only. It cannot change the entry
   document or semantic identity.
7. ZIP import is a validated replacement transaction. Failure leaves the
   active workspace, backup, history, and rendered model unchanged.

## 2. Decisions to freeze before coding

### D1 — close the source-edit decision honestly

`DG-01` currently says `blocked`, but the active path already calls
`language-services-adapter.ts`, whose public planner calls are source
preserving and are covered by focused tests. The first work item should not
invent another editor. It should:

1. run the existing add/rename/remove/comment-preservation spike against the
   current HEAD;
2. record the adapter as the accepted app-local owner if the spike passes;
3. update `decisions/DG-01-source-edit-owner.md` to `accepted`, with exact
   test commands and limitations; or leave it blocked and mark the current
   production CRUD path as an explicit contract violation if the spike fails;
4. remove `src/editor-state.ts` and `src/document.ts` from the runtime path
   only after the accepted owner is recorded.

The legacy `document.ts` functions may remain temporarily for historical tests
or a separately named spike, but they must not be imported by application
runtime code. `document.ts` must not gain rename, remove, multi-file, or
source-map behavior.

### D2 — persistence revision semantics

Use one monotonic workspace revision for accepted user-visible mutations.
Compiler request sequencing may remain internal, but it must not reset or
replace the workspace revision. A restored envelope with revision `N` creates
an `EditorWorkspace` at revision `N`; it does not create revision `0` and then
rewrite the envelope.

### D3 — conflict policy

Use fail-closed optimistic concurrency. On conflict:

- stop automatic saves and disable semantic mutations;
- read and validate the latest durable envelope once;
- offer `Reload latest` and `Export my local workspace`;
- do not attempt a generic text merge or silent last-write-wins;
- after reload, begin a fresh local history at the latest durable revision.

This is appropriate for source-preserving semantic edits because a line merge
can invalidate FQNs, relation occurrences, views, and snapshots together.

### D4 — ZIP scope

Immediate safe contract: ZIP is authoritative for source files, entry
metadata, and `.likec4/*.likec4.snap`; config/library/style files are not
claimed as independently authored unless they are represented and validated
as first-class workspace files.

The current `SPEC.md` promise for `config` and `likec4lib` must therefore take
one of two explicit paths:

- preferred for this repair: narrow the v1 promise to the implemented source
  and snapshot roles and create a follow-up work package for auxiliary files;
- only if product scope requires it now: introduce a typed `WorkspaceFile`
  role (`source`, `config`, `library`, `style`) with byte-preserving storage,
  manifest validation, compiler inclusion rules, and round-trip tests.

No implementation should silently accept an undeclared role.

## 3. Ordered work packages

The following order is a dependency graph, not a suggestion to parallelize
contract edits. Parallel work is allowed only for disjoint tests after the
interfaces in `contracts.ts` are frozen.

```text
WP-A contract freeze / DG-01
  ├──> WP-B IndexedDB revision + backup + migration
  │       └──> WP-C hydration and save state machine
  ├──> WP-D entry URI + multi-file mutation path
  │       └──> WP-E export/import scope alignment
  ├──> WP-F no-op transaction/history guard
  └──> WP-G remove legacy runtime owner

WP-C + WP-D + WP-F + WP-G
  └──> WP-H browser/multi-tab/ZIP acceptance
          └──> WP-I status/docs/ast-grep closeout
```

### WP-A — contract freeze and decision-gate reconciliation

Files:

- `apps/gui-to-code/src/editor/contracts.ts`
- `apps/gui-to-code/decisions/DG-01-source-edit-owner.md`
- `apps/gui-to-code/tasks/WP-13-ssot-remediation.md` (new task packet)
- `apps/gui-to-code/SPEC.md` only for agreed contract corrections

Changes:

- add `entryDocumentUri: string` to `EditorWorkspaceState` and every persisted
  snapshot boundary;
- define a typed hydration result that distinguishes `empty`, `loaded`,
  `recovered-from-backup`, and `invalid-storage`;
- define explicit conflict/recovery state rather than representing it as a
  generic command error;
- decide whether no-op is a first-class `CommandResult` status or a stable
  `applied` result with unchanged revision. Prefer `noop` for observability
  and UI correctness;
- keep `SourceFile` immutable and preserve all source URIs in every mutation
  API;
- remove the duplicate `'invalid-operation'` union member while touching the
  contract, with a typecheck proving no behavior change.

Exit criteria:

- `DG-01` is either accepted with executable proof or the active CRUD path is
  explicitly blocked;
- a task packet names bounded write scope, non-goals, checks, and stop
  conditions;
- no code path is allowed to infer entry identity from source sorting.

### WP-B — IndexedDB revision, backup, and migration

Files:

- `apps/gui-to-code/src/editor/indexeddb-workspace.ts`
- `apps/gui-to-code/src/editor/persisted-workspace.ts`
- new `apps/gui-to-code/src/editor/indexeddb-workspace.spec.ts`
- new migration tests beside `persisted-workspace.spec.ts`

Implementation:

1. Bump the IndexedDB database version and add a `backup` record in the same
   object store, or use a dedicated backup store if that makes migration
   clearer. Keep the schema version in the envelope independent from the
   database version.
2. Change `save` to perform one read/write transaction:
   read `active`, validate the expected revision, write the old valid active
   envelope to `backup`, then write the new envelope to `active`. Abort on
   mismatch before either write.
3. Make `replace` use the same backup-before-active transaction. Imports and
   recovery must not destroy the previous valid envelope.
4. On load, validate `active`; if it is invalid, validate `backup` and return a
   recovery result without replacing active until the user accepts recovery.
5. Add an explicit migration from schema v1. Preserve v1 metadata when valid;
   do not infer `entryDocumentUri` from the sorted list. If old data lacks an
   entry, use the documented one-time fallback and mark the result as migrated
   so it is visible in diagnostics.
6. Close the database only after transaction completion/error handling. Keep
   validation outside business/UI code.

Important transaction rule: `transaction.abort()` followed by an immediate
return must not be treated as a successful transaction by callers. Return a
typed conflict result after the transaction has settled or use a transaction
local decision that performs no writes and then completes normally.

Tests:

- first save with expected `null`;
- save at revisions 1 → 2 preserves backup revision 1;
- stale and conflicting saves leave both records unchanged;
- `replace` preserves the previous active record as backup;
- corrupted active recovers from valid backup;
- corrupted active and backup fail closed without replacing either;
- upgrade from v1 preserves sources, metadata, and revision;
- browser reload hydrates revision `N`, not `0`.

### WP-C — hydration and save state machine

Files:

- `apps/gui-to-code/src/editor/workspace.ts`
- `apps/gui-to-code/src/editor/use-durable-workspace.ts`
- `apps/gui-to-code/src/App.tsx`
- focused hook/runtime tests and Playwright fixtures

Implementation:

- extend `EditorWorkspace.create` with an options object containing
  `revision`, `entryDocumentUri`, and `manualLayouts`; compile the initial
  candidate at the supplied workspace revision and initialize empty history;
- replace the hydration call that passes only `envelope.sources` with the
  options-aware constructor;
- set `durableRevision.current` to the loaded envelope revision; do not call
  `persistFreshWorkspace(candidate.state)` merely because hydration completed;
- write only when a real accepted revision differs from the durable revision;
- if no durable workspace exists, persist the starter envelope once with its
  explicit default entry URI;
- make hydration cancellation safe: a cancelled effect must not persist, swap
  the workspace ref, or change the visible recovery state;
- isolate compile sequence IDs from persisted workspace revision if the
  compiler still needs independent stale-response protection.

Save-state model:

```text
loading -> ready -> saving -> saved
                 \-> conflict -> resolving -> ready
                 \-> error (retry/export remains available)
```

The UI must disable semantic actions in `loading` and `conflict`, while still
allowing export of the local committed workspace and a recovery action.

### WP-D — explicit entry URI and complete multi-file edits

Files:

- `apps/gui-to-code/src/editor/contracts.ts`
- `apps/gui-to-code/src/editor/workspace.ts`
- `apps/gui-to-code/src/editor/persisted-workspace.ts`
- `apps/gui-to-code/src/editor/use-workspace-runtime.ts`
- `apps/gui-to-code/src/editor/use-semantic-editor.ts`
- `apps/gui-to-code/src/editor/use-wp06-runtime.ts`
- `apps/gui-to-code/src/editor/language-services-adapter.ts`
- related workspace and source-edit tests

Implementation:

1. Persist `entryDocumentUri` in the workspace state. `envelopeFromState`
   copies that exact value; it may sort sources for deterministic serialization
   but must never choose `sources[0]`.
2. Validate that the entry URI is present exactly once in the source set and
   is a safe relative path. Preserve case-sensitive identity while retaining
   the existing case-collision protection for paths.
3. Replace `workspaceDocumentUri` as a runtime mutation target with
   `current.state.entryDocumentUri`. Keep `model.c4` only as a starter default
   and filename fallback where the user has not imported a workspace.
4. Make code-editor updates map over the complete `draftSources`, replacing
   only the entry URI. All other source files and their bytes remain unchanged.
5. Centralize default planner targeting in one helper. Any command with no
   explicit document URI receives the current entry URI at the workspace
   boundary, not from a UI-local constant.
6. Ensure imports, reload, source export, and ZIP export retain the same entry
   URI. Display the actual entry filename in the export control rather than
   always saying `model.c4`.
7. Add tests with `z.c4` as entry and `a.c4` as another file; sorted output
   must still retain `z.c4` as the editor and planner target.

Do not solve this by concatenating files or generating a new canonical
`model.c4`. The candidate source array is the unit passed to the compiler and
document layer.

### WP-E — align ZIP contract and codec

Files:

- `apps/gui-to-code/src/editor/workspace-bundle.ts`
- `apps/gui-to-code/src/editor/zip-store.ts`
- `apps/gui-to-code/src/editor/persisted-workspace.spec.ts`
- `apps/gui-to-code/README.md`, `SPEC.md`, and the roadmap status artifact

Immediate implementation (recommended):

- keep manifest roles limited to `source` and `manual-layout`;
- validate that every manifest path is represented exactly once and that the
  manifest entry URI is a declared source;
- keep deterministic ordering and store-only encoding;
- update the spec/README to say that config/library/style authoring is not
  supported and is not independently represented by v1 ZIP.

Follow-up implementation if auxiliary files are required:

- introduce `WorkspaceFile` with an explicit role and byte content;
- define which roles enter `fromSources`, which are pass-through only, and
  which are rejected by the editor;
- include the role in `workspace.json`, reject unknown roles, and enforce the
  same path, duplicate, compression, CRC, count, and byte limits;
- test source/config/library/style round trips without canonical regeneration.

Acceptance tests for the immediate contract:

- multi-file source and entry URI round trip;
- snapshots round trip and remain associated with their view IDs;
- undeclared, duplicate, case-collision, traversal, CRC, compression, and
  oversized entries fail before workspace replacement;
- invalid imported DSL leaves active state and backup unchanged.

### WP-F — no-op commit and history guard

Files:

- `apps/gui-to-code/src/editor/workspace.ts`
- `apps/gui-to-code/src/editor/workspace.spec.ts`
- `apps/gui-to-code/src/editor/wp06-workspace.spec.ts`
- `apps/gui-to-code/src/editor/workspace-wp05.spec.ts`

Add pure equality helpers for source arrays and manual-layout snapshots. The
comparison must cover URI order-independent identity, content bytes, snapshot
keys, and snapshot values. Normalize only where the persistence contract says
normalization is valid; do not trim or reformat DSL to decide equality.

Before `commitCandidate` or the draft valid-commit branch:

```text
candidate sources/layouts equal current
  -> return noop / keep revision, history, future, and durable dirty state
candidate differs and compiles/ verifies
  -> commit once, revision + 1, one history entry, clear future
candidate invalid
  -> retain committed and last-valid model; expose draft diagnostics
```

Cover repeated identical textarea input, restore-already-clean example,
identical layout save, rejected invalid edit after a valid edit, and Undo/Redo
after a no-op. Browser acceptance must assert that Undo remains disabled after
the clean restore case.

### WP-G — remove the legacy semantic owner

Files:

- `apps/gui-to-code/src/editor-state.ts`
- `apps/gui-to-code/src/document.ts`
- `apps/gui-to-code/src/editor-state.spec.ts`
- any runtime imports found by `rg` and ast-grep

After WP-A proves the active source-preserving owner:

- remove runtime imports of `applyCommand` and the old `EditorRuntimeState`;
- migrate only tests that are still product behavior tests to
  `EditorWorkspace`/`EditorDocumentPort` tests;
- either delete the prototype or move it under a clearly named spike fixture
  excluded from application build and runtime rules;
- do not keep a second `source` state that can be mutated independently;
- update `DG-01` and the README architecture section to match the actual
  owner.

The exit condition is structural and behavioral: one runtime semantic path,
not merely “the old module is unused in the happy path.”

### WP-H — conflict recovery and browser proof

Files:

- `apps/gui-to-code/src/editor/use-durable-workspace.ts`
- `apps/gui-to-code/src/App.tsx`
- new persistence/runtime test doubles
- the GUI-to-code Playwright suite or its app-specific browser fixture

Add a recovery controller with these operations:

- `reloadLatest()`: load/validate latest, compile it in isolation, swap only
  after success, set durable revision, clear conflict, reset history;
- `exportLocal()`: export the current committed local envelope while keeping
  conflict state visible;
- `retrySave()`: allowed only after the user resolves or explicitly retries
  against the read-back durable revision.

When a conflict occurs, a second save must not be issued automatically. The
banner must identify the state in Russian and expose a keyboard-accessible
reload action. A stale local action must not mutate source, history, layouts,
or the durable record.

Browser scenarios:

1. Start with a nonzero revision, reload, and verify the revision and source
   survive without an extra Undo entry.
2. Open two tabs, commit in tab A, then commit in tab B from the old durable
   revision. Verify tab B enters conflict and does not overwrite A.
3. Reload latest in B; verify B renders A's source and exits conflict.
4. Export B's local content while conflicted; verify the archive is available
   and no write occurs.
5. Import invalid DSL and malformed ZIP; verify the previous valid canvas and
   IndexedDB active/backup records remain intact.
6. Edit a non-`model.c4` entry in a multi-file archive; verify only that file
   changes and the other file remains byte-identical.

`BroadcastChannel` may be used only as a notification/read-refresh hint. It
must not become durable state; every tab must read the authoritative IndexedDB
record before resolving a conflict.

### WP-I — status, docs, and structural guardrails

Files:

- `apps/gui-to-code/ROADMAP.STATUS.md`
- `apps/gui-to-code/README.md`
- `apps/gui-to-code/SPEC.md`
- `.ast-grep/rules/gui-to-code-ssot.yml`
- `.ast-grep/tests/**` (new fixtures)
- `package.json` and `pnpm-lock.yaml` if the CLI becomes a devDependency

Status correction:

- replace the static “current branch” claim with `last_verified_commit` and
  `last_verified_at`, or generate the status artifact from a checked-out
  commit during release verification;
- retain historical PR/merge references as historical facts;
- do not mark a work package complete from a stale status file alone.

Ast-grep guardrails:

- pin `@ast-grep/cli` as a repository devDependency and invoke the local
  binary; avoid an `npx --yes` network/cache dependency in CI;
- keep the four existing warning rules narrow and add positive/negative
  `ast-grep test` fixtures;
- add warning rules for `model.c4` literals in runtime mutation paths,
  `sources[0]` as entry selection, and direct persistence writes outside the
  IndexedDB adapter;
- do not flag the starter default, test fixtures, or the persistence adapter
  itself without a documented exception;
- make CI run both rule tests and the repository scan, and document whether
  warnings are informational or fail the gate.

## 4. Best-practice mapping from web research

The sources below are linked in the research artifact and should be reviewed
again when implementation begins because browser APIs and ast-grep CLI
packaging can change.

| Finding                      | Applicable practice                                                                                           | How it changes this plan                                                                                             | Source                                                                                                                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Competing persistence owners | Keep one authoritative durable store; use IndexedDB transactions and close the database after work completes. | Remove source/layout `localStorage`; put active/backup writes in one transaction.                                    | [MDN Using IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API/Using_IndexedDB), [MDN IDBTransaction](https://developer.mozilla.org/en-US/docs/Web/API/IDBTransaction)                                        |
| Hydration and backup loss    | Treat durable writes as atomic and preserve a recoverable prior value before replacement.                     | Read/validate first; backup-before-active in the same read/write transaction; never hydrate by rewriting revision 0. | [web.dev IndexedDB best practices](https://web.dev/articles/indexeddb-best-practices)                                                                                                                                               |
| Multi-tab conflicts          | Broadcast invalidation, not state; read authoritative state before acting.                                    | Optional `BroadcastChannel` only wakes a refresh; conflict resolution always reads IndexedDB.                        | [MDN BroadcastChannel](https://developer.mozilla.org/en-US/docs/Web/API/BroadcastChannel)                                                                                                                                           |
| Candidate source edits       | LSP-style document identity and versioning must be explicit; stale results are discarded.                     | Carry URI and revision through the workspace, compiler, planner, and persistence envelope.                           | [LSP 3.17 specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)                                                                                                               |
| ZIP import                   | Validate names, roles, sizes, and content before writing or extracting into an active workspace.              | Keep allowlisted manifest roles, path/collision/size/CRC checks, isolated compile, then replacement.                 | [OWASP Unrestricted File Upload](https://owasp.org/www-community/vulnerabilities/Unrestricted_File_Upload)                                                                                                                          |
| Structural SSOT rules        | Put project config in `sgconfig.yml`, keep YAML rules narrow, and test rules with fixtures.                   | Lock the CLI, add positive/negative tests, and treat exceptions as explicit contract decisions.                      | [ast-grep project configuration](https://ast-grep.github.io/reference/sgconfig.html), [ast-grep YAML rules](https://ast-grep.github.io/reference/yaml.html), [ast-grep test rules](https://ast-grep.github.io/guide/test-rule.html) |

These references justify the boundaries; they do not prove this application is
correct. Application-specific tests and browser evidence remain required.

## 5. Verification matrix

### Static and unit checks

Run from the repository root after each contract-bearing slice:

```bash
pnpm generate
pnpm exec tsc --build
pnpm typecheck:all
pnpm test --no-typecheck -- apps/gui-to-code/src/editor
pnpm lint:ast-grep
ast-grep test .ast-grep/tests
git diff --check
```

Use the app's actual package scripts if the app-specific test command is
different. Do not treat a green static command as browser persistence proof.

### Required focused tests

| Area               | Required proof                                                                                 |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| State construction | persisted revision/entry URI are retained; history starts empty                                |
| Draft compiler     | stale replies ignored; invalid draft preserves last valid model; all source files preserved    |
| No-op              | identical source/layout does not create revision/history or save                               |
| Document owner     | add/rename/remove preserve neighboring comments and use the accepted adapter                   |
| IndexedDB          | optimistic compare-and-swap, backup transaction, migration, corrupt-active recovery            |
| Conflict           | read latest, block repeated stale save, reload or export recovery                              |
| ZIP                | deterministic valid round trip, role/path/CRC/size/collision rejection, no partial replacement |
| AST-grep           | each rule has positive and negative fixtures; scan catches a new forbidden owner               |

### Browser acceptance

The final gate must exercise the built dev app through a real browser and
record:

- URL and checked-out commit;
- starter and imported multi-file fixture identity;
- visible entry filename and source content;
- revision before/after reload;
- Undo state after a no-op;
- two-tab conflict and recovery result;
- ZIP entry list and round-trip content hashes;
- console/page errors.

The dev-server “it starts” check is necessary but insufficient: it does not
prove IndexedDB transaction behavior, multi-tab conflict handling, or that the
canvas remains on the last valid model after invalid input.

## 6. Rollback and stop conditions

### Safe rollout sequence

1. Land tests and pure envelope/equality helpers before changing hydration.
2. Land the IndexedDB schema migration with backward-compatible read support.
3. Enable new hydration and conflict UI behind the existing app path only after
   migration tests pass.
4. Remove localStorage reads/writes only after IndexedDB starter and reload
   browser tests pass.
5. Remove the legacy runtime owner only after DG-01 evidence is recorded.
6. Change docs/status last, after current-head verification.

### Rollback triggers

Stop and retain the previous code path for investigation if any of the
following occurs:

- an existing valid v1 envelope cannot be read without data loss;
- a failed save changes active or backup unexpectedly;
- an imported workspace changes entry identity after a sort/reload;
- an invalid candidate changes the rendered model or history;
- two tabs can both report `saved` after one has overwritten a newer revision;
- a structural rule flags supported test fixtures without a deliberate
  exception;
- browser proof cannot identify the served checkout/fixture.

Rollback must be code/version rollback or a tested migration fallback. Do not
delete the IndexedDB database as a routine “fix”; offer export/recovery first.

## 7. Definition of done

The remediation is complete only when all of the following are true:

- one runtime semantic owner is proven and `DG-01` matches reality;
- localStorage is absent from the active workspace source/layout path;
- hydration preserves revision, entry URI, all files, and layouts;
- active plus backup persistence is atomic and migration-tested;
- conflict recovery is explicit, fail-closed, and browser-tested in two tabs;
- code editing and semantic commands preserve imported multi-file workspaces;
- no-op edits do not pollute history or durable saves;
- ZIP promises match the implemented role schema;
- roadmap status identifies the commit it actually verifies;
- ast-grep scan and fixture tests run from the locked project toolchain;
- focused tests, typecheck/build, and browser acceptance pass on the same
  checked-out commit.
