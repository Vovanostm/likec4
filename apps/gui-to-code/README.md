# LikeC4 GUI-to-code

`@likec4/gui-to-code` — приватный браузерный семантический редактор LikeC4. Пользователь работает преимущественно через canvas, а все подтверждённые изменения проходят через `EditorWorkspace` и сохраняются как LikeC4 DSL и стандартные snapshots ручной раскладки.

Целевая платформа — **desktop**. Приоритет: создание диаграмм, надёжное редактирование и сохранение, история,
импорт/экспорт и скорость работы на desktop. Mobile и отдельная accessibility/WCAG приёмка вне текущего scope
по инструкции пользователя от 5 октября 2026; каноническая policy — root AGENTS.md.

## Возможности MVP

Редактор поддерживает:

- полноэкранный «Просмотр» готовой схемы стандартным рендерером LikeC4, выбор вида, светлой/тёмной темы и масштаба;
- создание и изменение logical elements;
- создание направленных logical relations;
- выбор logical relation непосредственно на ребре, изменение её title и exact source-preserving удаление;
- выбор dynamic step непосредственно на ребре, изменение его title и exact source-preserving удаление standalone step;
- выбор deployment relation непосредственно на ребре, изменение её title и exact source-preserving удаление;
- безопасные patch, rename, move и remove операции с общей историей Undo/Redo;
- панель «История» с названиями действий и прямым переходом к любому подтверждённому состоянию кода и раскладки;
- создание элемента double-click по пустому canvas с преобразованием screen coordinate в flow coordinate;
- контекстное меню по ПКМ на пустом canvas с быстрым созданием actor/system/component и запуском создания связи;
- создание дочернего элемента внутри scope текущего static view;
- атомарное создание element + initial title + directed relation + standard manual-layout position при отпускании connection handle на пустом canvas;
- inline-редактирование display title по double-click или F2;
- единую панель выбора, создания и связи над холстом с keyboard navigation между доступными инструментами;
- контекстное меню по ПКМ на элементе/связи и Shift+F10: название, свойства, связь и безопасное удаление;
- быстрые настройки элемента в контекстном меню: тип из спецификации, форма (актор, компонент, БД,
  очередь, хранилище и другие), цвет включая проектные цвета, назначение/снятие тегов и технология с логотипом;
- ЛКМ только выделяет: выбор и меню не добавляют панель над холстом и не сдвигают его;
- shortcuts `V` для выбора, `L` для связи, `1`–`3` для типов и Enter для создания в центре видимого canvas;
- native Undo/Redo в текстовых полях и изоляцию editor shortcuts от inputs, dialogs, menus и native buttons;
- создание и выбор static views;
- C1 context → C2 containers → C3 components через UI, breadcrumbs, открытие детализации и возврат к родителю;
- выбор технологии в компактном списке с поиском: PostgreSQL, Redis, Kafka, Node.js, React и Docker с логотипами,
  ввод своей технологии и очистка; такой же список доступен для логических связей;
- дерево слоёв со сворачиванием, скрытием и блокировкой поддерева, включая его связи и каскадные изменения;
- размещение новых элементов без sibling overlap и авторасстановка с Undo/Redo, reload и ZIP;
- ручную раскладку мышью, стрелками (5 единиц, Shift — 20) через `.likec4/<view>.likec4.snap`;
- dynamic views и направленные dynamic steps;
- deployment views, узлы развёртывания, именованные `instanceOf` и deployment relations;
- keyboard routes для relation authoring/editing через Shift+F10, Enter, Delete/Backspace, F2 и Escape;
- revision/view-bound canvas interactions для logical, dynamic и deployment edges с fail-closed stale handling;
- холст без открытых боковых панелей при старте; structure, inspector и DSL открываются по запросу;
- одна дополнительная панель за раз: docked на широком экране, overlay с собственным scroll на узком;
- автоматическое восстановление последнего подтверждённого рабочего пространства после reload;
- атомарное сохранение sources, manual-layout snapshots и versioned metadata в IndexedDB;
- транзакционный импорт одного `.c4` файла;
- дерево исходных файлов с поиском по пути и независимым выбором открытого документа;
- редактирование любого исходного файла с общей проверкой, историей и сохранением черновиков при переключении;
- переход к точному объявлению выбранного logical element, включая объявление в межфайловом extend;
- диагностику с именем файла и переходом к нему;
- экспорт открытого исходного файла с сохранением его имени;
- транзакционный импорт и экспорт переносимого workspace ZIP;
- защиту ZIP import от path traversal, абсолютных путей, backslash paths, duplicate/case-collision entries, undeclared entries, CRC mismatch, неподдерживаемого compression, превышения числа записей и размера;
- явное подтверждение destructive workspace replacement;
- token-aware save/import conflicts и отклонение stale completion;
- сохранение последнего valid rendered model при невалидном ручном DSL.

