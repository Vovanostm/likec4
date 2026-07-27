# LikeC4 GUI-to-code

`@likec4/gui-to-code` is a private, browser-only semantic editor for LikeC4. It edits canonical LikeC4 source and renders the result in real time.

## Current behavior

The first usable vertical slice is intentionally small:

- import one `.c4` source file, edit it directly, and export `model.c4`;
- preserve the source in browser `localStorage` under a versioned key;
- add root elements, logical relations and scoped views through explicit forms;
- compile with `@likec4/language-services/browser`, show diagnostics, and render the first available view with `@likec4/diagram`.

Any valid LikeC4 DSL construct can be edited in the source pane and receives the same parser diagnostics. Forms do not yet cover nested/deployment elements, rename/remove, manual-layout editing, multi-file workspaces, config/library authoring, IndexedDB, or ZIP/snapshot export. Those are target capabilities, not hidden alternative sources of truth.

## Current architecture

- `src/App.tsx` owns the current source string and transient form state.
- `src/document.ts` applies the three supported prototype commands to a candidate source string.
- `src/compiler.ts` is the only browser language-services boundary.
- A candidate form command is compiled before commit; direct source edits and imports may be invalid while the last valid model remains rendered.
- `localStorage` stores the current source draft, including an invalid draft. There is no workspace history, worker, IndexedDB, semantic canvas editing or snapshot persistence yet.

The target product and architecture live only in [SPEC.md](./SPEC.md). Delivery order, decision gates and agent work
packages live only in [ROADMAP.md](./ROADMAP.md). Do not copy target contracts back into this current-state README.

## Reference examples and verification

- Browser source loading: `packages/language-services/src/browser/index.ts`
- Builder round-trips: `packages/core/src/builder/Builder.fromParsed.spec.ts`
- Diagram integration: `packages/diagram/README.md`
- Existing layout editing: `packages/likec4-spa/src/pages/ViewEditor.tsx`

Before merging editor work, run focused generator/core tests plus:

```bash
pnpm --filter @likec4/gui-to-code generate
pnpm --filter @likec4/gui-to-code typecheck
pnpm --filter @likec4/gui-to-code build
pnpm check:agent-instructions
```
