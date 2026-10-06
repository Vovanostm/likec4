# WP-16 — Deep nesting desktop usability follow-up

Authorization: user requested verification of deep diagram creation, cross-level relationships, tags and other editing features on 2026-10-06. Continue the authorized fix-and-recheck loop sequentially; preserve all prior working-tree edits and user projects.

Acceptance: AC-01, AC-02, AC-03, AC-04, AC-06, AC-07, AC-08, AC-09, AC-10. Verify UI-authored containment at eight levels, links across branches, declared tag assignment/removal, rename/reparent reference integrity, collapse/hide/lock, navigation, history, reload and ZIP.

Write scope: existing app UI/hooks/styles and their tests, desktop browser audit artifacts, this packet/report and managed status. Use existing element.create/patch/move/rename commands and compiler contracts only. Expand source owner scope only if a reproducible source-preservation defect requires it.

Invariants: EditorWorkspace is the sole semantic/history owner; native diagram and standard snapshots own geometry; compile before commit; preserve comments and unrelated sources. Presentation search/collapse is transient.

Non-goals: new specification/tag-definition editor, new relation property API, new geometry/storage format, dependencies, mobile/WCAG, deployment/publication or unlimited-size guarantees. Record unsupported functions explicitly.

Decision gates: existing DG-01 and canvas contracts; no new gate required for UI controls dispatching supported commands. Escalate only if public API, grammar or persistence schema must change; continue independent checks.

Bounded private command extension: `element.create` receives optional `parentId`, already supported by the
source-edit port and existing create-at implementation. Workspace validates the parent, allocates an ID,
compiles and commits one history entry. Scope includes app contracts/workspace and regressions; no public
package API, grammar, storage or source-edit implementation changes. This removes mandatory intermediate
view creation from direct child authoring.

Checks: real Chromium production UI reproduction before fixes; focused affected owner tests, app generate/typecheck/test/build, focused format/lint, instruction checks and diff check; repeat actual desktop journey on final asset with screenshots, exact source/history and ZIP/reload proof.

Stop when the checked desktop workflow has no unresolved reproducible P1/P2 and applicable gates pass; report coverage and limits without borrowing previous counts.

Browser finding N03: adding cross-branch relations reveals external endpoints whose automatic positions
overlap retained manual compounds/leaves. Extend the existing creation-placement adapter and standard
snapshot reconciliation in workspace, including subtree translation and route repair. Preserve existing
leaves, intentional manual routes and atomic history. No native diagram/public API change is required.