Selection, открытые dialogs, focus, connection mode, diagnostics, compiled model и rendered diagram nodes не сохраняются как domain data.

Кнопка «История» рядом с «Отменить» открывает список состояний текущей сессии. Выбранная запись отмечена
«Сейчас», последующие — «Отменено»; к ним можно вернуться кликом или через «Повторить». Новое изменение
после возврата удаляет отменённые шаги. Код всех файлов и ручная раскладка восстанавливаются вместе,
одной атомарной командой. Перезагрузка или замена проекта начинают новую историю с восстановленного
состояния: IndexedDB/ZIP сохраняют текущую корректную версию, без полной истории сессии.

Проверка глубокой вложенности: поиск по названию/FQN в структуре и списках концов связи, компактное дерево с
ограниченными отступами и полным путём в подсказке, одноуровневая прокручиваемая навигация с закреплённым
возвратом. Из структуры можно создать дочерний логический элемент без промежуточного вида; создание проходит
одной командой и отменяется целиком. Уже объявленные теги доступны в отдельном блоке свойств.
Новые внешние узлы, появившиеся в ручном виде после добавления связи, размещаются вне сохранённых узлов;
их координаты и маршруты сохраняются в стандартном snapshot. Проверки и ограничения:
[аудит глубокой вложенности](tasks/nested-ux-2026-10-06/REPORT.md). Из инспектора можно объявить новый тег и назначить его элементу или логической связи.
Инспектор логической связи редактирует название, описание, технологию и теги; определения тегов и свойства
связей проходят source-preserving planner, compiler и общую историю. Tag styling, переименование/удаление
определений и полный редактор specification/styles остаются вне поддержанного GUI.
Проверки новых свойств: [отчёт](tasks/nested-ux-2026-10-06/PROPERTIES-REPORT.md).

Предыдущий узкий локальный desktop цикл WP-16 проверил: source-preserving свойства, согласованное выделение,
надёжное сохранение ручной раскладки мышью и стрелками, Undo/Redo и ZIP.
App tests: 355/355; production desktop browser acceptance: 54/54; diagram owners: 23/23.
[Заполненный desktop checklist](tasks/ux-audit-2026-10-04/DESKTOP-CHECKLIST.md) и
[исправления/границы доказательства](tasks/ux-audit-2026-10-04/CORRECTIONS.md).
WP-13–WP-15 сохраняют отдельные active delivery статусы; CI/release/human acceptance этим результатом не заменяются.
[Исторический standards audit](tasks/ux-audit-2026-10-04/STANDARDS-CHECKLIST.md) сохраняет прежнюю mobile/WCAG
матрицу; актуальный продуктовый scope задан desktop policy в root AGENTS.md.
Полное WCAG/Core Web Vitals соответствие не заявляется и не является целью текущей поставки.

