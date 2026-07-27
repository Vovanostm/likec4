# Техническое задание: LikeC4 GUI-to-code

## Статус документа

- **Назначение:** целевой продуктовый и технический контракт.
- **Текущее поведение:** только то, что перечислено в `README.md`.
- **План поставки:** `ROADMAP.md`; возможность нельзя считать реализованной только на основании этого ТЗ.
- **Приоритет:** `../../AGENTS.md` → `AGENTS.md` → этот документ → `ROADMAP.md` → task packet агента.

Слова **MUST**, **SHOULD** и **MAY** означают обязательное требование, рекомендуемое решение и допустимый вариант.
Отклонение от MUST требует короткого ADR в `apps/gui-to-code/decisions/` с причиной, альтернативами и проверяемыми
последствиями.

## 1. Назначение и результат

Создать в `apps/gui-to-code` браузерный редактор LikeC4 уровня привычного редактора досок: пользователь создаёт и меняет архитектурную диаграмму непосредственно на канвасе, а приложение в реальном времени показывает валидный LikeC4-код, диагностику и итоговую диаграмму.

Канвас — основной путь работы. Редактор кода — прозрачное производное представление и экспертный способ точной правки, а не обязательный первый экран. Все строки интерфейса, aria-метки, сообщения и подсказки — на русском языке.

### Наблюдаемый основной сценарий

1. Пользователь открывает пустой проект и выбирает «Добавить» → «Актор» или «Компонент».
2. Карточка появляется на канвасе; инспектор предлагает понятное имя и родителя, если он нужен.
3. Пользователь тянет связь из точки выхода одной карточки к другой, задаёт подпись при необходимости.
4. Справа сразу обновляются предпросмотр DSL и диагностика, а диаграмма остаётся интерактивной.
5. Перемещение карточек сохраняет только ручную раскладку выбранного вида; Undo/Redo отменяют и семантические, и геометрические изменения.

## 2. Границы

### В scope

- логические элементы: actor, system, component и все виды текущей LikeC4-спецификации;
- вложенность/FQN, название, описание, технология, теги и стиль элемента;
- направленные связи, подписи, технология, теги, видимость и стиль связи;
- static, dynamic и deployment views, их правила, группы и ручные раскладки;
- множественный выбор, перемещение, соединение, контекстное меню, клавиатура, undo/redo, миникарта и масштаб;
- импорт DSL/рабочей области, локальное сохранение, экспорт DSL и ZIP-рабочей области;
- диагностируемое редактирование: последняя валидная диаграмма не исчезает из-за ошибочного действия.

### Не в scope до выполнения MVP-gate

- совместное редактирование, серверная синхронизация, авторизация, облачное хранение;
- генерация архитектуры ИИ, импорт из Miro/draw.io как семантически безошибочный путь;
- самостоятельный редактор геометрии поверх `@likec4/diagram`;
- сохранение комментариев, форматирования и исходного разбиения файлов после осознанного канонического экспорта.

## 3. UX и интерфейс

Экран состоит из четырёх простых областей: верхней панели, канваса, узкой панели «Структура» и инспектора. Панель кода и диагностики открывается справа по кнопке «Код»; на небольшом экране панели становятся выдвижными.

| Область | Поведение |
| --- | --- |
| Верхняя панель | «Добавить», выбор вида, «Отменить», «Повторить», «Импорт», «Экспорт», индикатор сохранения. |
| Канвас | Панорамирование, масштаб, выделение рамкой, перетаскивание, соединение, контекстное меню, миникарта. |
| Структура | Дерево проекта и видов; выбор синхронизирован с канвасом. |
| Инспектор | Меняет только выбранный объект; показывает простые русские поля и удаление с подтверждением. |
| Код и ошибки | Живой DSL и список ошибок с переходом к объекту/полю. |

### Обязательные действия

- Перетащить пустое место — панорамировать; колесо/жест — масштабировать; `0` — вместить вид.
- Клик — выбрать, `Shift`+клик/рамка — добавить в выделение, `Esc` — снять выделение.
- `Delete`/`Backspace` — удалить после подтверждения зависимостей; `Enter` — переименовать; `Ctrl/Cmd+Z` и `Ctrl/Cmd+Shift+Z` — история.
- Соединение начинается только с явно видимой точки связи; незавершённое соединение отменяется `Esc`.
- Контекстное меню и все команды доступны с клавиатуры. Фокус, состояние, цель кнопки и ошибка объявляются assistive technology.

