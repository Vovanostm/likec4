---
name: gui-to-code
description: Build and maintain the LikeC4 GUI-to-code semantic editor while preserving its canonical workspace and compiler contracts.
---

> AGENTS.md is the canonical source for shared LikeC4 repository instructions. This file is a task-specific workflow for the GUI-to-code editor.

Read `apps/gui-to-code/README.md`, `apps/gui-to-code/SPEC.md`, and `apps/gui-to-code/ROADMAP.md` before changing this application. The specification is the target contract; README states only what is implemented today.

## Required workflow

1. Select one ready `WP-*` from the roadmap and require a task packet with linked `AC-*`, bounded write scope, interfaces, non-goals, checks, stop condition and escalation trigger.
2. Close any referenced `DG-*` with an executable spike/test and ADR before implementation. Do not expand the current regex/brace prototype into a source editor or put semantic CRUD into `ViewChange`.
3. Treat the canvas as the primary Russian-language interface. A canvas action must dispatch one typed `EditorOperation`; do not require DSL input for normal create, connect, move, rename, delete, or view actions.
4. `EditorWorkspace` is the sole mutable semantic document and history owner after the first canvas-first slice. Tree, inspector, code preview, diagnostics and XYFlow data are derived. Keep exactly one owner during migration from the current source-first slice.
5. Compile a candidate revision through browser language services before committing it. Preserve the last valid rendered revision when a command, source edit or import fails; attach diagnostics to the affected UI control and ignore stale revisions.
6. Reuse `@likec4/diagram` editing and standard `.likec4/<view>.likec4.snap` layout snapshots. Geometry is view-only; it never creates or changes LikeC4 semantics.
7. Use the source-edit owner accepted by `DG-01` for incremental edits. Use `@likec4/generators/likec4` only for a deliberate canonical export/normalization, with the documented loss of comments and original formatting.
8. Derive element kinds, fields and allowed relations from the loaded specification. Keep FQN/reference migration and deletion dependency checks in one document transformer.
9. Use `skills/likec4-dsl/` for DSL-specific authoring rules rather than duplicating grammar guidance here.

Run the focused app generate/typecheck/build commands and relevant generator/core tests after changing a contract.