Расширенный C4 desktop цикл исправляет findings прежнего
[аудита](tasks/c4-service-audit-2026-10-05/REPORT.md). Текущие gates и evidence:
[C4 readiness](tasks/c4-completion/READINESS.md). Прежние 54 tests отдельно не являются C4 product acceptance.
Визуальная приёмка 59-case сборки была отозвана после замечания пользователя. Маршруты, labels, точная
геометрия и её сохранение исправлены; актуальная сборка `index-D4ia-oHx.js`: browser 65/65, app 441/441,
diagram owner 44/44, source owner 35/35, обязательные types/build и независимый desktop critic прошли.
[C4 readiness](tasks/c4-completion/READINESS.md): 15/15 локальных desktop gates PASS;
[причины и доказательства](tasks/c4-connection-readability/REPORT.md).
Готовые примеры, созданные через UI: [C4 сервис](tasks/c4-completion/evidence/complex-c4-model.c4) и
[многоуровневая модель](tasks/c4-completion/evidence/scale-c4-model.c4).

Скрытие и блокировка слоёв — transient controls текущего рабочего пространства; они не меняют DSL, историю или ZIP
и сбрасываются при замене проекта. Блокировка защищает также связи с другими элементами при каскадном удалении,
rename и reparent. Canvas stacking order не имеет отдельного authoring control.
Выбранный вид сохраняется в текущей вкладке и как optional ZIP metadata; старые ZIP без этой metadata поддерживаются.
При replacement асинхронная авторасстановка предыдущего workspace не может заменить текущий canvas.

WP-14 реализует исправления `tasks/UX-FIXES.spec.json`: dirty inspector сохраняет ввод при обновлениях и предлагает
сохранить/отбросить/остаться перед сменой выбора; inline title подтверждается по Enter, Save или уходу focus вне формы,
а stale/rejected draft остаётся доступен. Диалоги используют native modal focus, quick menu закрывается по Tab,
IME composition не вызывает создание/сохранение. Эти browser contracts проверены в локальном browser acceptance WP-16;
реальная IME и human acceptance остаются NOT_RUN.

Создание использует типы загруженной specification, включая custom kinds. Для пустого model/views доступны
«Добавить первый элемент» создаёт root и первый static view атомарно, одним Undo/Redo, затем открывает название
на холсте. ID назначает workspace. Для импортированной модели без views остаётся «Создать вид»: достаточно названия,
необязательный технический ID находится в «Подробности». Скрытие Inspector сохраняет его черновик;
смена выбора по-прежнему проходит existing dirty guard. Текущий browser path проверен в WP-16; отдельный delivery WP-15 остаётся active.
Read-only блокирует semantic/layout actions с видимой причиной, но сохраняет выбор, просмотр и экспорт.
Индикатор различает текущий черновик и сохранённую корректную версию; «Скачать черновик .c4» выгружает открытый
исходный файл. В многфайловом проекте каждый изменённый черновик скачивается отдельно; ZIP содержит последнюю
корректную версию всех файлов.

Follow-up WP-14 разделяет recovery downloads: ZIP последней корректной локальной версии сохраняет все committed
sources и standard snapshots даже при ошибке текущего DSL; отдельный `.c4` содержит текущий открытый draft, а не весь
workspace. Загрузка актуальной версии предупреждает о замене локальной работы и истории; отказ сохраняет текущую
версию. Ошибка подтверждённого удаления показывается внутри modal, а inline title привязан к доступным границам
canvas и реагирует на размер панели/формы. Native browser geometry и focus этих исправлений проверены в WP-16; реальные устройства остаются NOT_RUN.

## Просмотр готовой схемы

Кнопка «Просмотр» в верхней панели открывает последнюю корректную схему без инструментов редактирования.
Используется тот же `@likec4/diagram`, что и в веб-приложении LikeC4, со стандартной сохранённой раскладкой,
логотипами технологий, static/dynamic/deployment views и переходами между видами. Временное скрытие слоёв
редактора не влияет на результат. Можно переключать виды, тему, масштаб и выделять связи элемента.
Кнопка «Вернуться к редактированию» или Escape возвращает в редактор; код, история, выбранный вид,
ручная раскладка и скрытие слоёв сохраняются. При неприменённых свойствах или ошибочном DSL просмотр
предупреждает, что показывает последнюю корректную версию. Это локальный просмотр, публикация сайта не выполняется.
Проверки и границы общего gate: [WP-19 report](tasks/WP-19-diagram-preview-report.md).

