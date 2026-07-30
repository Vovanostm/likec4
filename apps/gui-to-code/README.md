# LikeC4 GUI-to-code

`@likec4/gui-to-code` is a private, browser-only semantic editor for LikeC4. It edits canonical LikeC4 source and renders the result in real time. The user-facing interface and accessibility labels are in Russian; LikeC4 DSL and technical diagnostics remain in their canonical language.

## Current behavior

The first usable source-first vertical slice intentionally supports:

- importing one `.c4` source file, editing it directly, and exporting the exact current text as `model.c4`;
- preserving the source draft in browser `localStorage` under a versioned key;
- adding root elements, logical relations and scoped views through explicit forms;
- compiling with `@likec4/language-services/browser`, showing diagnostics, and rendering the first available view with `@likec4/diagram`;
- preserving the last valid rendered model while a direct edit or import is invalid;
- validating form-command candidates before committing them;
- ignoring stale asynchronous compilation responses.

Forms do not yet cover nested/deployment elements, rename/remove, undo/redo, manual-layout editing, multi-file workspaces, config/library authoring, IndexedDB, ZIP or snapshot export. Canvas-first semantic creation is not implemented yet.

## Current architecture

- The source string remains the WP-00 document owner and is the only persisted source of truth.
- `src/document.ts` applies the three append-only prototype commands to a candidate source string.
- `src/compiler.ts` is the only browser language-services boundary.
- `src/editor-state.ts` separates invalid draft updates from compile-before-commit semantic commands and preserves the last valid model.
- `src/spikes/` contains executable WP-01 decision proofs only; it is not connected to the production UI.

The target product and architecture live in [SPEC.md](./SPEC.md). Delivery order and managed state live in [ROADMAP.md](./ROADMAP.md).

## Verification

```bash
pnpm --filter @likec4/gui-to-code generate
pnpm --filter @likec4/gui-to-code typecheck
pnpm --filter @likec4/gui-to-code test
pnpm --filter @likec4/gui-to-code build
pnpm --filter @likec4/gui-to-code smoke:start
pnpm check:agent-instructions
git diff --check
```

`smoke:start` expects an existing production build and verifies only that Vite preview starts and serves the application root.
