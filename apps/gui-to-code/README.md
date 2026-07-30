# LikeC4 GUI-to-code

`@likec4/gui-to-code` is a private, browser-only semantic editor for LikeC4. It edits canonical LikeC4 source and renders the result in real time. The user-facing interface and accessibility labels are in Russian; LikeC4 DSL and technical diagnostics remain in their canonical language.

## Current behavior

The WP-03 vertical slice supports:

- importing one `.c4` source file, editing it directly, and exporting the exact current text as `model.c4`;
- preserving the visible source draft in browser `localStorage` under the existing versioned key;
- creating root actors, systems and components through the canvas-first tool path;
- creating one directed logical relation by dragging an explicit source handle to a target element;
- creating the same relation with an accessible source/target chooser through the same `CanvasIntent` and `EditorOperation` path;
- applying source-preserving, revision-bound element and relation edits through `DocumentEditService`;
- compiling an isolated candidate and verifying the actual created element or relation identity before commit;
- recording one history entry per successful semantic operation;
- restoring byte-exact previous source with one revision-guarded, compile-before-restore Undo;
- preserving the last valid rendered model while a direct edit or import is invalid;
- rejecting stale operations and stale Undo without mutating committed state.

The current package does not yet implement relation metadata, relation update/remove, nesting, rename/remove, inspector CRUD, view CRUD, Redo UI, manual layout, multi-file UI, IndexedDB, ZIP import/export, backend collaboration or AI generation.

## Current architecture

- `EditorWorkspace` is the only runtime owner of committed sources, draft sources, workspace revision, compilation state, last-valid model and semantic history.
- LikeC4 DSL remains the persisted semantic representation. The compiled model and diagram are derived.
- Semantic changes enter through typed `EditorOperation` values carrying `expectedRevision`.
- Workspace dispatch and Undo share one serialization queue; concurrent same-revision actions cannot silently overwrite each other.
- `src/compiler.ts` is the revision-aware browser compiler boundary.
- `src/editor/language-services-adapter.ts` owns the production integration with `@likec4/language-services/browser`.
- `DocumentEditService.planAddElement`, `DocumentEditService.planAddRelation` and `applyDocumentTextEdits` produce and apply AST/CST-backed source-preserving candidate edits.
- Relation identity is verified by the exact set difference between previous and candidate compiled relation IDs, followed by source/target direction validation.
- `createCanvasIntentController` owns only transient gesture lifecycle. It does not edit LikeC4 source or record history.
- `@likec4/diagram` exposes a backward-compatible optional logical `onConnect` callback; XYFlow never becomes a second semantic graph.
- `ViewChange` remains layout-only and is not used for semantic CRUD.

The target product and architecture live in [SPEC.md](./SPEC.md). Delivery order and managed state live in [ROADMAP.md](./ROADMAP.md) and [ROADMAP.STATUS.md](./ROADMAP.STATUS.md).

## Verification

```bash
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
pnpm check:agent-instructions
git diff --check
```

`smoke:start` expects an existing production build and verifies only that Vite preview starts and serves the application root.
