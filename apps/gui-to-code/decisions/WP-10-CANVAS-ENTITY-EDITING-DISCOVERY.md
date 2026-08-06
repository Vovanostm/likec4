# WP-10 Canvas Entity Editing — discovery

Дата проверки: 6 августа 2026  
Baseline: `main` @ `d1b031268b65a7e0fe195572a926fc0d8c058582`  
Предыдущий пакет: PR #12 / WP-09 direct canvas authoring

## Проверенные фактические контракты

### `@likec4/diagram`

- `LikeC4DiagramEventHandlers` уже публиковал `onEdgeClick`, `onCanvasClick`, `onCanvasDblClick`, `onConnect` и `onInitialized`.
- `onEdgeClick` получает полный `DiagramEdge`, включая relation identity aggregation через `edge.relations`.
- `onInitialized` возвращает `XYFlowInstance`; его `screenToFlowPosition` является корректной границей преобразования browser screen coordinate в flow coordinate.
- XYFlow nodes и edges уже focusable/selectable; renderer владеет только transient visual selection.
- До WP-10 отсутствовали public `onNodeDblClick` и завершение connection lifecycle для empty/cancelled drop.
- React Flow предоставляет `onConnectEnd(event, connectionState)`, где доступны исходный node, наличие целевого node и pointer coordinates.

### `apps/gui-to-code`

- `EditorWorkspace` является единственным владельцем committed/draft sources, revision, candidate compilation, history и `manualLayouts`.
- Один history snapshot уже содержит sources и все standard `ViewManualLayoutSnapshot`; Undo/Redo восстанавливают их совместно.
- `commitCandidate` атомарно принимает candidate sources, compiled model и candidate layouts.
- Existing direct connection flow фиксирует view ID и revision перед gesture и fail-closed отклоняет completion после их изменения.
- Existing element patch уже source-preserving и подходит для inline display-title editing; FQN rename остаётся отдельной inspector operation.
- Existing logical relation create planner не публикует relation patch/remove API и relation IDs не являются стабильными source identifiers после recompile.

## Public gaps и решения

### Node double-click

Добавлен backward-compatible optional callback `onNodeDblClick`. Renderer передаёт существующий typed `DiagramNode`; DSL и editor command внутри diagram package не создаются.

### Connection end

Добавлен optional `onCanvasConnectionEnd` со значениями:

- `connected` — завершено на допустимом target;
- `empty` — release на pane;
- `cancelled` — любой другой незавершённый release.

Payload содержит source model FQN и screen coordinate. Flow conversion остаётся у consumer через уже опубликованный `XYFlowInstance.screenToFlowPosition`.

### Logical relation identity

Canvas edge может агрегировать несколько logical relations. UI хранит exact compiled `RelationId` и показывает discriminator для каждой relation в edge. Source planner локализует relation по направленным endpoint и ordinal occurrence в source order. После candidate compile workspace повторно разрешает тот же occurrence и возвращает актуальный compiled ID.

### Atomic geometry

`element.createAt` и dedicated `element.createConnected` формируют candidate source, компилируют его, берут standard auto-layout snapshot нового вида, сохраняют geometry существующих entities из текущего manual snapshot и меняют только координату нового узла. Source и snapshot передаются в один `commitCandidate` и образуют одну history entry.

## Владельцы

| Ответственность | Владелец |
|---|---|
| pointer lifecycle, typed DiagramNode/DiagramEdge, screen coordinate | `packages/diagram` |
| screen → flow conversion, transient selection, focus/menu state | `apps/gui-to-code` UI |
| source-preserving relation locator/edit | `apps/gui-to-code` document adapter |
| source, revision, candidate compile, exact verification, manual layout, history | `EditorWorkspace` |
| persisted semantics | LikeC4 DSL |
| persisted geometry | `ViewManualLayoutSnapshot` |

## Отвергнутые альтернативы

- **Сохранять `clientX/clientY` как layout coordinate** — неверная coordinate space; запрещено.
- **Хранить XYFlow nodes/edges отдельно** — создаёт второго geometry owner; запрещено.
- **Generic `EditorCommand[]` batch** — не выражает domain invariants и partial failure; вместо него dedicated `element.createConnected`.
- **Строить DSL в React component** — нарушает document ownership и source preservation.
- **Удалять relation по endpoint без ordinal identity** — повреждает duplicate endpoint relations.
- **Публиковать generic relation metadata patch для dynamic/deployment** — grammar/document owner не доказан; эти families остаются selectable, но metadata edit явно unsupported.

## Changeset decision

Public surface `@likec4/diagram` расширен двумя optional callbacks и exported lifecycle types. Добавлен patch changeset `.changeset/calm-canvas-entities.md`. App-only workspace/document additions не являются отдельным published package API.

## Stop-the-line result

Renderer rewrite не требуется. Все gaps выражаются backward-compatible optional API поверх существующего React Flow lifecycle; реализация WP-10 разрешена.