## Файлы проекта

В панели «Код» доступны все исходники проекта, их папки, поиск по пути, основной файл и отметки изменений/ошибок.
Открытый документ не меняет `entryDocumentUri`; его выбор переживает reload как tab-local preference.
Кнопка «Открыть исходник элемента» в инспекторе использует parser-owned location и выделяет имя объявления.
При невалидном проекте доступно переключение исходников; переход к объявлению требует исправления ошибок.
Редактор сохраняет исходный CRLF для файлов с единообразными Windows-переводами строк.

Это первый этап композиции. Создание/переименование/удаление файлов, выделение модулей, автоматическая
маршрутизация новых сущностей и визуальный конструктор правил представлений пока не реализованы.
Canvas creation по-прежнему использует существующие правила назначения исходника.
WP-17 evidence: `tasks/WP-17-source-files-report.md`; переносимый пример —
`../../output/playwright/source-files-20261006/modular-example.zip`.

## Поддерживаемая матрица

| Семейство               | Создание                       | Изменение                         | Rename                  | Remove                                                  | Import                                        | Export                      | Canvas |
| ----------------------- | ------------------------------ | --------------------------------- | ----------------------- | ------------------------------------------------------- | --------------------------------------------- | --------------------------- | ------ |
| Logical elements        | Да, включая scoped create-at   | Да, включая inline title          | Да                      | Да                                                      | `.c4`, ZIP                                    | `.c4`, ZIP                  | Да     |
| Logical relations       | Да, включая create-and-connect | Title/description/technology/tags | Через обновление ссылок | Да, exact selected relation                             | `.c4`, ZIP                                    | `.c4`, ZIP                  | Да     |
| Static views            | Да                             | Ограниченно                       | Нет отдельного flow     | Через поддержанный remove flow                          | `.c4`, ZIP                                    | `.c4`, ZIP                  | Да     |
| Dynamic views/steps     | Да                             | Title для выбранного шага         | Нет отдельного flow     | Да для exact standalone step; chain segment fail-closed | `.c4`, ZIP                                    | `.c4`, ZIP                  | Да     |
| Deployment nodes        | Да                             | Ограниченно                       | Нет отдельного flow     | Через поддержанный remove flow                          | `.c4`, ZIP                                    | `.c4`, ZIP                  | Да     |
| Deployment instances    | Да, именованные                | Ограниченно                       | Нет отдельного flow     | Через поддержанный remove flow                          | `.c4`, ZIP                                    | `.c4`, ZIP                  | Да     |
| Deployment relations    | Да                             | Title для выбранной связи         | Через обновление ссылок | Да, exact selected relation                             | `.c4`, ZIP                                    | `.c4`, ZIP                  | Да     |
| Manual layout snapshots | Да, через drag/create-at       | Drag/arrows/buttons/reset         | Не применимо            | Reset                                                   | Snapshot, ZIP                                 | Snapshot, ZIP               | Да     |
| Config/libraries/styles | Нет отдельного authoring UI    | Нет                               | Нет                     | Нет                                                     | Только в пределах фактически принятого source | Только как часть source/ZIP | Нет    |

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

При конфликте сохранения редактор не перезаписывает workspace другой вкладки, даже если импорт повторно использует
revision 0. Save и replacement сравнивают opaque durable token в одной IndexedDB transaction. Rejected import не отменяет
queued saves сохранённого текущего workspace. При невалидном ручном DSL source и diagnostics остаются доступны,
canvas показывает последний valid compiled model, а статус сообщает, что видимый черновик не сохранён.

Порядок accepted imports/recovery назначается сразу после подтверждения, до чтения файла и проверки размера.
Новый подтверждённый запрос supersedes старые ещё не записанные candidates; отказ от подтверждения не отменяет
предыдущий accepted request. Устаревшие результаты чтения и ошибки не заменяют новый workspace/feedback.
Редактирование заблокировано, пока незавершённые replacement operations могут установить рабочее пространство;
уже записанный durable candidate отображается локально, чтобы локальная и сохранённая версии не расходились.

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

