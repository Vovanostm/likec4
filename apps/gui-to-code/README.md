# LikeC4 GUI-to-code

`@likec4/gui-to-code` — приватный браузерный семантический редактор LikeC4. Пользователь работает преимущественно через canvas, а все подтверждённые изменения проходят через `EditorWorkspace` и сохраняются как LikeC4 DSL и стандартные snapshots ручной раскладки.

## Возможности MVP

Редактор поддерживает:

- создание и изменение logical elements;
- создание направленных logical relations;
- выбор logical relation непосредственно на ребре, изменение её title и exact source-preserving удаление;
- выбор dynamic step непосредственно на ребре, изменение его title и exact source-preserving удаление standalone step;
- выбор deployment relation непосредственно на ребре, изменение её title и exact source-preserving удаление;
- безопасные patch, rename, move и remove операции с общей историей Undo/Redo;
- создание элемента double-click по пустому canvas с преобразованием screen coordinate в flow coordinate;
- создание дочернего элемента внутри scope текущего static view;
- атомарное создание element + initial title + directed relation + standard manual-layout position при отпускании connection handle на пустом canvas;
- inline-редактирование display title по double-click или F2;
- создание и выбор static views;
- ручную раскладку через `.likec4/<view>.likec4.snap`;
- dynamic views и направленные dynamic steps;
- deployment views, узлы развёртывания, именованные `instanceOf` и deployment relations;
- keyboard routes для relation authoring/editing через Shift+F10, Enter, Delete/Backspace, F2 и Escape;
- revision/view-bound canvas interactions для logical, dynamic и deployment edges с fail-closed stale handling;
- сворачиваемые structure, inspector и DSL panels; DSL скрыт по умолчанию;
- автоматическое восстановление последнего подтверждённого рабочего пространства после reload;
- атомарное сохранение sources, manual-layout snapshots и versioned metadata в IndexedDB;
- транзакционный импорт одного `.c4` файла;
- экспорт текущего source как `model.c4`;
- транзакционный импорт и экспорт переносимого workspace ZIP;
- защиту ZIP import от path traversal, абсолютных путей, backslash paths, duplicate/case-collision entries, undeclared entries, CRC mismatch, неподдерживаемого compression, превышения числа записей и размера;
- явное подтверждение destructive workspace replacement;
- revision-aware save conflicts и отклонение stale completion;
- сохранение последнего valid rendered model при невалидном ручном DSL.

Selection, открытые dialogs, focus, connection mode, diagnostics, compiled model и rendered diagram nodes не сохраняются как domain data.

## Поддерживаемая матрица

| Семейство | Создание | Изменение | Rename | Remove | Import | Export | Canvas |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Logical elements | Да, включая scoped create-at | Да, включая inline title | Да | Да | `.c4`, ZIP | `.c4`, ZIP | Да |
| Logical relations | Да, включая create-and-connect | Title | Через обновление ссылок | Да, exact selected relation | `.c4`, ZIP | `.c4`, ZIP | Да |
| Static views | Да | Ограниченно | Нет отдельного flow | Через поддержанный remove flow | `.c4`, ZIP | `.c4`, ZIP | Да |
| Dynamic views/steps | Да | Title для выбранного шага | Нет отдельного flow | Да для exact standalone step; chain segment fail-closed | `.c4`, ZIP | `.c4`, ZIP | Да |
| Deployment nodes | Да | Ограниченно | Нет отдельного flow | Через поддержанный remove flow | `.c4`, ZIP | `.c4`, ZIP | Да |
| Deployment instances | Да, именованные | Ограниченно | Нет отдельного flow | Через поддержанный remove flow | `.c4`, ZIP | `.c4`, ZIP | Да |
| Deployment relations | Да | Title для выбранной связи | Через обновление ссылок | Да, exact selected relation | `.c4`, ZIP | `.c4`, ZIP | Да |
| Manual layout snapshots | Да, через drag/create-at | Drag/reset | Не применимо | Reset | Snapshot, ZIP | Snapshot, ZIP | Да |
| Config/libraries/styles | Нет отдельного authoring UI | Нет | Нет | Нет | Сохраняются только в пределах фактически принятого source | Через source/ZIP | Нет |

