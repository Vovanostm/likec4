# GUI-to-code instructions

Read `../../AGENTS.md` first. It owns all shared LikeC4 policy, tooling, style, safety and verification rules. This file contains only the local contract for the independently shipped GUI-to-code app.

- Read `README.md` for current behaviour, `SPEC.md` for the target product/technical contract, and `ROADMAP.md` before changing scope or architecture. Keep all user-visible UI strings, errors, empty states and accessibility labels in Russian.
- Implement exactly one `WP-*` from `ROADMAP.md` per task. Start only when its dependencies and `DG-*` are satisfied and the task packet names `AC-*`, bounded write scope, non-goals, checks and stop/escalation conditions.
- Canvas is the primary UI. Model changes arrive only through typed `EditorOperation` values to `EditorWorkspace`; do not add component-local semantic graph state or canvas-driven DSL string concatenation.
- The compiler derives model, source map and diagnostics from the candidate revision. Preserve the last valid revision if a command, source edit or import is invalid.
- Reuse `@likec4/diagram` for geometry and `@likec4/language-services/browser` for browser compilation. Manual layout is exclusively `.likec4/<view>.likec4.snap`; never persist a parallel XYFlow geometry graph.
- Derive kinds, fields and relation permissions from the loaded LikeC4 specification. Keep FQN/reference rewrites and deletion dependency checks centralized in the document layer.
- Keep incremental edits source-preserving. Canonical generation is an explicit export/normalization operation and must warn about lost comments and formatting.
- Parallel agents must have disjoint write scopes. The integration owner alone changes shared contracts, public exports, package manifests, lockfile, changesets and the managed roadmap state.
- Run the smallest relevant tests, then `pnpm --filter @likec4/gui-to-code generate`, `typecheck`, `test`, and `build` when their surfaces exist; finish with `pnpm check:agent-instructions` and `git diff --check`.
