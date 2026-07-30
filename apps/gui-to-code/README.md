# LikeC4 GUI-to-code

`@likec4/gui-to-code` is a private, browser-only semantic editor for LikeC4. It edits canonical LikeC4 source and renders the result in real time. The user-facing interface and accessibility labels are in Russian; LikeC4 DSL and technical diagnostics remain in their canonical language.

## Current behavior

The WP-02 vertical slice supports:

- importing one `.c4` source file, editing it directly, and exporting the exact current text as `model.c4`;
- preserving the visible source draft in browser `localStorage` under the existing versioned key;
- using the diagram as the primary workspace;
- activating creation tools for «Актор», «Система» and «Компонент»;
- creating one root element by canvas click or keyboard confirmation;
- allocating deterministic collision-free identifiers such as `actor`, `actor2` and `actor3`;
- applying source-preserving edits through `DocumentEditService.planAddElement`;
- compiling an isolated candidate before committing source, revision and model atomically;
- preserving the last valid rendered model while a direct edit or import is invalid;
- rejecting stale operations and ignoring stale asynchronous compilation responses;
- deriving available element kinds from the loaded LikeC4 specification.

The current package does not yet implement relation creation on canvas, nesting, rename/remove, inspector CRUD, view CRUD, product undo/redo controls, manual layout, multi-file UI, IndexedDB, ZIP import/export, backend collaboration or AI generation.

## Current architecture

- `EditorWorkspace` is the only runtime owner of committed sources, draft sources, workspace revision, compilation state, last-valid model and history foundation.
- LikeC4 DSL remains the persisted semantic representation. The compiled model and diagram are derived.
- Semantic changes enter through typed `EditorOperation` values carrying `expectedRevision`.
- Workspace operations are serialized; concurrent operations based on the same revision cannot silently overwrite each other.
- `src/compiler.ts` is the revision-aware browser compiler boundary.
- `src/editor/adapters/language-services.ts` owns the production integration with `@likec4/language-services/browser`.
- `DocumentEditService.planAddElement` and `applyDocumentTextEdits` produce and apply source-preserving candidate edits.
- `createCanvasIntentController` owns only transient gesture lifecycle. It does not allocate DSL identifiers or mutate workspace state.
- Canvas points, selection, focus and the active creation tool are transient UI state and are not persisted into the DSL.
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