«Ограниченно» означает только уже реализованные поля и операции. Редактор не заявляет полную поддержку всего LikeC4 DSL.

## Canvas entity editing

Diagram package публикует только typed gestures: node click/double-click, edge click, direct connection и discriminated connection completion `connected | empty | cancelled`. Он не генерирует DSL, IDs или editor commands.

Screen coordinates преобразуются через `XYFlowInstance.screenToFlowPosition`. Browser `clientX/clientY` не сохраняются как geometry. Persisted coordinate нового узла записывается только в standard `ViewManualLayoutSnapshot` текущего вида.

Для static view с `viewOf` новый canvas element создаётся как child этого scope. Например, создание `component` в `view ... of shop` даёт FQN `shop.component`, поэтому элемент действительно входит в active view.

При connection existing → empty редактор сначала собирает тип и initial title нового элемента. Затем один `element.createConnected` передаёт element, title, relation и drop position в `EditorWorkspace`. Успешная операция создаёт один history entry: один Undo удаляет весь результат, а Redo восстанавливает его целиком. Если relation/compile/verification отклонены, source, revision, history и manual layout не меняются.

Canvas edge может агрегировать несколько logical relations. Inspector показывает discriminator и редактирует exact selected relation. Identity разрешается по compiled relation ID, directed endpoints и ordinal occurrence; после candidate compile workspace повторно подтверждает exact semantic delta.

Logical, dynamic и deployment edge selection привязаны к captured `viewId` и workspace revision. Patch/remove выполняются только если captured context всё ещё совпадает с текущим workspace; после view/revision change stale action отклоняется с русским сообщением и без semantic mutation.

Dynamic step identity разрешается через parser-owned `astPath`, сохранённый в compiled dynamic edge. Deployment relation identity разрешается через parser-owned `RelationId`, который однозначно отображается обратно в `astPath` owning source document. React хранит только transient selection и captured revision/view; source ranges и source occurrence не являются UI state.

Для dynamic step и deployment relation inspector показывает только реально поддерживаемое поле «Название». Patch/remove проходят через `DynamicDeploymentDocumentEditService`, isolated candidate compile и exact semantic verification. Если один segment является частью `StepSeries` и его удаление потребовало бы переписать соседнюю цепочку, операция отклоняется fail-closed вместо скрытого semantic rewrite.

## Надёжность и восстановление

`EditorWorkspace` — единственный владелец committed semantic state. Production path:

```text
пользовательское действие
→ typed EditorCommand
→ source-preserving isolated candidate
→ compile и exact semantic verification
→ optional standard manual-layout candidate
→ atomic workspace commit
→ one Undo/Redo history entry
→ revision-guarded IndexedDB save
```

`element.createConnected` является dedicated domain command. Generic batch `EditorCommand[]` не используется. Element, initial title, relation и placement либо подтверждаются и фиксируются вместе, либо не изменяют source, layout, revision и history.

Импорт выполняется как replacement transaction:

```text
file или ZIP
→ bounded validation
→ isolated candidate workspace
→ candidate compile
→ durable transaction
→ atomic active workspace replacement
```

Невалидный `.c4`, повреждённый ZIP, неподдерживаемая schema version или rejected candidate не заменяют active workspace, не увеличивают revision и не добавляют history entry. Успешный destructive import намеренно начинает новую Undo/Redo history.

При конфликте сохранения редактор не должен молча перезаписывать более новую revision. При невалидном ручном DSL source и diagnostics остаются доступны, а canvas продолжает показывать последний valid compiled model.

## Формат durable workspace