### Простота

По умолчанию показываются только «Добавить», «Связать», «Удалить» и поля «Название»/«Описание». Вид, технология, теги, стиль, правила вида и раскладка раскрываются в «Дополнительно». Никакой модальной формы не требуется для обычного создания: новое имя получает безопасный черновой placeholder, а фокус переходит в поле названия.

## 4. Архитектура и единый источник истины

В текущем срезе единственный изменяемый документ — строка DSL. Первый canvas-first work package MUST заменить этот
временный owner на однопроектный `EditorWorkspace`; multi-project и IndexedDB добавляются позже без повторной смены
контракта. В каждый момент миграции существует ровно один owner.

Целевой `EditorWorkspace` — единственный владелец источников, изменяемой семантики, layout snapshots и истории операций.
Он содержит source representation, необходимый для source-preserving записи. Код, дерево, канвас и результат компиляции
не владеют копией графа.

```text
canvas / tree / inspector / code editor
                 │ EditorCommand
                 ▼
      EditorWorkspace + history (SSOT)
                 │ revision + sources
                 ▼
 browser compiler / language services
                 │ model, diagnostics, source map
                 ▼
@likec4/diagram + DSL preview + diagnostics
                 │ layout-only change
                 ▼
.likec4/<view>.likec4.snap
```

| Владелец | Ответственность | Не делает |
| --- | --- | --- |
| Workspace/document | Семантика, инварианты, история, source-preserving patch. | Не размещает ReactFlow-узлы. |
| Compiler port | Парсинг, validation, source maps, computed/layouted model. | Не изменяет документ. |
| `@likec4/diagram` | Отрисовка, выбор и геометрия вида. | Не создаёт элементы DSL. |
| UI | Временный фокус, открытые панели и ввод формы. | Не хранит бизнес-граф. |
| Persistence | Версионированное сохранение и ZIP. | Не нормализует модель самостоятельно. |

### Явные контракты

```ts
interface EditorWorkspace {
  version: 1
  activeProjectId: ProjectId
  projects: Record<ProjectId, EditorProject>
  history: EditorHistory
}

interface EditorProject {
  sources: SourceFile[]
  document: SemanticDocument
  manualLayouts: Record<ViewId, ManualLayoutSnapshot>
}

type EditorCommand =
  | { type: 'element.create'; input: CreateElementInput }
  | { type: 'element.patch'; id: ElementId; patch: ElementPatch }
  | { type: 'element.move'; id: ElementId; parentId: ElementId | null }
  | { type: 'element.rename'; id: ElementId; newId: ElementLocalId }
  | { type: 'element.remove'; id: ElementId; cascade: false | 'relations' }
  | { type: 'relation.create'; input: CreateRelationInput }
  | { type: 'relation.patch'; id: RelationId; patch: RelationPatch }
  | { type: 'relation.remove'; id: RelationId }
  | { type: 'view.create'; input: CreateViewInput }
  | { type: 'view.patch'; id: ViewId; patch: ViewPatch }
  | { type: 'view.remove'; id: ViewId }

type LayoutCommand =
  | { type: 'layout.set'; viewId: ViewId; snapshot: ManualLayoutSnapshot }
  | { type: 'layout.reset'; viewId: ViewId }

interface EditorOperation {
  id: OperationId
  expectedRevision: Revision
  semantic?: EditorCommand
  layout?: LayoutCommand
}

interface EditorPort {
  dispatch(operation: EditorOperation): Promise<CommandResult>
  undo(expectedRevision: Revision): Promise<CommandResult>
  redo(expectedRevision: Revision): Promise<CommandResult>
}

type CommandResult =
  | { status: 'applied'; revision: Revision }
  | { status: 'rejected'; revision: Revision; issues: CommandIssue[] }
  | { status: 'conflict'; revision: Revision }

type CanvasIntent =
  | { type: 'element.create.requested'; kind: ElementKind; parentId?: ElementId; point: DiagramPoint }
  | { type: 'relation.create.requested'; sourceId: ElementId; targetId: ElementId }
  | { type: 'selection.changed'; ids: ElementId[] }
```

