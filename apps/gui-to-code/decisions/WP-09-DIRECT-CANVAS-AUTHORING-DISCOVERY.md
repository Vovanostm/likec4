# WP-09 Direct Canvas Authoring — discovery

Дата: 5 августа 2026

## Baseline

- Репозиторий: `Vovanostm/likec4`
- Проверенный `main`: `66c7ce7b4ff3aca00637754534d53b89ed5e630f`
- WP-08 и post-merge cleanup находятся в `main`.
- Открытых пользовательских PR, затрагивающих `apps/gui-to-code`, на момент старта WP-09 не обнаружено.

## Найденные production contracts

Текущий `apps/gui-to-code/src/App.tsx` уже использует public API `@likec4/diagram`:

- `LikeC4EditorProvider`;
- `LikeC4ModelProvider`;
- `ReactLikeC4`;
- `onInitialized`, который возвращает diagram API;
- `onNodeClick` с `modelRef`;
- `onConnect(sourceId, targetId)`;
- `onCanvasClick` с pointer event;
- `nodesSelectable`;
- существующий editor callback для standard manual-layout snapshots.

Приложение уже имеет два semantic connection route:

- logical relation через `useSemanticEditor`;
- dynamic step / deployment relation через `useWp06Runtime`.

Следовательно, WP-09 не требует новой canvas library, отдельной XYFlow model или переноса semantic ownership из `EditorWorkspace`.

## Доказанные gaps

1. В текущем app integration отсутствует edge selection callback и typed relation reference, поэтому relation нельзя выбрать и редактировать непосредственно на canvas.
2. Текущий create flow использует `event.clientX/clientY` как вход в create intent; WP-09 требует явного screen-to-canvas conversion contract.
3. `onConnect` вызывается только при уже активированном отдельном relation/dynamic/deployment mode; direct handle authoring не является default interaction.
4. Нет contract для connection end/cancel/drop-on-empty, поэтому create-and-connect на пустом canvas не выражен.
5. Semantic create и manual-layout placement пока не выражены как одна dedicated domain transaction.
6. Tree, inspector и DSL являются постоянными колонками; shell не canvas-dominant.
7. Relation patch/remove document and workspace commands в текущем app integration отсутствуют.

## Выбранная архитектура

```text
canvas gesture
→ typed CanvasAuthoringIntent
→ app adapter validates active view + expected revision
→ typed EditorOperation
→ isolated source edit
→ candidate compile
→ command-specific verification
→ atomic semantic/layout commit
→ one history entry
→ render from committed compiled model
```

### Ownership

- `EditorWorkspace` остаётся единственным владельцем committed sources, revision, compilation, history и manual layouts.
- `@likec4/diagram` сообщает typed gestures/references/positions и не импортирует workspace, commands или language services.
- UI не строит DSL и не выбирает source document.
- Persisted geometry остаётся standard LikeC4 manual-layout snapshot.

### Compound create

Для empty-drop create-and-connect выбран dedicated domain command `element.createConnected`, а не generic semantic batch. Он должен создать element и relation одним source-preserving candidate edit. Layout прикладывается к той же workspace transaction после candidate compile и получения created identity.

## Public API proposal

Минимальный diagram contract должен быть backward-compatible и ограничен gesture data:

- edge selection callback с stable typed rendered relation reference;
- connection lifecycle callback, различающий target connection, empty drop и cancel;
- canvas position в flow coordinates либо public screen-to-flow conversion;
- accessible edge activation callback;
- no ID generation;
- no semantic command routing.

Точная существующая type ownership и имена public callbacks должны быть подтверждены при реализации owning-package tests. Если backward-compatible extension `ReactLikeC4` невозможен без renderer rewrite, применяется stop-the-line contract из WP-09.

## Document/workspace proposal

Минимальный набор:

- logical relation patch/remove;
- dynamic step remove и patch только для уже поддерживаемых grammar fields;
- deployment relation patch/remove;
- `element.createConnected` с exact semantic delta verification;
- atomic semantic + manual layout history entry;
- stale active-view/revision rejection.

## Rejected alternatives

- отдельная React Flow semantic graph;
- UI-generated DSL strings;
- optimistic committed node/edge до candidate compile;
- generic `EditorCommand[]` batch;
- новая canvas library или fork `@xyflow/react`;
- отдельное persistence schema для canvas coordinates;
- определение semantic family по visual node shape.

## Initial scope

Основной:

- `apps/gui-to-code/**`;
- `e2e/tests/gui-to-code/**`.

Owning packages только после focused contract proof:

- `packages/diagram/**` для gesture callbacks/types;
- `packages/language-services/**` для source-preserving relation edits и compound create.

## Changeset decision

Changeset обязателен при изменении public exports/callbacks `@likec4/diagram` или `@likec4/language-services`. App-only work changeset не требует.

## Delivery order

1. Edge selection and relation patch/remove.
2. Direct existing-to-existing connection routing.
3. Dedicated create-connected transaction with atomic layout.
4. Empty-drop/double-click/inline title UX.
5. Canvas-dominant responsive shell.
6. Dynamic/deployment parity.
7. Full regression, reviews and exact-head GitHub CI.