IndexedDB record использует schema `likec4.gui-to-code.workspace`, version `1`:

```text
workspace envelope
├── workspaceId
├── revision / savedAt
├── committed source files
├── manual layout snapshots
└── entry document metadata
```

Неизвестная или повреждённая версия не гидратируется поверх valid active workspace. Для восстановления пользователь может импортировать ранее экспортированный ZIP/`.c4` либо очистить browser storage для приложения и начать со starter workspace.

Portable ZIP использует authoritative `workspace.json`. Sources и snapshots сохраняются как байты архива. Codec формирует deterministic store-only entries; неподдерживаемое compression отклоняется.

## Lossy behaviour и ограничения

Workspace ZIP сохраняет committed source files, исходное разбиение этих файлов, standard manual-layout snapshots и versioned metadata. Комментарии и formatting сохраняются только потому, что экспортируются существующие source bytes; отдельная canonical regeneration может быть lossy и не является обещанием этого MVP.

Source locations, diagnostics, compiled models, selection, focus, открытые dialogs и canvas runtime state не переносятся как persisted domain data.

Не поддерживаются:

- совместное редактирование;
- backend или cloud sync;
- прямая интеграция с desktop filesystem;
- произвольное multi-project authoring сверх фактически импортируемого workspace;
- полное authoring-покрытие config, libraries и styles;
- relation metadata кроме title для logical relations, dynamic steps и deployment relations;
- удаление одного segment из dynamic `StepSeries`, если для этого требуется структурное переписывание соседних шагов;
- создание нового logical element через empty-drop из dynamic/deployment view;
- полная поддержка всего LikeC4 DSL;
- AI-assisted architecture generation;
- lossless canonical regeneration любого входного DSL.

## Архитектура

- `EditorWorkspace` владеет sources, layouts, revision, compilation state и history.
- `src/editor/language-services-adapter.ts` координирует public document planners; React components DSL не строят.
- `src/editor/relation-source-edits.ts` выполняет exact logical relation title/remove edits и fail-closed отклоняет missing occurrence.
- `DynamicDeploymentDocumentEditService` владеет source-preserving create/patch/remove для dynamic steps и deployment relations через AST/CST.
- `src/editor/use-canvas-entity-editor.ts` владеет только transient selection/menu/inline-edit state и captured revision/view для stale protection.
- `src/editor/persisted-workspace.ts` задаёт versioned serializable envelope и validation boundary.
- `src/editor/indexeddb-workspace.ts` реализует atomic IndexedDB port и optimistic revision checks.
- `src/editor/workspace-bundle.ts` отображает workspace в manifest и обратно, но не компилирует DSL и не становится semantic model.
- `src/editor/zip-store.ts` реализует bounded deterministic ZIP codec.
- `src/editor/use-durable-workspace.ts` координирует hydration, queued saves и isolated transactional replacement.
- React components не сохраняют независимый semantic graph или compiled model.
- LikeC4 DSL остаётся persisted semantic source of truth.

Целевой контракт находится в [SPEC.md](./SPEC.md). Стабильные work packages и managed state находятся в [ROADMAP.md](./ROADMAP.md) и [ROADMAP.STATUS.md](./ROADMAP.STATUS.md).

## Запуск и проверка

Локальные команды ниже приведены для разработчиков. Agent validation выполняется только GitHub Actions.

```bash
pnpm --filter @likec4/gui-to-code generate
pnpm --filter @likec4/gui-to-code typecheck
pnpm --filter @likec4/gui-to-code test
pnpm --filter @likec4/gui-to-code build
pnpm --filter @likec4/gui-to-code smoke:start
pnpm run pretest:e2e
cd e2e && pnpm exec playwright test -c playwright.gui-to-code.config.ts
```

Standalone workflow `GUI-to-code` собирает production `dist`, сохраняет его как ограниченный по retention artifact, запускает preview smoke и Playwright acceptance против production build.