`applyCommand` — чистая исчерпывающая функция. `EditorOperation` атомарно группирует semantic и layout change, поэтому одно
действие пользователя даёт один шаг истории. Перед фиксацией `EditorPort` проверяет кандидата компилятором. Ошибка
возвращается привязанной к команде и полю, не перезаписывает последнюю валидную ревизию и не добавляется в историю.
Rename меняет локальный ID и все ссылки одним централизованным reference visitor; изменение `title` является обычным
`element.patch`. Удаление сообщает зависимости и требует явного cascade.

`@likec4/diagram` MAY испускать только `CanvasIntent`: запрос на действие и временное selection-состояние. Приложение
преобразует intent в `EditorOperation`. Нельзя расширять `ViewChange` семантическими CRUD-операциями: этот существующий
контракт владеет только видом и manual layout.

### Слой записи и реальное время

- Для существующего DSL семантическая команда MUST использовать owner, принятый в `DG-01`, и создавать минимальный
  source-preserving workspace edit. До закрытия gate нельзя расширять production CRUD за пределы текущего prototype.
  Целевой путь не конкатенирует строки и не вызывает `toDSL()` при каждом действии.
- Канонический генератор `@likec4/generators/likec4` используется при создании нового файла и при явной команде «Нормализовать код». Это действие предупреждает о потере комментариев/форматирования.
- `CompilerPort.compile({ revision, sources })` возвращает ту же `revision`, model, diagnostics и source maps. Результат старой ревизии игнорируется.
- В dev semantic RPC находится в `packages/vite-plugin`; UI вызывает только документированный virtual/RPC contract. Production-редактирование запрещено, пока не появится отдельный аутентифицированный write API.

### Решения, которые нельзя молча предполагать

До реализации semantic CRUD агент MUST закрыть два decision gate:

- **DG-01 Source edits:** доказать на add/rename/remove, какой существующий public API создаёт минимальные workspace edits и
  сохраняет соседние комментарии. Если такого API нет, записать ADR с выбранным владельцем source edits. Самописный
  парсер фигурных скобок и регулярные выражения не принимаются как целевой путь.
- **DG-02 Canvas intents:** доказать минимальное расширение `@likec4/diagram`, которое сообщает create/connect intents и
  не переносит `EditorWorkspace` в package renderer. Изменение публичного `@likec4/diagram` API требует focused tests и
  patch changeset.

Gate закрыт только кодовым spike/test и записанным решением; обзор исходников без исполняемого доказательства недостаточен.

## 5. Инварианты LikeC4

- Каждый FQN уникален; родитель и дочерние FQN согласованы.
- Вид и relation ссылаются только на существующие, доступные в их области сущности.
- Направление связи задаёт исходный и конечный элемент; canvas gesture не меняет его неявно.
- Kind, доступные поля и разрешённые отношения берутся из загруженной specification, а не из отдельного списка в UI.
- Deployment и dynamic semantics используют их собственную область и не маскируются под logical static view.
- Ручная геометрия не является моделью: единственный сохранённый формат — `.likec4/<view>.likec4.snap`.

## 6. Библиотеки и примеры повторного использования

Новая внешняя библиотека для v1 не нужна: в репозитории уже есть требуемые границы.

| Возможность | Решение | Пример в репозитории |
| --- | --- | --- |
| Интерактивная доска | `@likec4/diagram` и встроенный `@xyflow/react` | `packages/likec4-spa/src/pages/ViewEditor.tsx` |
| Диагностика/модель в браузере | `@likec4/language-services/browser` | `apps/gui-to-code/src/compiler.ts` |
| Канонический DSL | `@likec4/generators/likec4` | `packages/generators/src/likec4/index.ts` |
| Исходный редактор при необходимости | Monaco/LSP из Playground | `apps/playground/src/monaco/LanguageClientSync.tsx` |
| Раскладка вида | существующий editor `@likec4/diagram` | `packages/diagram/src/editor/` |

`@xyflow/react` сам по себе не является семантическим редактором LikeC4: он не знает kinds, FQN, views и DSL. draw.io/Miro не используются как внутренняя модель, поскольку создадут второй граф и небезопасный round trip.

## 7. Данные, сохранение и восстановление

- Локальная рабочая область хранится в IndexedDB с версией схемы, атомарной записью ревизии и backup последней валидной ревизии.
- Импорт сначала компилируется в изолированном кандидате. Успех заменяет workspace; ошибка открывает отчёт и не уничтожает текущую работу.
- Экспорт DSL предлагает текущие source files; ZIP включает source, config, `likec4lib` и `.likec4/*.likec4.snap`.
- Кодировка ZIP и миграции имеют version marker. Нераспознанная версия не модифицирует данные и предлагает скачать исходный архив.

