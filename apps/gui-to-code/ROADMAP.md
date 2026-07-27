# Дорожная карта canvas-first редактора LikeC4

## Цель и границы

Редактор должен давать ощущение Miro: пользователь начинает на бесконечном canvas, добавляет и связывает архитектурные сущности, немедленно видит диаграмму и получает валидный LikeC4 DSL. Canvas — основной способ навигации и создания, а исходный код — всегда доступный, точный результат.

Это не редактор произвольных пикселей. Семантика принадлежит LikeC4: actor, system, component, relation, view и deployment создаются как доменные сущности, а не как свободные фигуры. Не входят в работу backend, совместное редактирование, облачная синхронизация, прямое сохранение в файловую систему, генерация архитектуры ИИ и самостоятельная модель геометрии canvas.

## Неподвижные инварианты

- **Текущая SSOT (фаза 0):** строка DSL. Form-команды строят кандидатный текст и подтверждают его browser language services; дерево, диагностика, модель и canvas производны от него.
- **Целевая SSOT (с первого canvas-first slice):** `EditorWorkspace` с источниками, snapshots, revision и историей. Сначала он однопроектный; multi-project и IndexedDB расширяют этот же контракт. DSL, дерево и canvas остаются производными.
- **Семантические изменения:** только явный дискриминированный `EditorCommand` и чистый document transformer. Не допускаются string-path mutations, скрытые изменения диаграммы или изменение модели из React-компонента.
- **Canvas и layout разделены:** canvas создаёт/выбирает доменные сущности и dispatches commands; `@likec4/diagram` владеет визуализацией и своим редакторским контрактом. Ручная раскладка живёт исключительно в `.likec4/<view>.likec4.snap`, а не в отдельной XYFlow-модели.
- **Надёжность:** невалидный ввод сохраняет доступный текст и diagnostics, но последний успешно скомпилированный model остаётся рендерируемым. В целевом workspace невалидный импорт не заменяет сохранённый документ.
- **Язык UX:** весь пользовательский интерфейс, пустые состояния, подсказки, ошибки и тексты подтверждения — на русском; имена LikeC4 сущностей и DSL остаются на английском.

## Порядок выполнения

Работа идёт по стабильным `WP-*`. Агент берёт только пакет со статусом `ready`, выполняет один вертикальный результат и
обновляет `README.md` только после доказанного пользовательского поведения. Фазы ниже задают продуктовые milestones;
таблица задаёт исполняемые инженерные границы.

```text
WP-00 ──> WP-01 ──> WP-02 ──> WP-03 ──> WP-04 ──> WP-05 ──> WP-06 ──> WP-07 ──> WP-08
 baseline   decisions   create     connect    edit       views      deploy     workspace  release
```

| ID | Наблюдаемый результат | Основной write scope | Зависит от | Доказательство |
| --- | --- | --- | --- | --- |
| WP-00 | Текущий source-first срез безопасен, полностью русифицирован и имеет app test script. | `apps/gui-to-code/**`, CI job приложения | — | Invalid import/command не заменяет valid state; unit test, build, browser smoke. |
| WP-01 | Закрыты `DG-01` и `DG-02`, приняты минимальные source-edit и canvas-intent контракты. | spike/tests в owning packages, `decisions/**`, `SPEC.md` | WP-00 | Исполняемые add/rename/remove и create/connect proofs; ADR; public API review. |
| WP-02 | На canvas можно создать actor/system/component; однопроектный `EditorWorkspace` и revision guard стали SSOT. | document/compiler в app; отдельный canvas adapter в diagram | WP-01 | `AC-01`, `AC-02`, `AC-04`, `AC-09`; canvas → command → compile → render test. |
| WP-03 | Drag-to-connect создаёт ровно одну направленную relation и отменяется одним Undo. | relation command + canvas intent + inspector | WP-02 | `AC-03`; duplicate/stale/self-relation cases; keyboard alternative. |
| WP-04 | Inspector поддерживает patch, nesting, ID rename, safe remove и историю. | app document/inspector/tree | WP-03 | Reference visitor и dependency tests; `AC-02`, `AC-04`, `AC-05`. |
| WP-05 | Виды создаются/выбираются на canvas, manual layout сохраняется стандартным snapshot. | app view UI, diagram editor contract, core manual-layout | WP-04 | `AC-03`, `AC-06`; save/reset/drift integration tests. |
| WP-06 | Canvas workflow покрывает dynamic и deployment semantics без обхода document layer. | app commands/UI; existing domain owners only when required | WP-05 | Parse → command → compile → render tests по каждой family. |
| WP-07 | Workspace переживает reload; import/export DSL/ZIP имеет миграции и semantic round trip. | persistence/codec worker в app, generator only for proven gaps | WP-06 | `AC-07`, `AC-09`; IndexedDB and ZIP round-trip tests. |
| WP-08 | Выполнен MVP-gate: русский UX, accessibility, CI, docs и artifact smoke. | app/e2e/CI/docs | WP-07 | Все `AC-*`, quality matrix и два review pass. |

