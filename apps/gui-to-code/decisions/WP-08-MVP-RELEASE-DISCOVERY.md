# WP-08 MVP release gate — discovery

Status: implementation prerequisite  
Date: 4 August 2026  
Exact base SHA: `3a51089e0f959469521ab777d93bf05e1cd2ec44`

## Baseline

The branch starts from the current `main` after merged WP-07 and the durable-workspace Playwright isolation regression fix. WP-00 through WP-07 are complete; `ROADMAP.STATUS.md` marks WP-08 ready.

No other open pull request currently owns `apps/gui-to-code`, its focused Playwright suite, or the GUI-to-code workflow.

## Release inventory findings

### User-facing language

The application already uses Russian for most controls, but visible states still mix Russian and English terminology. Confirmed examples include `workspace`, `deployment`, `Dynamic`, `durable revision`, `Undo/Redo` and English-first status wording. Identifiers, LikeC4 DSL keywords, file extensions and technology names remain canonical and are not localization defects.

### Accessibility and keyboard evidence

Existing semantic controls provide a useful baseline, including native buttons, labels, form controls, status/alert roles and keyboard-capable creation forms. The release gate does not yet provide a consolidated exact-head acceptance matrix for:

- dialog focus entry and restoration;
- Escape cancellation;
- busy double-submit protection;
- accessible import controls and errors;
- keyboard execution of logical, dynamic and deployment critical paths.

### Empty, error and recovery evidence

WP-07 provides transactional import, IndexedDB recovery, optimistic revision checks and invalid-candidate rollback. Existing focused tests cover substantial persistence and ZIP validation. Missing release evidence is concentrated in user-visible recovery messages and browser acceptance across invalid DSL/import, destructive replacement, reload and storage isolation.

### Responsive behavior

No dedicated release smoke currently proves functional access at `390×844`, `1440×900` and `1920×1080`. The current grid can overflow by design, but the release gate must prove that primary actions remain reachable and that the document does not acquire accidental horizontal overflow.

### Production artifact

The GUI workflow builds `apps/gui-to-code/dist` and `smoke:start` serves it with Vite preview, but the smoke only probes the HTML root. The build output is not retained as a CI artifact and no browser acceptance currently proves compilation, mutation, reload and export against the built artifact.

### Documentation

The README describes WP-07 architecture and behavior but does not yet contain the complete MVP supported-feature matrix, release limitations, lossy behavior, schema/rollback guidance or artifact verification contract. `ROADMAP.STATUS.md` still contains the pre-merge WP-07 branch metadata and must be updated only after exact-head completion evidence exists.

## Planned ownership

Integration owner controls shared files, package metadata, workflow changes, release documentation and final evidence.

Planned paths:

- `apps/gui-to-code/src/**` — minimal Russian UX and accessibility corrections;
- `apps/gui-to-code/scripts/**` — production artifact smoke only when evidence requires it;
- `e2e/tests/gui-to-code/**` and focused config — keyboard, recovery, viewport and built-artifact evidence;
- `.github/workflows/gui-to-code.yml` — extend the existing workflow, retain the production artifact and upload diagnostics;
- `apps/gui-to-code/README.md` and `ROADMAP.STATUS.md` — truthful release documentation.

## Architecture invariants

- `EditorWorkspace` remains the sole owner of committed semantic state.
- LikeC4 DSL remains canonical persisted semantic representation.
- Compiled models, canvas nodes, selection, dialogs and focus remain derived or transient.
- React components do not construct or directly mutate DSL.
- Standard manual-layout snapshots remain the only persisted geometry.
- No persistence schema, public package API, DSL grammar or package boundary change is planned.
- No new dependency is planned unless repository-owned tooling cannot provide required evidence.

## Non-goals

No collaboration, cloud sync, filesystem integration, AI generation, new DSL family, mobile redesign, state-management framework or feature expansion.

## Validation policy

All validation is performed by GitHub Actions on the exact pull-request head. No local commands or local tests are used. A failure is changed only after its workflow, job, step, log or artifact establishes a root cause. Mandatory assertions and matrix coverage are not weakened to obtain green CI.

Merge is prohibited without a separate explicit user instruction.