## 8. Состояния и ошибки

- **Загрузка:** блокируются семантические команды, но доступна отмена/повтор импорта.
- **Пустой проект:** большая кнопка «Добавить первый элемент» и короткая подсказка соединения.
- **Ошибка команды:** поле подсвечено, причина показана по-русски, канвас остаётся на последней валидной ревизии.
- **Ошибка раскладки:** семантика остаётся сохранённой; предлагаются «Перестроить автоматически» и «Сбросить ручную раскладку».
- **Конфликт/устаревшая ревизия:** команда повторяется только после получения свежего workspace, без silent last-write-wins.
- **Недоступное хранилище:** показывается явное предупреждение и доступен экспорт до закрытия страницы.

## 9. Приёмка

- **AC-01 Canvas CRUD:** пользователь за 60 секунд создаёт actor, component, relation и static view мышью, не набирая DSL.
- **AC-02 Synchronization:** название, вложенность и связь отражаются в русском UI, коде и диаграмме; FQN и references валидны.
- **AC-03 Atomic history:** drag-to-connect создаёт ровно одну направленную связь; Undo/Redo восстанавливают точную семантику и ручную раскладку.
- **AC-04 Failure safety:** некорректное имя, kind или relation не повреждают сохранённый документ и показывают понятную диагностику.
- **AC-05 Accessibility:** рамочное выделение, keyboard-only создание/удаление, `Esc`, focus-visible и aria-label проверены e2e/a11y-тестами.
- **AC-06 Layout persistence:** перемещение узлов переживает перезагрузку и экспорт/импорт через стандартный snapshot.
- **AC-07 Round trip:** import/export сохраняет semantic model; канонический export предупреждает о потере formatting/comments.
- **AC-08 Architecture:** нет прямого импорта language-server в UI, semantic CRUD внутри `ViewChange` и отдельного mutable XYFlow graph state.
- **AC-09 Revision safety:** устаревший compile/result и operation с неверной `expectedRevision` не изменяют workspace.
- **AC-10 Russian UI:** automated scan и browser test не находят пользовательских английских строк в основном сценарии, кроме DSL identifiers и названий технологий.

## 10. Проверки реализации

- unit: reducer, FQN/reference visitor, source patch, history, serializer;
- integration: command → compiler → model/diagnostics → DSL preview;
- e2e: основной сценарий, клавиатура, ошибочная команда, импорт/экспорт, сохранение layout;
- a11y: фокус, labels, контраст и отсутствие keyboard trap;
- contract: generator parse-generate-parse и snapshots;
- build: после появления app test script — `pnpm --filter @likec4/gui-to-code test`, затем `generate`, `typecheck`,
  `build` и `pnpm check:agent-instructions`.

Реализация выполняется по [ROADMAP.md](./ROADMAP.md). Текущее состояние приложения описано в [README.md](./README.md); оно ещё не реализует полный контракт этого ТЗ.

## 11. Контракт agentic-разработки

Каждый task packet MUST содержать:

1. один observable outcome и связанные `AC-*`;
2. bounded write scope и список запрещённых путей;
3. входные интерфейсы и owner затрагиваемого поведения;
4. сохраняемые инварианты и явные non-goals;
5. точные проверки от focused test до build;
6. stop condition и escalation trigger;
7. evidence: изменённые пути, команды с фактическим результатом и residual risks.

Параллельная работа разрешена только после фиксации интерфейса и на непересекающихся write scopes. Один integration owner
владеет общими типами, lockfile, public exports и финальными проверками. Агент не изменяет соседний package ради удобства:
если нужен новый public contract, он останавливает slice на interface proposal или получает отдельный work package.

### Definition of Ready

- задача ссылается на `WP-*`, `AC-*` и при необходимости `DG-*`;
- owner поведения и текущая реализация найдены;
- нет неизвестного решения, меняющего SSOT, public API или сохранённые данные;
- можно назвать первый failing test либо проверяемое исходное состояние.

### Definition of Done

- реализован один вертикальный observable slice без placeholders;
- focused tests защищают требование и error path;
- все затронутые интерфейсы, документация и changeset обновлены;
- formatter, lint/typecheck/test/build выполнены пропорционально diff;
- correctness и architecture review не нашли незакрытых MUST-нарушений;
- README обновлён только фактически доступными возможностями.