### Decision gates

- **DG-01 Source edits:** владелец минимальных workspace edits должен быть доказан для add/rename/remove с сохранением
  соседних комментариев. Если public API отсутствует, агент останавливает реализацию и оформляет ADR; regex/brace parser
  из текущего prototype нельзя расширять как целевую архитектуру.
- **DG-02 Canvas intents:** `@likec4/diagram` должен отдать create/connect intent без знания `EditorWorkspace` и без
  семантического расширения `ViewChange`. Публичное изменение требует tests и patch changeset.

### Параллельные дорожки внутри WP

Параллельность разрешена только после согласования типов в `apps/gui-to-code/src/editor/contracts.ts`. Один integration
owner редактирует contracts/public exports, `package.json`, lockfile и changeset.

| Дорожка | Разрешённый scope | Передаёт |
| --- | --- | --- |
| Document | `apps/gui-to-code/src/editor/document/**` | Pure reducer, commands, history и unit tests. |
| Compiler | `apps/gui-to-code/src/editor/compiler/**` | Revision-aware port, diagnostics и integration tests. |
| Canvas | согласованный subset `packages/diagram/src/editor/**` | Только `CanvasIntent`/layout adapter и package tests. |
| UI | `apps/gui-to-code/src/editor/ui/**`, styles | Русские controls, inspector, focus/selection; не меняет contracts. |
| QA | app/e2e tests после появления стабильного interface | Black-box acceptance evidence; production code не меняет. |

Две дорожки не редактируют один файл. Если slice требует незапланированный public API, schema/persistence migration или
новую dependency, агент завершает пакет как `blocked` с interface proposal, а integration owner пересматривает границу.

## Фазы

### Фаза 0 — текущий честный vertical slice

**Результат.** Однофайловый browser-only редактор: import `.c4`, source pane, формы добавления root elements/logical relations/scoped views, live diagnostics, визуализация первого доступного view и export `model.c4`. Текст хранится в versioned `localStorage`.

**Acceptance criteria.**

- Пользователь открывает валидный `.c4`, видит его DSL и диаграмму без сервера.
- Из формы создаются root element, logical relation и scoped view; каждое действие меняет DSL, а canvas обновляется после успешной компиляции.
- Ошибка DSL показывает диагностическое сообщение и не убирает последнюю валидную диаграмму.
- Перезагрузка восстанавливает source из `localStorage`; export скачивает именно текущий `model.c4`.
- Нет заявлений о multi-file, deployments, rename/remove, snapshots, config/library authoring или ZIP: это ещё не реализовано.

**Gate выхода.** Focused unit tests команд и compiler state, typecheck/build приложения, ручная проверка import → form edit → invalid DSL → export.

### Фаза 1 — canvas-first базовый опыт

**Результат.** После `WP-01` canvas становится стартовым экраном: панель создания, контекстное меню/быстрые действия и
inspector создают и редактируют semantic logical entities. Однопроектный `EditorWorkspace` становится SSOT, а DSL preview
остаётся синхронным доказательством результата.

**Acceptance criteria.**

- Новый пользователь создаёт actor/system/component и relation между выбранными сущностями, не открывая source pane.
- Inspector редактирует поддерживаемые имя, описание, technology, tags и relation properties через конкретные `EditorCommand`.
- Выбор на canvas, в дереве и inspector синхронизирован; selection/focus не попадают в document SSOT и не переживают reload как доменные данные.
- Все Russian UX states покрыты: empty, loading/compiling, invalid, disabled, success и подтверждение опасной операции.
- Source preview после каждого успешного действия детерминированно отражает модель; ручной DSL edit по-прежнему поддержан.

**Gate выхода.** Behaviour tests для add/edit/relation и invalid rollback, accessibility smoke check keyboard/focus, browser integration test canvas → DSL → rendered view.

### Фаза 2 — полная логическая модель и безопасные изменения

**Результат.** Поддерживаются scope/nested elements, relation kinds, tags/styles, rename/remove, правила и views, включая динамические flows. Document layer получает history и единый reference visitor.

**Acceptance criteria.**

- `RenameCommand` обновляет все типизированные FQN/view/global references либо операция отклоняется с перечнем зависимостей.
- `RemoveCommand` сначала показывает зависимости; cascade выполняется только после явного Russian confirmation и тестируем как один undoable command.
- Каждый поддержанный canvas/form сценарий имеет ровно один command factory и schema-driven поля/defaults; допустимые значения берутся из specification, parser остаётся окончательной валидацией.
- Undo/redo воспроизводит и отменяет semantic commands без потери ссылочной целостности.
- Для каждого добавленного конструкта есть parse → command → compile → render test; новые формы не дублируют правила parser-а.

**Gate выхода.** Exhaustiveness compile check `EditorCommand`, command/reference/history tests, regression suite для DSL families и diff review без альтернативных источников состояния.

### Фаза 3 — deployments, layout и профессиональная работа с видами