Версия самой IndexedDB database — `3`; ключ `metadata` в том же store содержит opaque CAS token вне envelope.
Upgrade с database v1/v2 не переписывает active/backup sources, snapshots и entry metadata. Recovery valid backup,
save, replacement и clear меняют token атомарно. Old v1/v2 writers после upgrade получают VersionError;
blocked upgrade предлагает закрыть старую вкладку. Downgrade не поддерживается: rollback требует export/import
portable v1 в совместимом приложении. См. `decisions/DG-FIX-PERSISTENCE.md`.

Неизвестная или повреждённая версия не гидратируется поверх valid active workspace. Для восстановления пользователь может импортировать ранее экспортированный ZIP/`.c4` либо очистить browser storage для приложения и начать со starter workspace.

Portable ZIP использует authoritative `workspace.json`. В v1 manifest разрешает только роли `source` и `manual-layout`:
все source files сохраняются с исходными URI/байтами, а `entryDocumentUri` сохраняется отдельно и не выводится из
сортировки файлов. Snapshots сохраняются как байты архива. Codec формирует deterministic store-only entries;
неподдерживаемое compression отклоняется.

## Lossy behaviour и ограничения

Workspace ZIP сохраняет committed source files, исходное разбиение этих файлов, явный entry-document metadata, standard
manual-layout snapshots и versioned metadata. Config, libraries и styles не представлены отдельными manifest roles и
сохраняются только в пределах фактически экспортируемых source files. Комментарии и formatting сохраняются только
потому, что экспортируются существующие source bytes; отдельная canonical regeneration может быть lossy и не является
обещанием этого MVP.

Source locations, diagnostics, compiled models, selection, focus, открытые dialogs и canvas runtime state не переносятся как persisted domain data.

Не поддерживаются:

- совместное редактирование;
- backend или cloud sync;
- прямая интеграция с desktop filesystem;
- произвольное multi-project authoring сверх фактически импортируемого workspace;
- полное authoring-покрытие config, libraries и styles;
- relation style authoring и metadata кроме title для dynamic steps и deployment relations;
- удаление одного segment из dynamic `StepSeries`, если для этого требуется структурное переписывание соседних шагов;
- создание нового logical element через empty-drop из dynamic/deployment view;
- полная поддержка всего LikeC4 DSL;
- AI-assisted architecture generation;
- lossless canonical regeneration любого входного DSL.

## Архитектура

- `EditorWorkspace` владеет sources, layouts, revision, compilation state и history.
- `src/editor/language-services-adapter.ts` координирует public document planners; React components DSL не строят.
- `DocumentEditService` владеет AST/CST edits логических связей (title/description/technology/tags/remove) и объявлением тегов; identity берётся из compiled relation ID.
- `DynamicDeploymentDocumentEditService` владеет source-preserving create/patch/remove для dynamic steps и deployment relations через AST/CST.
- `src/editor/use-canvas-entity-editor.ts` владеет только transient selection/menu/inline-edit state и captured revision/view для stale protection.
- `src/editor/persisted-workspace.ts` задаёт versioned serializable envelope и validation boundary.
- `src/editor/indexeddb-workspace.ts` реализует atomic IndexedDB port и optimistic token/revision checks.
- `src/editor/workspace-bundle.ts` отображает workspace в manifest и обратно, но не компилирует DSL и не становится semantic model.
- `src/editor/zip-store.ts` реализует bounded deterministic ZIP codec.
- `src/editor/use-durable-workspace.ts` координирует hydration, queued saves и isolated transactional replacement.
- React components не сохраняют независимый semantic graph или compiled model.
- LikeC4 DSL остаётся persisted semantic source of truth.

Целевой контракт находится в [SPEC.md](./SPEC.md). Стабильные work packages и managed state находятся в [ROADMAP.md](./ROADMAP.md) и [ROADMAP.STATUS.md](./ROADMAP.STATUS.md).

## Запуск и проверка

Локальные команды ниже приведены для разработчиков. CI/release acceptance выполняется GitHub Actions; локальные проверки фиксируются отдельно.

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
