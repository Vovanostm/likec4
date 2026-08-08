# Состояние исполнения roadmap

Дата актуализации: 8 августа 2026  
Текущая ветка: `feat/gui-to-code-wp11-dynamic-deployment-edge-crud`  
WP-10 merge commit: `69e7d0b55df300fc1a149eeb3b1fe0aaf2e2cc23`  
WP-11 delivery PR: #16

Этот файл — изменяемое состояние исполнения. Стабильные outcomes и acceptance criteria находятся в `ROADMAP.md`.

## Managed state

```yaml
# managed-state:v2
revision: 20
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
  - WP-02
  - WP-03
  - WP-04
  - WP-05
  - WP-06
  - WP-07
  - WP-08
  - WP-09
  - WP-10
  - WP-11
ready: []
planned: []
blocked: []
```

## WP-11 — Dynamic & Deployment Edge CRUD Parity complete

AI-ready contract: WP-11 implementation contract delivered in PR #16. Discovery record: `apps/gui-to-code/decisions/WP-11-DYNAMIC-DEPLOYMENT-EDGE-CRUD-DISCOVERY.md`.

### Delivered outcome

- canvas-selected dynamic steps expose a Russian inspector with endpoints, editable title and exact remove action;
- canvas-selected deployment relations expose the same title/remove parity;
- dynamic identity resolves through parser-owned `astPath` carried by the compiled edge;
- deployment identity resolves through parser-owned `RelationId` to the owning parsed document and exact relation `astPath`;
- duplicate endpoint declarations are source-addressed exactly rather than by endpoint-only matching;
- public `DynamicDeploymentDocumentEditService` now owns source-preserving patch/remove planning for both edge families;
- browser and Node language-services entrypoints expose the same additive API and a patch changeset records the package contract change;
- all mutations remain `EditorWorkspace` transactions: captured revision → source-preserving candidate → compile → exact semantic verification → one atomic commit/history entry;
- semantic patch/remove leaves `manualLayouts` unchanged;
- Undo/Redo restores exact source bytes for patch/remove;
- stale inspector actions fail closed after revision or view changes;
- Enter and Shift+F10 focus the edge inspector, Delete/Backspace remove outside editable controls, and Escape clears selection with canvas focus restoration;
- unsupported edge metadata remains hidden instead of rendered as a misleading disabled form.

### Review A — correctness and architecture

Fixed findings:

- post-compile verification initially assumed non-selected dynamic `astPath` and deployment `RelationId` remained stable after deletion; removing an earlier declaration can renumber derived identities, so verification now compares the exact remaining semantic multiset while source targeting remains AST/CST-owned;
- first and second duplicate declarations are covered separately so endpoint duplication cannot collapse patch/remove onto all matches;
- dynamic `StepSeries` segment removal is rejected fail-closed when deleting one segment would structurally rewrite neighboring flow semantics;
- source planners use Langium AST/CST and existing source revisions; React never computes source ranges or relation occurrences;
- no renderer, persisted schema, dependency, grammar, manual-layout format or secondary semantic graph was introduced.

### Review B — UX and accessibility

Verified/fixed findings:

- dynamic/deployment inspector labels use Russian domain terminology and no longer expose unsupported metadata messaging;
- busy state disables title editing and destructive actions, preventing double submit;
- Delete/Backspace is guarded for `input`, `textarea`, `select` and `contenteditable` targets;
- successful patch deterministically returns focus to the editable title; successful removal returns focus to the canvas;
- stale selection remains actionable through a Russian error and performs no mutation;
- existing responsive inspector/workspace layout is reused without adding a new narrow-view surface.

### Verification

Focused language-services, workspace integration and Playwright WP-11 acceptance tests are included. Exact-head release evidence is the required green `GUI-to-code`, `CI (PR & push)` and `push` GitHub Actions set recorded in PR #16. No local validation is release evidence.

### Explicit limitations

- supported edge metadata editing is title-only;
- exact removal is supported for standalone dynamic `Step`; deleting one segment from `StepSeries` fails closed when it would require structural rewriting of neighboring steps;
- selection, inspector focus and captured stale-state guards remain transient and are not persisted as domain data.

## WP-10 — Canvas Entity Editing and Atomic Creation complete

AI-ready contract: `apps/gui-to-code/AI-READY.WP-10.md`.

### Delivered outcome

- canvas edges are selectable as typed logical relation, dynamic step or deployment relation entities;
- logical relation title can be patched and the exact selected duplicate can be removed source-preservingly;
- node double-click and F2 open inline display-title editing;
- empty-canvas double-click creates a logical element at the exact flow coordinate;
- active static `viewOf` scope owns newly created canvas elements, so they remain visible in the current view;
- connection existing → empty creates element, directed relation and standard manual-layout position atomically;
- connection lifecycle distinguishes `connected`, `empty` and `cancelled` without creating DSL inside `@likec4/diagram`;
- screen coordinates are converted through `XYFlowInstance.screenToFlowPosition` before persistence;
- source and `ViewManualLayoutSnapshot` are committed through one `EditorWorkspace` transaction and one history entry;
- Undo/Redo restores source and layout together;
- structure, inspector and DSL panels are collapsible; DSL is hidden by default;
- keyboard routes cover F2, Enter, Delete/Backspace, Escape and Shift+F10 without intercepting editable controls;
- responsive layout collapses to one column and avoids page-level horizontal overflow.

### Review A — architecture and atomicity

Fixed findings:

- scoped static view creation initially produced an invisible root element; document planning now creates and moves it under `viewOf`, then verifies the full FQN;
- nested relations can use relative endpoints; exact relation identity now resolves lexical element scope, `this` references and duplicate endpoint occurrence;
- create-and-connect remains a dedicated domain command rather than a generic command batch;
- renderer remains gesture-only; `EditorWorkspace` remains the sole source/revision/layout/history owner;
- rejected or stale candidates do not mutate source, layout, revision or history;
- create-and-connect acceptance now uses a valid sibling relation, while a forbidden parent-to-child relation is covered as an exact rollback case.

### Review B — UX and accessibility

Fixed findings:

- creation menu focuses the first enabled kind rather than a disabled control;
- F2 cannot edit a stale node selection while an edge is selected;
- contextual overlays are clamped to canvas bounds;
- direct-create tool reset no longer overwrites success feedback;
- inline edit has explicit Enter-save, Escape-cancel and blur-cancel behaviour with focus return;
- submit-induced blur no longer closes the inline editor, and a rejected save restores input focus;
- edge alternatives expose a discriminator when one visual edge aggregates multiple logical relations.

### Verification

Focused diagram lifecycle, source-preservation, workspace atomicity and Playwright canvas acceptance tests are included. Exact-head GitHub CI evidence is recorded in PR #15; no local validation is used as release evidence.

### Explicit limitations

- logical relation metadata editing is title-only;
- selection, focus, menus and gesture state remain transient and are not persisted as domain data.

## WP-09 — Direct connection foundation complete

- pointer drag existing → existing creates static, dynamic or deployment semantics through the existing typed command pipeline;
- semantic family is selected by the active compiled view rather than visual node shape;
- gesture start captures exact view ID and workspace revision and completion fails closed after either changes;
- invalid, busy and element-create-tool states disable direct authoring;
- existing form/select controls remain keyboard fallbacks.

## WP-08 — MVP release gate complete

- Russian UX terminology and durable-workspace states are consistent;
- critical controls have accessible names and responsive production smoke coverage;
- production artifact build, preview smoke and Playwright acceptance are part of the standalone `GUI-to-code` workflow;
- README documents supported features, recovery, persisted schema and MVP limitations.
