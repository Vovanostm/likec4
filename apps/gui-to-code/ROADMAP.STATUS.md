# Состояние исполнения roadmap

Дата актуализации: 6 августа 2026  
Текущая ветка: `feat/gui-to-code-wp10-canvas-entity-editing`  
WP-09 merge commit: `d1b031268b65a7e0fe195572a926fc0d8c058582`  
WP-10 delivery PR: #13

Этот файл — изменяемое состояние исполнения. Стабильные outcomes и acceptance criteria находятся в `ROADMAP.md`.

## Managed state

```yaml
# managed-state:v2
revision: 18
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
ready: []
planned: []
blocked: []
```

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

Focused diagram lifecycle, source-preservation, workspace atomicity and Playwright canvas acceptance tests are included. Exact-head GitHub CI evidence is recorded in PR #13; no local validation is used as release evidence.

### Explicit limitations

- logical relation metadata editing is title-only;
- dynamic steps and deployment relations are selectable and keyboard-addressable, but canvas metadata patch/remove remains unsupported until a source-preserving document owner is available;
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
