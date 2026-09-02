# WP-13 Professional Editing Discovery

Baseline: `7cedbbe182f834a8a589ef6e84535cf76301f4a7`  
Date: 2026-09-02  
Scope: `apps/gui-to-code/**` first; owning packages only for proven public-contract gaps.

## Authority and invariants

The audit was performed against `AGENTS.md`, `apps/gui-to-code/AGENTS.md`, `README.md`, `SPEC.md`, `ROADMAP.md`, `ROADMAP.STATUS.md`, the WP-12 implementation, and the current public editor contracts.

The following boundaries remain unchanged:

- LikeC4 DSL/source files are the canonical semantic state.
- `EditorWorkspace` is the only semantic/layout/history transaction owner.
- semantic writes are source-preserving and compile-before-commit.
- renderer/React state owns gestures, focus, menus and selection only.
- semantic identity is parser/compiler-owned; endpoint-only or title-only mutation is forbidden.
- manual geometry persists only as standard `ViewManualLayoutSnapshot` data.
- unsupported or ambiguous rewrites fail closed.

## Current architecture facts

- `ElementInspector` already edits title, description, technology and tags and supports exact FQN display, local-ID rename, parent move and dependency-inspected removal.
- logical, dynamic and deployment edges are canvas-selectable and have exact title patch/remove flows with revision/view stale guards.
- direct existing→existing authoring exists for logical relations, dynamic steps and deployment relations.
- double-click empty canvas and toolbar creation exist; existing→empty creates logical element + title + relation + manual position atomically.
- static view creation/selection and manual layout drag/reset already exist.
- dynamic/deployment view and entity creation already exist through the WP-06 domain layer.
- `EditorOperation` currently admits one semantic command and optionally one layout command. There is deliberately no generic semantic command batch. Therefore clipboard subgraph paste, duplicate-many and multi-delete require dedicated atomic domain contracts rather than dispatching N existing commands.
- UI currently has only single semantic selection. `Shift+F10` is a keyboard fallback to inspector/connection tools, not a true context menu.
- creation kinds are derived from the specification inside `useSemanticEditor`, but `App.tsx` exposes only hard-coded actor/system/component buttons.

## Capability matrix

| Capability | DSL supports | Language/source layer | Workspace command | Canvas/UI | Action |
| --- | --- | --- | --- | --- | --- |
| element title | yes | yes | yes | yes | REUSE |
| element description | yes | yes | yes | yes | REUSE |
| element technology | yes | yes | yes | yes | REUSE |
| element tags | yes | yes | yes | yes | REUSE |
| element identifier/FQN rename | yes | yes | yes | yes | REUSE |
| element parent/scope move | yes | yes | yes | yes | REUSE |
| element kind conversion | grammar yes | no proven safe conversion planner | no | no | UNSAFE_OR_UNSUPPORTED |
| element icon/style instance properties | DSL supports styling concepts | no proven app edit planner | no | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| relation title | yes | yes | yes | yes | REUSE |
| relation exact duplicate identity | yes | yes | yes | yes | REUSE |
| relation technology/tags/style | DSL supports richer relation metadata | no current app planner beyond title | title-only | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| relation rewire source/target | semantically expressible | no proven exact rewire planner | no | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| static view create/select | yes | yes | yes | yes | REUSE |
| static view title/metadata patch | yes | create-only app planner today | no patch command | limited | EXTEND_EXISTING |
| static view remove/duplicate | yes | no audited exact planner | no dedicated command | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| static view include/exclude/rules | yes | no audited app planner | no | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| dynamic view create | yes | yes | yes | yes | REUSE |
| dynamic standalone step patch/remove | yes | yes | yes | yes | REUSE |
| dynamic StepSeries segment destructive rewrite | yes structurally | intentionally fail-closed today | no safe command | no | UNSAFE_OR_UNSUPPORTED |
| deployment view create | yes | yes | yes | yes | REUSE |
| deployment node / named instance create | yes | yes | yes | yes | REUSE |
| deployment entity rename/metadata | yes | no proven exact planner | no | limited | NEW_PUBLIC_CONTRACT_REQUIRED |
| deployment relation title/remove | yes | yes | yes | yes | REUSE |
| single-node manual drag | yes, snapshot-owned | existing layout owner | layout.save | yes | REUSE |
| multi-node drag | snapshot-owned | layout helpers reusable | one layout.save can commit final snapshot | no unified UI | EXTEND_EXISTING |
| align/distribute | snapshot-owned | can be pure snapshot transform | layout.save | no | EXTEND_EXISTING |
| reset manual layout | yes | yes | layout.reset | yes | REUSE |
| auto layout / fit | existing diagram/layout engine | existing renderer API to be reused | no semantic mutation needed | partial | EXTEND_EXISTING |
| grid/snap preference | presentation-only | n/a | n/a | no | EXTEND_EXISTING |
| unified multi-selection | transient UI | n/a | n/a | no | EXTEND_EXISTING |
| context menus | transient UI | n/a | n/a | no real menu | EXTEND_EXISTING |
| Copy/Paste subgraph | semantically expressible | no atomic planner | no | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| Duplicate | semantically expressible | no dedicated atomic planner | no | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| multi-delete | semantically expressible | single-element impact planner exists | no atomic multi command | no | NEW_PUBLIC_CONTRACT_REQUIRED |
| command palette | presentation/controller | n/a | reuses existing actions | no | EXTEND_EXISTING |
| stale inspector protection | yes | yes | revision guarded | yes | REUSE |
| Undo/Redo semantic + layout | yes | yes | yes | yes | REUSE |

## Implementation decisions

### D1 — Selection remains UI state

Introduce one unified transient selection controller that can represent multiple logical node IDs and at most one exact edge selection. It must never become a semantic graph or persisted workspace field.

### D2 — Batch layout uses one existing `layout.save`

Alignment, distribution and multi-drag compute a candidate `ViewManualLayoutSnapshot` from the current standard snapshot/rendered geometry and submit one layout operation. No DSL mutation and no per-node history entries.

### D3 — Atomic semantic productivity operations are dedicated commands

Do not add `EditorCommand[]` batching. Add narrowly typed commands/planners for duplicate/paste/multi-remove only where exact source ownership and post-compile verification can be proven. Each command produces one transaction/history entry.

### D4 — Schema-driven creation palette

Replace the hard-coded creation toolbar list as the authoritative set. Available kinds come from the loaded specification; Russian display labels may provide known-friendly labels while custom kinds remain available by their schema identifier.

### D5 — Unsupported metadata stays absent or explicitly explained

Do not add fake disabled controls. Existing safe fields remain editable; fields without a source-preserving planner remain documented limitations until the owning contract is added and tested.

## First delivery slices

1. unified selection foundation and public selection callbacks from `@likec4/diagram` only if existing callbacks cannot report selection changes;
2. multi-node layout operations, Select All, Fit selection/view, grid/snap presentation preferences;
3. true keyboard-accessible node/edge/canvas context menus and complete shortcut routing with editable-target exclusion;
4. atomic duplicate/copy/paste/multi-delete contracts with exact source/layout verification;
5. view authoring extensions that can be proven source-preserving;
6. metadata parity extensions only after exact grammar/source-owner proof;
7. accessibility/responsive hardening and production Playwright acceptance.

## Known fail-closed boundaries retained unless a proof is added

- changing an existing element kind;
- destructive rewrite of one segment inside `StepSeries`;
- relation endpoint rewiring;
- drag reparenting when reference rewriting cannot be proven exact;
- style/config/library editing without an existing or newly tested source-preserving public planner.

These are not to be simulated with canvas-only state or heuristic string rewrites.
