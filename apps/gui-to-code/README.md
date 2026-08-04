# LikeC4 GUI-to-code

`@likec4/gui-to-code` is a private browser semantic editor for LikeC4. It edits committed LikeC4 sources through `EditorWorkspace`, renders derived models in real time and exposes Russian user-facing UX and accessibility labels.

## Current behavior

The WP-07 editor supports:

- source-preserving logical element, relation and static-view workflows;
- source-preserving dynamic views and directed dynamic steps;
- deployment views, nodes, named `instanceOf` references and deployment relations;
- standard `.likec4/<view>.likec4.snap` manual layouts with shared Undo/Redo history;
- automatic recovery of the last valid workspace after a full browser reload;
- atomic IndexedDB persistence of committed sources, manual layouts and versioned workspace metadata;
- transactional import of one `.c4` file without replacing the active workspace when compilation fails;
- deterministic export of the current source as `model.c4`;
- transactional import and export of a portable workspace ZIP containing `workspace.json`, source files and manual-layout snapshots;
- path traversal, duplicate path, unsupported version, checksum, entry count and uncompressed-size protection for ZIP imports;
- explicit confirmation before destructive workspace replacement;
- revision-aware save conflict handling and stale-completion rejection;
- safe recovery when durable data is corrupt or unsupported.

Selection, open dialogs, focus, connection mode, diagnostics, compiled models and rendered diagram nodes are derived or transient and are not persisted.

## Durable workspace format

The IndexedDB record uses schema `likec4.gui-to-code.workspace`, version `1`:

```text
workspace envelope
├── workspaceId
├── revision / savedAt
├── committed source files
├── manual layout snapshots
└── entry document metadata
```

The portable ZIP uses the same semantic payload through an authoritative `workspace.json` manifest. Sources and snapshots are preserved exactly. The archive codec emits deterministic store-only ZIP entries; unsupported compression is rejected instead of silently misreading data.

Import is a replacement transaction:

```text
read input
→ validate size, version and paths
→ construct isolated candidate workspace
→ compile and verify candidate
→ persist candidate atomically
→ replace active EditorWorkspace
```

A failed `.c4` or ZIP import leaves the active and durable workspace unchanged. Successful replacement intentionally starts a new Undo/Redo history.

## Architecture

- `EditorWorkspace` remains the sole semantic owner of sources, layouts, revision, compilation state and history.
- `src/editor/persisted-workspace.ts` owns the versioned serializable envelope and validation boundary.
- `src/editor/indexeddb-workspace.ts` owns the atomic IndexedDB port and optimistic revision checks.
- `src/editor/workspace-bundle.ts` owns manifest mapping; it does not compile or become a semantic model.
- `src/editor/zip-store.ts` owns bounded deterministic ZIP encoding/decoding.
- `src/editor/use-durable-workspace.ts` coordinates hydration, queued durable saves and isolated transactional replacement.
- React components never persist an independent semantic graph or compiled model.
- LikeC4 DSL remains the persisted semantic source of truth. Canonical DSL generation remains a separate, potentially lossy operation.

The target contract is in [SPEC.md](./SPEC.md). Stable work packages and managed state are in [ROADMAP.md](./ROADMAP.md) and [ROADMAP.STATUS.md](./ROADMAP.STATUS.md).

## Verification

```bash
pnpm --filter @likec4/language-services test -- DocumentEditService
pnpm --filter @likec4/language-services typecheck
pnpm --filter @likec4/style-preset sources
pnpm --filter @likec4/styles sources
pnpm --filter @likec4/styles emit-pkg
pnpm --filter @likec4/language-server generate
pnpm --filter @likec4/layouts generate
pnpm --filter @likec4/gui-to-code generate
pnpm --filter @likec4/gui-to-code typecheck
pnpm --filter @likec4/gui-to-code test
pnpm --filter @likec4/gui-to-code build
pnpm --filter @likec4/gui-to-code smoke:start
pnpm run pretest:e2e
pnpm install --no-lockfile
pnpm install:chromium
pnpm exec playwright test -c playwright.gui-to-code.config.ts
pnpm check:agent-instructions
git diff --check
```
