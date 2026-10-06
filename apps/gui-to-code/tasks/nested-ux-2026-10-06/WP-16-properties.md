# WP-16 — Tag creation and logical relationship properties

Authorization: user's “Implement fixes” follows the nesting audit and its remaining GUI limitations.
Outcome: declare a tag from an inspector; edit logical relation title, description, technology and assigned tags.
Acceptance: AC-02, AC-04, AC-07, AC-08, AC-09, AC-10 (command → compile → render, exact history, persistence/import).

Write scope: app contracts/workspace/adapter/hooks/inspectors and tests; existing AST/CST-aware
DocumentEditService and its tests; patch changeset for language-services; README, this packet/report and status.
Interfaces: optional EditorDocumentPort.createTag, tag.create command; additive metadata fields on RelationPatch;
DocumentEditService.planAddTag and additive planPatchRelation fields. No grammar/dependency/storage change.
Decision: reuse accepted DG-01 planner/revision boundary; no app-local source parser. A source-preserving planner
regression must pass before wiring new controls. Preserve existing public title-only behavior.

Invariants: single EditorWorkspace semantic/history owner, compile before commit, last valid revision retained,
stale/invalid/duplicate input rejected, unrelated comments/source untouched, standard diagram snapshots only.
Non-goals: tag rename/removal/colors, relation style/rule authoring, dynamic/deployment metadata, mobile,
unbounded complexity claims, commit/push/deploy, modification of user storage on existing browser origins.
Checks: planner preservation tests; workspace rollback/history/reload; inspector draft guards; app generate,
typecheck/test/build; real desktop creation/metadata/Undo/Redo/reload/export/import; focused lint/format,
instruction checks and diff check.
Stop when these flows pass on the final production asset with documented coverage. Escalate if a second
document owner, grammar change or persistence format is needed; preserve other work packages.
