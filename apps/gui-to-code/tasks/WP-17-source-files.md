# WP-17 — Navigation and editing across source files

Authorization: user approved implementation of the composition proposal with “Implement”.
Outcome: browse all source files, edit any selected document, and open the declaration of a selected logical element.
Acceptance: AC-02, AC-04, AC-07, AC-08, AC-09, AC-10; exact multi-file edits/history, retained drafts,
last-valid canvas, save/reload and ZIP round trip.
Dependencies: completed WP-12 and WP-16. Other active packets stay unchanged.
Decision gates: none new; reuse DG-01 and the public language-services locate API. Prove location lookup
on a cross-file extend fixture before UI integration. No app-local DSL parser.

Write scope: app source-document navigation helper/hook and file-browser UI; use-workspace-runtime,
compiler diagnostic URI, App/styles, durable active-file draft export; focused app tests, browser evidence,
README/SPEC/ROADMAP/STATUS and this packet/report. No public package API, dependencies or storage migration.
Interfaces: activeDocumentUri and selectDocument independent of entryDocumentUri; on-demand source location
through @likec4/language-services/browser; optional URI on WorkspaceDiagnostic.
Invariants: EditorWorkspace is the sole semantic/history owner; navigation never revises sources/history;
all-file drafts compile before commit; invalid drafts retain the last valid model; owner/source freshness checked
after asynchronous location lookup; source bytes, standard snapshots and entry metadata preserved by ZIP/reload.
Non-goals: file CRUD/repartitioning, module routing, moving declarations between files, view-rule composer,
local filesystem/Git/cloud integration, persisted Undo history, mobile/compliance, commit/push/deploy.

Checks: real compiler location/diagnostic tests; runtime non-entry edit and stale lookup regression tests;
file navigation/reconciliation and dirty-source presentation; app generate/typecheck/full tests/build;
native desktop import → browse → selected-element source → edit → Undo/Redo → invalid draft → recover →
ZIP/reload with source/snapshot equivalence; focused lint/format, agent instructions and diff check.
Stop when these flows pass against the final production asset with coverage and remaining stages documented.
Escalate if this slice requires a second semantic owner, new public API, persistence format or declaration relocation.
