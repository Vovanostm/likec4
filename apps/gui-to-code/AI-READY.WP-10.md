# Техническое задание: LikeC4 GUI-to-code WP-10 — Canvas Entity Editing and Atomic Creation

**Статус:** AI-ready implementation contract  
**Репозиторий:** `Vovanostm/likec4`  
**Base:** фактический `main` после merge PR #12  
**Предлагаемая ветка:** `feat/gui-to-code-wp10-canvas-entity-editing`  
**Предлагаемый PR:** `feat(gui-to-code): add canvas entity editing and atomic creation`  
**DoD:** один green, non-draft, mergeable PR без unresolved review threads  
**Merge:** не выполнять без отдельной явной команды пользователя  
**Проверка:** GitHub CI — итоговый источник истины; не ослаблять assertions, retries или timeouts

## 0. Миссия

Завершить следующий самостоятельный вертикальный срез canvas-dominant authoring поверх direct connection foundation из PR #12:

1. Выбор relation edge непосредственно на canvas.
2. Source-preserving patch/remove relation с одним Undo/Redo.
3. Double-click empty canvas → создать element в точной flow coordinate.
4. Drag existing → empty → атомарно создать element + relation + standard manual layout.
5. Double-click/F2 node → inline title editing.
6. Keyboard parity для logical, dynamic и deployment authoring.
7. Collapsible tree/inspector/DSL и canvas-dominant shell.

## 1. Неподвижные инварианты

- `EditorWorkspace` остаётся единственным владельцем sources, revision, compilation, history и manual layouts.
- LikeC4 DSL остаётся persisted semantic SSOT.
- Diagram package сообщает typed refs/gestures/positions, но не строит DSL, IDs или workspace commands.
- Все semantic операции проходят isolated candidate edit → compile → exact verification → atomic commit.
- Layout хранится только как standard `ViewManualLayoutSnapshot`; отдельная XYFlow persistence запрещена.
- Любая ошибка fail-closed: source/layout/revision/history не меняются.
- Не вводить generic `EditorCommand[]` batching. Для create-and-connect использовать dedicated domain command.

## 2. Обязательный discovery

До production edits агент должен проверить фактический latest `main`, merge commit PR #12 и доступные callbacks/types в `@likec4/diagram`:

- edge click/selection;
- edge model/relation identity;
- connection start/end/cancel/drop-on-empty;
- screen → flow coordinate conversion;
- node double-click;
- keyboard focus ownership;
- handle visibility/read-only contract.

Обновить `apps/gui-to-code/decisions/WP-10-CANVAS-ENTITY-EDITING-DISCOVERY.md` с exact contracts, public gaps, owner packages, rejected alternatives и changeset decision.

Stop-the-line, если edge identity или empty-drop lifecycle невозможно выразить backward-compatible public API без renderer rewrite.

## 3. Wave 1 — Typed canvas entity refs и edge selection

Минимальный contract:

```ts
type CanvasEntityRef =
  | { family: 'logical-element'; id: Fqn }
  | { family: 'logical-relation'; id: RelationId }
  | { family: 'dynamic-step'; viewId: ViewId; id: string }
  | { family: 'deployment-element'; id: Fqn }
  | { family: 'deployment-relation'; id: RelationId }
```

Acceptance:

- click edge selects exactly one relation/step;
- node selection clears edge selection and vice versa;
- selection is transient and does not change revision/history/source;
- selected edge has programmatic selected state and accessible name;
- Enter/Shift+F10 opens contextual surface;
- selection clears deterministically on view switch/import/reset.

## 4. Wave 2 — Relation patch/remove

Добавить source-preserving APIs и typed commands только для доказанно поддерживаемых fields.

```ts
interface PatchRelationCommand {
  type: 'relation.patch'
  input: { id: RelationId; patch: RelationPatch }
}

interface RemoveRelationCommand {
  type: 'relation.remove'
  input: { id: RelationId }
}
```

Минимум logical relation title; description/technology/tags — только если grammar и document owner уже поддерживают точечный edit.

Verification:

- exact relation existed before operation;
- patch changes only allowed fields;
- remove deletes exact relation, preserving duplicate endpoint relations;
- unrelated elements/views/layouts byte- and identity-preserved;
- one history entry;
- one Undo/Redo;
- browser/Node parity, если public language-services API меняется.

Dynamic/deployment patch/remove реализовать discriminated commands либо явно зафиксировать unsupported fields; untyped generic handler запрещён.

## 5. Wave 3 — Flow coordinates and double-click create

Diagram package должен отдавать flow coordinate либо public conversion method. `clientX/clientY` нельзя сохранять как layout position.

Double-click empty canvas:

1. capture `viewId`, revision, flow coordinate;
2. открыть create menu;
3. выбрать actor/system/component по specification;
4. создать element;
5. построить candidate standard manual layout;
6. atomic semantic + layout commit;
7. select new element;
8. открыть inline title editor.

