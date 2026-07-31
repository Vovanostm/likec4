# LikeC4 GUI-to-code

`@likec4/gui-to-code` is a private, browser-only semantic editor for LikeC4. It edits canonical LikeC4 source and renders the result in real time. The user-facing interface and accessibility labels are in Russian; LikeC4 DSL and technical diagnostics remain in their canonical language.

## Current behavior

The WP-04 vertical slice supports:

- importing one `.c4` source file, editing it directly, and exporting the exact current text as `model.c4`;
- preserving the visible source draft in browser `localStorage` under the existing versioned key;
- creating root actors, systems and components through the canvas-first tool path;
- creating one directed logical relation by dragging an explicit source handle or using the accessible source/target chooser;
- selecting one logical element from the canvas or recursive «Структура» tree and keeping tree, diagram focus and inspector synchronized;
- editing element title, description, technology and specification-backed tags in one atomic `element.patch` command;
- moving an element and its complete subtree between root and parent scopes;
- changing one local element ID while remapping the target subtree and typed semantic references;
- inspecting removal dependencies before mutation and requiring an exact, revision-bound dependency approval;
- removing an element, its subtree and approved removable dependencies in one atomic history entry;
- restoring byte-exact previous and future source snapshots with compile-before-restore Undo and Redo;
- using `Ctrl/Cmd+Z`, `Ctrl/Cmd+Shift+Z`, Delete/Backspace, Escape and keyboard-accessible tree/confirmation controls;
- preserving the last valid rendered model while a direct edit or import is invalid;
- rejecting stale or unverifiable operations without mutating committed semantic state.

The current package does not yet implement relation metadata/update/remove, style editing, view CRUD, deployment or dynamic CRUD, manual layout, persistence migration, multi-file UI, IndexedDB, ZIP import/export, backend collaboration or AI generation.

## Current architecture

- `EditorWorkspace` is the only runtime owner of committed sources, draft sources, workspace revision, compilation state, last-valid model and semantic history.
- LikeC4 DSL remains the persisted semantic representation. The compiled model and diagram are derived.
- Semantic changes enter through typed `EditorOperation` values carrying `expectedRevision`.
- Workspace dispatch, removal inspection, Undo and Redo share one serialization queue; concurrent same-revision actions cannot silently overwrite each other.
- `src/compiler.ts` is the revision-aware browser compiler boundary.
- `src/editor/language-services-adapter.ts` is the only app integration with `@likec4/language-services/browser`; React UI components do not apply source edits or compile.
- `DocumentEditService` produces AST/CST-backed, revision-bound edit plans for create, patch, move, subtree-safe rename and approved remove operations.
- A centralized typed-reference remapper updates semantic references without global string replacement.
- Selection and canvas tool state are transient React state and are not persisted or recorded in semantic history.
- `createCanvasIntentController` owns only transient gesture lifecycle. It does not edit LikeC4 source or record history.
- `@likec4/diagram` remains a derived renderer; `DiagramApi.focusOnElement` is used only for UI focus.
- `ViewChange` remains layout-only and is not used for semantic CRUD.

The target product and architecture live in [SPEC.md](./SPEC.md). Delivery order and managed state live in [ROADMAP.md](./ROADMAP.md) and [ROADMAP.STATUS.md](./ROADMAP.STATUS.md).

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
pnpm check:agent-instructions
git diff --check
```

`smoke:start` expects an existing production build and verifies only that Vite preview starts and serves the application root.
