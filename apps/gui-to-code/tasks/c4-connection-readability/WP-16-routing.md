# WP-16 — Connection readability correction

User authorization: continue correcting desktop diagram editor until complex UI-created diagrams and readiness pass.
2026-10-05 user rejected routing/connection appearance. Previous functional acceptance is withdrawn.

2026-10-06 authorized sequential follow-up: review side attachment, fan-out order, actual renderer paths,
manual control points/labels, nesting, history, reload/ZIP and larger connected models. AC-03, AC-05,
AC-06, AC-07, AC-09 and the existing visual DoD apply. Single connections use facing side midpoints;
fan-out is ordered independently on each side by neighboring geometry. IDs may break parallel ties only.
Retain untouched Graphviz layout and safe deliberately customized curves. Automatic routes must not become
custom curves merely because a node moves. Manual label intent must survive semantic recompile.
No unlimited-complexity guarantee: record measured fixture sizes and timing/visual limits honestly.
Current agent owns integration and sequential critical review; no new worker delegation is required.

Sequential follow-up completed 2026-10-06 on immutable `index-BK3aO3U0.js`:
browser 67/67, app 443/443, geometry owners 55/55; native connected 200-node/370-edge geometry,
manual-label/curve semantic edits, history/reload/ZIP and native/host selection verified.
See `2026-10-06-ROUTING-AUDIT.md` for current evidence, failed/aborted run history and bounded acceptance.

Measured 200-node / 370-edge geometry saves exposed needless full source compilation. The follow-up includes
`EditorWorkspace` layout/history methods and their tests: unchanged validated semantic models may be reused
for geometry-only save/reset/history. Every changed source set still compiles. No second mutable model or
geometry cache is introduced; snapshots and expected-revision checks remain authoritative.

AC-01–AC-10 plus visual DoD: correct directed endpoints after creation/movement, routes avoid unrelated leaf nodes,
reverse/parallel connections remain distinguishable, labels do not obscure endpoints, and useful desktop diagram scale.
Check actual current user workspace read-only first; preserve its source and standard snapshots in diagnostics.

Write scope: existing app placement/layout integration, existing core manual-layout and diagram edge-routing owners and
focused tests; new connection-readability browser test; README/SPEC/managed state/checklist/evidence. Shared contracts,
exports, manifests, dependencies and changesets remain parent-owned. Independent workers receive disjoint scopes.
No mobile/a11y programme, backend, new semantic owner, second geometry graph, or storage migration.

First establish executable routing reproduction. Retain Graphviz routes when nodes have not moved; recompute stale
routes only through canonical geometry owners. Source bytes must remain unchanged for geometry operations. Preserve
standard snapshot, Undo/Redo, reload/ZIP, selection and locks. A reset-only workaround is insufficient.

Checks: focused geometry tests → app/owner tests and types/build → isolated production browser routes/CRUD/history/
reload → desktop screenshot critique → current-candidate independent review → revised readiness and instruction checks.
Stop success only after the strengthened routing checks and visual inspection pass. Escalate new public router/schema
design with a bounded executable decision; do not hide lines under opaque nodes to make assertions pass.