Не выполнять fit-all после creation.

## 6. Wave 4 — Dedicated create-connected transaction

Рекомендуемый command:

```ts
interface CreateConnectedElementCommand {
  type: 'element.createConnected'
  input: {
    sourceId: Fqn
    kind: ElementKind
    id?: string
    title?: string
    documentUri?: string
  }
}
```

Document layer должен одним candidate edit создать ровно один element и одну relation.

Workspace transaction:

1. validate captured revision/view/source;
2. apply candidate source edit;
3. compile candidate;
4. verify exact semantic delta;
5. derive created element identity;
6. construct candidate manual-layout snapshot at drop point;
7. verify only active view snapshot changed;
8. atomically commit semantic + layout;
9. create one history entry.

Result:

```ts
{
  status: 'applied'
  command: 'element.createConnected'
  revision: Revision
  createdElementId: Fqn
  createdRelationId: RelationId
  viewId: ViewId
}
```

Undo once removes element, relation and placement; Redo once restores exact bytes and coordinate.

## 7. Wave 5 — Inline title editing and contextual delete

Node double-click/F2:

- edit display title only;
- Enter save;
- Escape cancel;
- explicit tested blur policy;
- error keeps editor open;
- busy prevents duplicate submit;
- focus returns to node.

Delete/Backspace:

- selected relation removes relation;
- selected element uses existing safe dependency inspection flow;
- never intercept inside input/textarea/select/contenteditable.

ID/FQN rename remains advanced inspector action and must not be conflated with title edit.

## 8. Wave 6 — Keyboard parity

Required acceptance for static, dynamic and deployment:

- keyboard focus node;
- open contextual menu;
- choose «Создать связь»;
- searchable/selectable valid targets;
- same semantic route and guards as pointer drag;
- created entity selected;
- deterministic focus restoration;
- Escape cancellation;
- unsupported endpoints absent, not merely rejected after submit.

Keyboard map: Enter, F2, Delete/Backspace, Escape, Shift+F10, Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z.

## 9. Wave 7 — Canvas-dominant shell

- tree collapsible;
- inspector contextual/collapsible;
- DSL pane collapsible and non-dominant by default;
- canvas consumes available area;
- 390×844 uses drawers without document-level horizontal overflow;
- existing forms retained as accessible fallback until canvas flows have equivalent coverage.

## 10. Tests

### Diagram package

- edge selection emits exact typed ref;
- accessible edge name includes source/target/title;
- connection lifecycle distinguishes target/empty/cancel;
- double-click background emits flow coordinate;
- no IDs generated;
- no workspace imports;
- read-only/busy hides or disables handles.

### Document layer

- relation patch/remove exact source preservation;
- duplicate endpoint identity;
- comments/whitespace preservation;
- ambiguous document reject;
- createConnected exact one element + one relation;
- collision, missing source, invalid kind, stale source;
- browser/Node parity.

### Workspace

- selection no revision change;
- patch/remove one history entry;
- createAt + layout atomic;
- createConnected + layout atomic;
- rejected operation preserves source/layout object identity;
- stale revision/view conflict;
- unrelated snapshots unchanged;
- Undo/Redo exact bytes and coordinate.

### Components

- edge inspector;
- Delete/F2/Enter/Escape;
- focus restoration;
- busy/invalid gating;
- create menu filtering;
- panels collapse;
- Russian errors/status.

### Playwright

1. Edge select → patch title → Undo/Redo.
2. Edge select → Delete → Undo.
3. Double-click create at coordinate → reload preserves placement.
4. Drag existing → empty → create component + relation → one Undo/Redo.
5. Inline title edit cancel/save.
6. Keyboard-only static connection.
7. Keyboard-only dynamic step.
8. Keyboard-only deployment relation.
9. View/revision changes during gesture produce no mutation.
10. Responsive 390×844, 1440×900, 1920×1080.

## 11. CI and review

Use existing `GUI-to-code`, root `CI (PR & push)` and `push` workflows. No temporary workflows, retries, timeout inflation, `.skip/.only`, weakened assertions or privileged contents write.

Two explicit review passes:

- Review A: ownership, atomicity, exact verification, rollback, history, stale guards, source preservation.
- Review B: canvas-primary UX, keyboard parity, focus, Russian copy, responsive layout, accessibility.

Update PR body with exact base/head, run IDs, findings/fixes, changeset rationale and known limitations.

## 12. Definition of Done

- edge selection/edit/remove works from canvas;
- double-click create stores correct flow coordinate atomically;
- drag-to-empty creates element+relation+layout in one history entry;
- inline title edit works;
- static/dynamic/deployment keyboard parity proven;
- canvas-dominant shell delivered;
- no second semantic/geometry owner;
- exact-head required CI terminal success;
- PR open, non-draft, mergeable, unresolved threads 0;
- merge not performed without separate command.
