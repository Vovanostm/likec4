# GUI-to-code instructions

Read `../../AGENTS.md` first. It owns all shared LikeC4 policy, tooling, style, safety and verification rules. This file contains only the local contract for the independently shipped GUI-to-code app.

- The desktop-only product and acceptance scope is defined in `../../AGENTS.md` (apps/gui-to-code); this supplement defers to it.
- Read `README.md` for current behaviour, `SPEC.md` for the target product/technical contract, `ROADMAP.md` for stable work-package contracts, and `ROADMAP.STATUS.md` for current managed state and handoff before changing scope or architecture. Keep all user-visible UI strings, errors, empty states and accessibility labels in Russian.
- Implement exactly one `WP-*` marked `ready` in `ROADMAP.STATUS.md` per task. Start only when its dependencies and `DG-*` are satisfied and the task packet names `AC-*`, bounded write scope, non-goals, checks and stop/escalation conditions.
- Canvas is the primary UI. Model changes arrive only through typed `EditorOperation` values to `EditorWorkspace`; do not add component-local semantic graph state or canvas-driven DSL string concatenation.
- The compiler derives model, source map and diagnostics from the candidate revision. Preserve the last valid revision if a command, source edit or import is invalid.
- Reuse `@likec4/diagram` for geometry and `@likec4/language-services/browser` for browser compilation. Manual layout is exclusively `.likec4/<view>.likec4.snap`; never persist a parallel XYFlow geometry graph.
- Derive kinds, fields and relation permissions from the loaded LikeC4 specification. Keep FQN/reference rewrites and deletion dependency checks centralized in the document layer.
- Keep incremental edits source-preserving. Canonical generation is an explicit export/normalization operation and must warn about lost comments and formatting.
- Parallel agents must have disjoint write scopes. The integration owner alone changes shared contracts, public exports, package manifests, lockfile, changesets and the managed roadmap state.
- Run the smallest relevant tests, then the ordered prerequisites and app gates documented in `ROADMAP.STATUS.md`; finish with `pnpm check:agent-instructions` and `git diff --check`.

## Desktop UI critic: spacing and alignment gate

Every desktop UI review, whether performed by the integration owner or a delegated critic, must apply this gate before approving the interface. Review the rendered current candidate, not only source code, passing interaction tests, or a previous review.

- Inspect the full desktop screen and readable panel crops at normal browser zoom. Cover the inspector with no selection, a selected element, and a selected relation; open and close its advanced sections, and check wrapped helper text and visible validation messages. Check the other panels, menus and dialogs touched by the change at the supported desktop widths.
- Check panel edge padding, the shared content alignment, heading-to-body spacing, text-to-action spacing, form rows, and separation between sections. Use the existing spacing tokens or the established sibling pattern; do not invent a new pixel scale from a screenshot. Nesting must reflect a real content hierarchy, not accidental cumulative padding or default button/summary styles.
- Required negative example from the user's 2026-10-06 inspector screenshot: the empty-state helper text nearly touches `Выбрать на холсте`, and `Сценарии и развёртывание` starts farther right than `Свойства элемента` without a clear nesting relationship. A functioning button and readable text do not make this layout acceptable. Both defects must be reported; unexplained spacing and alignment failures block visual approval as P2.
- Verify the gap after the last line of wrapped text, not just the first line or the container's declared margin. Check collapsed and expanded section headers against the same content edge, accounting for intentional disclosure icons. Watch for touching controls, inconsistent padding, oversized unexplained gaps, clipping and overlap.
- When a mismatch is visible, inspect the relevant rendered bounds and computed padding/margin/gap where browser tooling is available. Record the state, viewport, browser zoom, screenshot, affected controls, observed versus expected relationship, and measurements when available. A cropped attachment establishes a finding but does not establish the full viewport, zoom, CSS cause, or a passing current build.
- Report spacing/alignment separately as `PASS`, `FAIL`, or `NOT_RUN`, with evidence for each reviewed state. Missing browser or screenshot evidence means `NOT_RUN`; unresolved defects mean `FAIL` and `changes_requested`. Functional checks do not substitute for visual evidence, and absence of clipping alone does not prove correct spacing.
- After a fix, repeat the affected states on the new candidate and compare the same viewport and zoom before closing the finding. Keep this gate within the desktop product scope defined in the root instructions.