**Результат.** Canvas-first workflow покрывает deployment elements/relations, несколько views, rules/styles и manual-layout editing через существующий LikeC4 editor API.

**Acceptance criteria.**

- Пользователь создаёт deployment view и его сущности/связи через те же semantic command boundaries.
- Создание, выбор и настройка view/rules/styles не требуют ручного редактирования DSL для поддержанного набора.
- Drag/layout использует `LikeC4EditorProvider`; save создаёт стандартный snapshot, reset удаляет только snapshot и никогда не меняет semantic DSL.
- При изменении модели layout drift отражается существующими механизмами core; malformed snapshot диагностируется отдельно и может быть reset/repaired.
- Canvas не импортирует или не реализует собственную геометрию `@xyflow/react`.

**Gate выхода.** Layout save/reset/drift browser tests, focused tests packages/core manual-layout и diagram editor contract, keyboard and responsive QA.

### Фаза 4 — workspace, импорт/экспорт и canonical generation

**Результат.** Существующий однопроектный `EditorWorkspace` расширяется без смены owner: multi-project источники, config,
library declarations, IndexedDB и ZIP-compatible export.

**Acceptance criteria.**

- `EditorWorkspace` — единственный сохранённый документ; compiler worker получает revision + sources, а устаревшие ответы игнорируются.
- Import multi-project ZIP сохраняет typed import references; невалидный импорт не заменяет последний валидный persisted workspace.
- Canonical serializer формирует один `model.c4` на проект, config и `.likec4/<view>.likec4.snap`; результат можно снова импортировать.
- Generator доказывает semantic parse → generate → parse round-trip для каждой поддержанной family: imports, globals, views/rules, dynamic/deployment, styles, config и library declarations.
- Пользователь явно видит предупреждение: canonical export не сохраняет комментарии, formatting, source locations и исходное разбиение файлов.

**Gate выхода.** Worker race tests, IndexedDB migration/reload tests, ZIP round-trip integration, focused generator/core tests и проверка содержимого archive.

### Фаза 5 — выпуск и дальнейшие улучшения

**Результат.** Приложение имеет стабильный release gate, понятный onboarding и наблюдаемые ограничения. Дальнейшие возможности оцениваются только как отдельные решения: collaboration, desktop filesystem adapter, AI-assist, import bridges.

**Acceptance criteria.**

- README, roadmap и root `AGENTS.md` отражают фактическое состояние, а не целевую архитектуру.
- CI запускает отдельные generate/typecheck/test/build checks приложения и соответствующие generator/core/diagram проверки для затронутых контрактов.
- Пройдены Russian UX QA, keyboard navigation, empty/error/recovery flows, narrow and wide viewport smoke tests.
- Есть release checklist: supported DSL matrix, known lossy export behaviour, migration/rollback note, artifact smoke test и итоговый diff review.
- Новая абстракция или dependency появляется только при втором реальном сценарии либо доказанной системной границе.

## Единая тестовая и release-матрица

| Уровень | Доказательство |
| --- | --- |
| Document | CRUD, rename/remove dependencies, cascade confirmation, undo/redo, reference remapping |
| Compiler | valid/invalid source, diagnostics, stale worker replies, last valid model |
| UI | canvas/form/tree selection, Russian states, keyboard/focus, source synchronization |
| Diagram/layout | view rendering, save/reset snapshot, drift/recovery |
| Workspace | import/export ZIP, IndexedDB migration, canonical reimport |
| Release | `generate`, `typecheck`, `test`, `build`, `check:agent-instructions`, format and diff check |

Минимальный release gate для каждого изменения: запускаются наиболее узкие tests изменённой границы, затем `pnpm --filter @likec4/gui-to-code generate`, `typecheck`, `test`, `build`, `pnpm check:agent-instructions`, formatter и `git diff --check`. Непройденная команда фиксируется с фактической причиной и остаточным риском, а не заменяется утверждением о готовности.

## Task packet для агента

Перед началом integration owner создаёт краткий packet:

```yaml
work_package: WP-XX
outcome: одно наблюдаемое поведение
acceptance: [AC-XX]
decision_gates: []
write_scope: []
do_not_edit: []
interfaces: []
invariants: []
non_goals: []
focused_checks: []
integration_checks: []
stop_when: проверяемое условие завершения
escalate_when: public API, SSOT, data format или scope должен измениться
```

Финальный отчёт агента содержит статус `done | blocked | no-op`, changed paths, фактические результаты команд, принятые
решения и residual risks. Утверждение «готово» без evidence не меняет состояние roadmap.

## Состояние исполнения

Редактировать нужно только этот маленький блок; описания WP и acceptance criteria остаются стабильными.

```yaml
# managed-state:v1
revision: 1
contract_review: complete
ready:
  - WP-00
active: []
done: []
planned:
  - WP-02
  - WP-03
  - WP-04
  - WP-05
  - WP-06
  - WP-07
  - WP-08
blocked:
  - work_package: WP-01
    reason: requires WP-00
```
