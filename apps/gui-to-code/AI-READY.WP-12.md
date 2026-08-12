# Техническое задание: LikeC4 GUI-to-code WP-12 — Production-grade Direct Canvas Editing

**Статус:** финальный AI-ready implementation contract
**Репозиторий:** `Vovanostm/likec4`
**Основная область:** `apps/gui-to-code/**`
**Основная ветка:** `main`
**Исторический baseline после WP-11:** `5858553bb7fdeee3a87b5e7ea0e3ca43da59a0e0`
**Предыдущий этап:** WP-11 — direct editing/removal dynamic steps and deployment relations
**Предыдущий PR:** #16 — `feat(gui-to-code): add dynamic and deployment edge editing`
**Рекомендуемая ветка:** `feat/gui-to-code-wp12-direct-canvas-editing`
**Рекомендуемый PR:** `feat(gui-to-code): complete direct canvas editing workflows`

---

# 0. Цель

Довести `apps/gui-to-code` до состояния production-grade canvas-first редактора, где основные структурные операции над LikeC4-моделью выполняются непосредственно на диаграмме.

После WP-12 пользователь должен иметь возможность без обязательного ручного редактирования DSL:

1. выбирать элементы и связи на canvas;
2. просматривать и редактировать их свойства;
3. создавать logical relation через connection handle;
4. создавать dynamic step через connection handle;
5. создавать deployment relation через connection handle;
6. потянуть connection handle на пустое место, создать новый элемент и автоматически связать его с исходным;
7. редактировать и удалять:
   - logical relation;
   - dynamic step;
   - deployment relation;
8. выполнять основные операции с клавиатуры;
9. использовать точные Undo/Redo;
10. получать безопасное fail-closed поведение при stale/invalid operation.

Canvas является пользовательским интерфейсом над semantic model, но **не становится отдельным владельцем semantic state**.

---

# 1. Финальный Definition of Done

Этап считается завершённым только если существует **один PR**, который одновременно:

- green;
- non-draft;
- mergeable;
- имеет `0 unresolved review threads`;
- все обязательные GitHub CI checks зелёные на одном и том же **exact HEAD**;
- удовлетворяет всем Acceptance Criteria из этого документа;
- содержит актуальные README/ROADMAP/PR evidence;
- не содержит известных P0/P1 correctness defects.

**Merge запрещён без отдельной явной команды пользователя.**

---

# 2. Политика валидации

Вся validation evidence должна происходить только из GitHub CI.

Локально **запрещено запускать**:

- test suites;
- Vitest;
- Playwright;
- lint;
- typecheck;
- production build;
- smoke tests.

Допускаются локальные действия, не являющиеся validation:

- чтение файлов;
- поиск;
- анализ исходников;
- редактирование;
- git diff/status;
- подготовка patch.

GitHub CI является единственным acceptance source.

---

# 3. Основные архитектурные инварианты

## 3.1. EditorWorkspace — единственный owner semantic mutation

Любая структурная операция должна проходить через существующий mutation pipeline:

```
UI intent
→ EditorCommand
→ EditorWorkspace
→ expectedRevision
→ EditorOperation
→ AST/CST source edit planner
→ candidate source
→ compile / verify
→ atomic commit
→ workspace history
→ compiled model
→ canvas

```

Запрещено:

- редактировать DSL напрямую из React-компонента;
- выполнять semantic string replacement в UI;
- использовать regex как основной механизм semantic edit;
- модифицировать compiled model напрямую;
- модифицировать canvas graph как canonical state;
- делать renderer владельцем semantic mutation;
- создавать второй mutable semantic graph.

---

## 3.2. DSL — canonical source of truth

Canonical state:

```
LikeC4 DSL source

```

Derived state:

- AST/CST;
- compiled model;
- computed view;
- diagram graph;
- inspectors;
- canvas.

Любая successful semantic operation обязана в конечном итоге изменить DSL.

Изменение только rendered canvas без изменения DSL считается дефектом.

---

## 3.3. Transactionality

Rejected/stale/invalid operation должна оставлять полностью неизменными:

- source;
- workspace revision;
- semantic history;
- manual layout;
- current valid compiled model.

Частичный commit запрещён.

---

## 3.4. Source preservation

При точечном semantic edit должны сохраняться:

- unrelated declarations;
- comments;
- formatting вне edited region;
- другие workspace files;
- declaration order, если его изменение не требуется самой операцией.

Whole-document serialization запрещена, если операция может быть выполнена точным AST/CST edit.

---

## 3.5. Exact semantic identity

Для relation/step editing запрещено использовать как основной identity:

- `source + target`;
- title;
- rendered index;
- transient renderer ID.

Использовать parser/compiler-owned identity:

- `RelationId`;
- `astPath`;
- document URI;
- semantic ID;
- revision/view binding, где применимо.

Duplicate same-endpoint relations должны оставаться независимо редактируемыми.

---

# 4. Phase 0 — Baseline Recovery Gate

Это **обязательный блокирующий gate**.

До его завершения запрещено начинать реализацию новых WP-12 features.

---

## 4.1. Определить actual latest baseline

Перед любыми изменениями агент обязан:

1. получить latest `main`;
2. проверить наличие WP-11 merge commit:

```
5858553bb7fdeee3a87b5e7ea0e3ca43da59a0e0

```

3. если `main` ушёл вперёд — использовать latest `main`;
4. создать WP-12 branch именно от актуального `main`;
5. записать actual baseline SHA в PR body.

SHA из этого ТЗ является исторической нижней границей, а не гарантированным текущим HEAD.

---

## 4.2. Получить fresh baseline CI

На чистом WP-12 baseline до feature changes получить актуальный GUI-to-code CI.

Нельзя считать исторические failures текущей истиной.

Известные ранее проблемы WP-10/WP-05 являются только diagnostic hints.

---

## 4.3. Классифицировать каждый baseline failure

Каждый failure классифицировать как:

- `PRODUCT_REGRESSION`;
- `STALE_TEST`;
- `FLAKY_ENVIRONMENT`;
- `CI_INFRA`;
- `UNKNOWN`.

`UNKNOWN` нельзя игнорировать или маскировать rerun.

---

## 4.4. Baseline repair

### Product regression

Исправлять продукт.

### Stale test

Изменять test только если доказано, что текущий assertion противоречит реальному утверждённому product contract.

### Flaky test

Найти root cause.

Запрещено использовать retry как единственное исправление deterministic race.

---

## 4.5. Особое внимание: WP-10 regression

Исторически был сценарий:

```
create canvas element
→ inline title edit
→ UI показывает новое название
→ source expectation не совпадает

```

Агент обязан проверить actual pipeline:

```
inline editor
→ EditorCommand
→ element.patch
→ source planner
→ candidate source
→ compile
→ commit
→ history

```

Если UI/compiled model изменились, а source нет — это product defect.

Нельзя исправлять такой failure переходом на canvas-only assertion.

---

## 4.6. Особое внимание: WP-05 manual layout regression

Проверить:

- drag;
- manual layout persistence;
- reload;
- export;
- reset;
- import;
- source invariance.

Playwright fixture не должен создавать IndexedDB race через удаление открытой database.

---

## 4.7. Exit criteria Phase 0

Phase 0 завершён только когда:

- fresh baseline GUI-to-code CI green;
- исправленные baseline regressions описаны в PR;
- зафиксирован новый clean SHA.

Этот SHA становится **WP-12 implementation baseline**.

---

# 5. Phase 1 — Architecture Inventory

Перед реализацией новых features агент обязан изучить существующие contracts.

---

## 5.1. Command inventory

Найти существующие commands, относящиеся к:

- element create;
- element create-at-position;
- connected element create;
- element patch;
- element remove;
- logical relation create/patch/remove;
- dynamic step create/patch/remove;
- deployment relation create/patch/remove;
- layout mutation;
- Undo/Redo.

Для каждой WP-12 операции записать в PR Discovery:

- `REUSE`;
- `EXTEND`;
- `NEW REQUIRED`.

Новый command запрещено создавать, если существующий command способен корректно выполнить операцию.

---

## 5.2. Ownership inventory

Зафиксировать:

| ResponsibilityCanonical owner |                                      |
| ----------------------------- | ------------------------------------ |
| semantic truth                | DSL                                  |
| mutation transaction          | EditorWorkspace                      |
| edit planning                 | language-services                    |
| semantic validation           | compiler/language-services/workspace |
| interaction state             | GUI                                  |
| diagram                       | derived renderer                     |
| manual positions              | existing layout owner                |
| history                       | EditorWorkspace                      |

Нельзя добавлять параллельного owner.

---

# 6. Phase 2 — Unified Direct Connection

Нужно реализовать единый direct connection flow для трёх families:

- logical;
- dynamic;
- deployment.

---

## 6.1. Renderer boundary

Renderer callback обязан выдавать только UI intent.

Например:

```
connection gesture
→ GUI interaction
→ EditorCommand

```

Renderer не должен:

- строить DSL edits;
- выбирать source file;
- самостоятельно выполнять semantic mutation;
- хранить semantic relation graph.

---

## 6.2. Lightweight connection policy

Допускается централизованный `canConnect`.

Он предназначен только для UX gating.

Можно проверять:

- current view family;
- endpoint family;
- self-link;
- busy state;
- obviously unsupported gesture;
- invalid current workspace state.

`canConnect` **не должен становиться вторым authoritative semantic validator**.

Окончательная semantic validation остаётся в workspace/language-services.

---

# 7. Slice A — Logical Direct Connection

В logical/element view:

```
drag connection handle A → B

```

создаёт logical relation.

Обязательно:

- mutation через EditorWorkspace;
- source updated;
- compiled model updated;
- canvas обновляется из compiled model;
- один history entry;
- Undo exact;
- Redo exact.

---

# 8. Slice B — Dynamic Direct Connection

В dynamic view:

```
A → B

```

создаёт directed dynamic step.

Проверить:

- direction;
- current view binding;
- self-link rejection;
- duplicate semantics;
- exact source ownership;
- Undo/Redo.

Unsupported dynamic topology должна fail closed.

---

# 9. Slice C — Deployment Direct Connection

В deployment view direct connection создаёт deployment relation только между допустимыми semantic endpoint types.

Canvas visual node type не является достаточным semantic proof.

Authoritative validation должна происходить ниже UI.

---

# 10. Phase 3 — Revision-bound Interaction State

Canvas gesture состоит из нескольких событий и может стать stale.

---

## 10.1. Capture

При начале interaction зафиксировать минимум:

```
interface CanvasInteractionSnapshot {
  readonly viewId: string
  readonly revision: number
  readonly sourceSemanticId: string
  readonly family: 'logical' | 'dynamic' | 'deployment'
}

```

При необходимости также сохранять:

- document URI;
- parser-owned identity;
- astPath.

---

## 10.2. Stale invalidation matrix

Pending interaction считается stale, если произошло хотя бы одно:

- workspace revision changed;
- view changed;
- source removed;
- target removed;
- source semantic identity changed;
- workspace import;
- workspace reload/replacement;
- Undo;
- Redo;
- compilation became invalid;
- relevant relation/element was replaced.

---

## 10.3. Stale behavior

При stale operation:

- mutation не выполняется;
- history не меняется;
- revision не меняется;
- layout не меняется;
- pending interaction очищается;
- показывается русское сообщение.

Пример:

> Рабочее пространство или текущий вид изменились. Повторите действие.

---

# 11. Phase 4 — Atomic Connected Element Creation

Это один из ключевых WP-12 contracts.

Пользователь:

1. начинает connection gesture от существующего элемента;
2. отпускает connection на пустой области canvas;
3. открывается create UI;
4. выбирает element kind;
5. вводит title;
6. подтверждает.

---

## 11.1. Одна atomic user action

Операция обязана создать:

- element;
- initial title;
- relation;
- initial manual position.

Всё это является **одной user transaction**.

---

## 11.2. Undo invariant

После успешного create:

**один Undo удаляет весь результат.**

Нельзя получить:

- orphan relation;
- orphan element;
- orphan layout entry;
- дополнительный Undo только для initial title.

---

## 11.3. Rejected invariant

Если relation нельзя создать либо compile/verification fails:

- element не создаётся;
- title не появляется;
- relation не появляется;
- layout не меняется;
- history не меняется;
- revision не меняется.

---

## 11.4. Command reuse

Сначала проверить существующий `element.createConnected` либо эквивалент.

Если contract достаточен — использовать его.

Новый composite command создавать только при доказанной необходимости.

---

# 12. Phase 5 — Unified Edge Inspector

Один инспектор должен поддерживать:

- logical relation;
- dynamic step;
- deployment relation.

---

## 12.1. Fields

Минимум:

- type/family;
- source — read-only;
- target — read-only;
- title;
- save;
- delete.

---

## 12.2. Exact duplicate handling

Если существует несколько relations между одинаковыми endpoints:

- пользователь должен редактировать точную semantic relation;
- patch/remove одной не должен затрагивать остальные.

---

## 12.3. Save

Save:

- revision-bound;
- source preserving;
- exact identity;
- один history entry.

После success:

- canvas пересчитывается из compiled model;
- inspector остаётся привязан к актуальной entity;
- focus возвращается в редактируемое поле.

---

## 12.4. Delete

Delete использует существующий semantic remove flow.

После success:

- stale inspector cleared;
- edge selection cleared;
- focus возвращается к canvas;
- Undo восстанавливает exact relation;
- Redo удаляет её снова.

---

# 13. Phase 6 — Direct Node Editing

Довести существующий WP-10 flow до production state.

---

## 13.1. Selection

Node click:

- выбирает semantic element;
- синхронизирует Structure/Inspector;
- не создаёт отдельный semantic state.

---

## 13.2. Inline title

Double-click либо `F2`:

- editor получает focus;
- `Enter` commit;
- `Escape` cancel;
- blur не должен отменять уже отправленный Enter;
- double submit запрещён.

---

## 13.3. Delete

Для selected node:

- использовать existing safe removal flow;
- соблюдать dependency checks;
- destructive confirmation;
- корректный focus restoration.

---

# 14. Phase 7 — Keyboard Contract

## 14.1. Edge

При selected edge:

- `Enter` → открыть inspector и focus title;
- `Delete` / `Backspace` → удалить exact edge;
- `Escape` → cancel/clear selection.

---

## 14.2. Node

- `Enter` → inspect/select;
- `F2` → rename;
- `Delete` → safe removal;
- `Escape` → cancel interaction.

---

## 14.3. Input protection

Global canvas keyboard handlers запрещены при focus внутри:

- `input`;
- `textarea`;
- `select`;
- contenteditable;
- code editor;
- modal/dialog fields.

В частности:

- Backspace в title input не удаляет relation;
- Delete в input не удаляет node;
- Enter в form не запускает отдельный canvas command.

---

# 15. Phase 8 — Busy State / Single Flight

Во время semantic mutation:

- connection handles disabled;
- Save disabled;
- Delete disabled;
- create disabled;
- conflicting toolbar actions disabled;
- repeated submit ignored.

UI guard обязателен.

Но final transaction ownership остаётся в workspace.

---

# 16. Phase 9 — Dynamic Fail-closed Semantics

WP-11 limitation сохраняется.

Удаление standalone dynamic step допустимо.

Удаление segment внутри сложного `StepSeries` допустимо только если planner может гарантировать exact semantic transformation.

Если доказать это нельзя:

- reject;
- no mutation;
- no partial rewrite;
- no approximate chain reconstruction.

---

# 17. Phase 10 — Multi-file Source Ownership

Обязательно проверить:

1. element declaration — file A;
2. view — file B;
3. relation — file C;
4. duplicate relations;
5. nested scopes;
6. comments beside target declaration;
7. похожие local IDs в разных scopes.

Mutation должна изменять только owning source document/range.

Запрещено:

- global search/replace;
- first textual match;
- endpoint-only source lookup.

---

# 18. Phase 11 — Manual Layout Invariants

Проверить сохранение layout при:

- relation patch;
- edge delete;
- element title patch;
- logical relation create;
- dynamic relation create;
- deployment relation create;
- connected element creation;
- Undo;
- Redo.

Semantic-only edit не должен сбрасывать позиции unaffected nodes.

Connected create должен создать initial position.

Delete должен удалить orphan layout state.

Rejected operation не должна менять layout.

---

# 19. Language-services Policy

Изменять `packages/language-services/**` только если текущего contract недостаточно.

Порядок предпочтения:

1. reuse existing public API;
2. extend existing internal implementation;
3. package-internal helper;
4. additive public API;
5. breaking public API — только через decision gate.

Любой новый planner должен:

- использовать AST/CST;
- быть exact;
- быть source preserving;
- иметь tests;
- корректно экспортироваться для нужной runtime;
- сопровождаться changeset при public package API change.

---

# 20. Acceptance Criteria

## AC-BASELINE

Fresh baseline CI green до начала WP-12 feature changes.

## AC-CONNECT-LOGICAL

Logical connection handle создаёт exact DSL relation.

## AC-CONNECT-DYNAMIC

Dynamic connection создаёт directed dynamic step.

## AC-CONNECT-DEPLOYMENT

Deployment connection создаёт valid deployment relation.

## AC-CONNECTED-CREATE

Drop на пустой canvas создаёт:

- element;
- title;
- relation;
- position

одной transaction.

## AC-ATOMICITY

Rejected operation не изменяет:

- source;
- revision;
- history;
- layout.

## AC-IDENTITY

Duplicate same-endpoint relations независимо patch/remove.

## AC-STALE

Stale canvas interaction всегда fail closed.

## AC-KEYBOARD

Основные direct operations доступны без мыши.

## AC-INPUT-PROTECTION

Keyboard events внутри editable controls не запускают global canvas commands.

## AC-UNDO-REDO

Undo/Redo восстанавливают exact semantic и layout state.

## AC-MULTIFILE

Mutation изменяет только owning source.

## AC-SOURCE-PRESERVATION

Comments и unrelated formatting сохраняются.

## AC-REGRESSION-WP10

Canvas create + inline title patch изменяют реальный DSL.

## AC-REGRESSION-WP05

Manual layout reload/export/reset/import flow остаётся green.

---

# 21. Обязательная test matrix

## 21.1. Language-services

Покрыть:

- exact owner lookup;
- duplicate relations;
- source comments;
- multi-file owner;
- relation patch/remove;
- dynamic step patch/remove;
- dynamic unsafe segment rejection;
- deployment relation patch/remove;
- rejected edit;
- exact source preservation.

---

## 21.2. EditorWorkspace

Проверить:

- logical relation create;
- dynamic step create;
- deployment relation create;
- connected element atomic create;
- title patch;
- remove;
- stale operation;
- invalid operation;
- expectedRevision;
- revision increments exactly once;
- history exactly once;
- Undo;
- Redo;
- last valid model;
- layout preservation.

---

## 21.3. UI

Проверить:

- edge inspector family switching;
- inline title;
- Save;
- Delete;
- busy state;
- stale state;
- keyboard;
- input protection;
- focus restoration;
- connected-create dialog.

---

# 22. Playwright Acceptance

Минимум следующие end-to-end scenarios обязательны.

---

## PW-12-01 — Logical direct connection

1. открыть element view;
2. drag A → B;
3. relation появляется;
4. открыть Code;
5. exact DSL relation существует;
6. Undo удаляет;
7. Redo возвращает.

Покрывает:

`AC-CONNECT-LOGICAL`, `AC-UNDO-REDO`.

---

## PW-12-02 — Dynamic direct connection

1. открыть dynamic view;
2. connect A → B;
3. directed step появляется;
4. открыть inspector;
5. изменить title;
6. source изменяется;
7. Undo/Redo exact.

---

## PW-12-03 — Deployment direct connection

1. открыть deployment view;
2. connect valid endpoints;
3. relation появляется;
4. patch title;
5. delete;
6. Undo restore.

---

## PW-12-04 — Connected element create

1. drag handle на empty canvas;
2. открыть create UI;
3. выбрать kind;
4. задать title;
5. confirm;
6. новый element появляется в точке drop;
7. relation существует;
8. DSL содержит element и relation;
9. один Undo удаляет всё;
10. Redo возвращает всё.

---

## PW-12-05 — Duplicate relations

1. иметь две relation A → B;
2. выбрать одну;
3. patch/remove одну;
4. вторая остаётся неизменной.

---

## PW-12-06 — Keyboard delete

Для logical/dynamic/deployment edge:

1. select;
2. Delete;
3. exact entity removed;
4. Undo restores.

---

## PW-12-07 — Input protection

1. focus title input;
2. нажать Backspace/Delete;
3. меняется текст;
4. semantic entity не удаляется.

---

## PW-12-08 — Stale interaction

1. начать gesture;
2. изменить workspace/view/revision;
3. завершить старый gesture;
4. operation rejected;
5. source/history/revision/layout unchanged;
6. показать Russian error.

---

## PW-12-09 — Rejected mutation atomicity

Создать заведомо unsupported semantic operation.

Проверить отсутствие любых partial changes.

---

## PW-12-10 — WP-10 regression

1. создать canvas element;
2. изменить title inline;
3. убедиться:
   - canvas title updated;
   - DSL updated;
   - compiled model valid;
4. Undo/Redo exact.

---

## PW-12-11 — WP-05 layout regression

Проверить:

- drag;
- saved manual position;
- reload;
- export;
- reset;
- import;
- source unchanged.

---

# 23. Evidence Matrix

Перед переводом PR в ready PR body обязан содержать:

| Acceptance criterionGitHub CI/Test evidenceResult |           |      |
| ------------------------------------------------- | --------- | ---- |
| AC-BASELINE                                       | exact run | PASS |
| AC-CONNECT-LOGICAL                                | test/run  | PASS |
| AC-CONNECT-DYNAMIC                                | test/run  | PASS |
| AC-CONNECT-DEPLOYMENT                             | test/run  | PASS |
| AC-CONNECTED-CREATE                               | test/run  | PASS |
| AC-ATOMICITY                                      | test/run  | PASS |
| AC-IDENTITY                                       | test/run  | PASS |
| AC-STALE                                          | test/run  | PASS |
| AC-KEYBOARD                                       | test/run  | PASS |
| AC-INPUT-PROTECTION                               | test/run  | PASS |
| AC-UNDO-REDO                                      | test/run  | PASS |
| AC-MULTIFILE                                      | test/run  | PASS |
| AC-SOURCE-PRESERVATION                            | test/run  | PASS |
| AC-REGRESSION-WP10                                | test/run  | PASS |
| AC-REGRESSION-WP05                                | test/run  | PASS |

`PASS` нельзя ставить только на основании code review.

---

# 24. UI / Russian UX

Пользовательские тексты должны быть на русском.

Рекомендуемая терминология:

- «Холст»
- «Инспектор»
- «Структура»
- «Связь»
- «Направленный шаг»
- «Связь развёртывания»
- «Исходный элемент»
- «Целевой элемент»
- «Название»
- «Сохранить»
- «Удалить»
- «Отмена»
- «Отменить»
- «Повторить»

Не переводить DSL keywords и identifiers.

---

# 25. Accessibility

Проверить:

- accessible labels;
- keyboard reachability;
- dialog focus;
- focus restoration;
- canvas не trap-ит Tab;
- `Escape` закрывает transient UI;
- errors объявляются assistive technology;
- busy state отражён accessibility semantics;
- destructive action имеет accessible confirmation.

---

# 26. Explicit Non-goals

WP-12 **не включает**:

- новый layout engine;
- renderer rewrite;
- arbitrary node reparenting;
- manual edge bend-point editor;
- новый generic properties framework;
- новый DSL syntax;
- collaborative editing;
- persistence redesign;
- массовый refactor shared packages;
- unrelated visual redesign;
- unrelated CI cleanup.

Scope creep запрещён.

---

# 27. Decision Gates

Агент обязан остановиться со статусом `BLOCKED`, если для выполнения задачи объективно требуется:

- breaking DSL grammar change;
- SSOT ownership change;
- persistence schema migration;
- новый external dependency;
- breaking public renderer API;
- крупный refactor вне разрешённого scope.

Additive language-services API разрешён только с обоснованием в PR Discovery.

---

# 28. Разрешённый write scope

Допускается изменять:

- `apps/gui-to-code/**`;
- `e2e/tests/gui-to-code/**`;
- `packages/language-services/**` — минимально и доказанно;
- `.changeset/**`;
- GUI-to-code CI workflow;
- related docs.

Без доказанной необходимости не менять:

- unrelated apps;
- root build architecture;
- lockfile;
- shared renderer architecture;
- unrelated workflows/packages.

---

# 29. GitHub CI Contract

Final exact HEAD должен пройти минимум:

1. checkout;
2. package manager setup;
3. frozen dependency install;
4. source generation;
5. language-services relevant tests;
6. language-services typecheck;
7. GUI typecheck;
8. GUI unit tests;
9. production build;
10. production artifact smoke/start;
11. Playwright preparation;
12. full GUI-to-code acceptance;
13. agent instruction validation;
14. `git diff --check`;
15. diagnostics upload при failure.

После любого нового commit старый CI evidence становится недействительным.

---

# 30. CI Failure Loop

При красном CI:

```
find exact failing workflow
→ find exact job
→ find exact step
→ inspect logs/artifacts/traces
→ identify root cause
→ minimal fix
→ push
→ obtain new exact HEAD
→ run required CI
→ repeat

```

Запрещено:

- бессмысленно rerun-ить deterministic failure;
- ослаблять assertion только ради green;
- удалять полезный test;
- скрывать failure skip-ом;
- утверждать «готово» на старом green SHA.

---

# 31. Review Pass A — Architecture / Correctness

После реализации получить **актуальный final diff относительно WP-12 implementation baseline**.

Проверить:

- EditorWorkspace ownership;
- DSL canonicality;
- transactionality;
- source preservation;
- exact identity;
- stale protection;
- duplicate relations;
- multi-file ownership;
- layout correctness;
- history;
- Undo/Redo;
- отсутствие direct DSL UI edits;
- отсутствие shadow semantic graph;
- отсутствие renderer semantic hacks.

Все findings исправить.

После любого fix — новый CI.

---

# 32. Review Pass B — Product / Reliability / Accessibility

На новом актуальном diff проверить:

- discoverability;
- русский UX;
- keyboard;
- focus;
- busy state;
- stale/error messaging;
- destructive confirmation;
- input protection;
- responsive behavior;
- consistency с существующим GUI-to-code UX.

Все findings исправить.

После любого fix — новый exact-HEAD CI.

---

# 33. Documentation

Обновить:

## `apps/gui-to-code/README.md`

Документировать только реально существующие возможности:

- direct element editing;
- direct relation creation;
- dynamic/deployment edge editing;
- connected element creation;
- keyboard support;
- Undo/Redo;
- known limitations.

## `apps/gui-to-code/ROADMAP.STATUS.md`

Зафиксировать:

- WP-11 merged;
- WP-12 complete;
- PR;
- final HEAD/merge readiness;
- known limitations;
- следующий этап, если он уже определён.

---

# 34. PR Body Contract

Финальный PR body должен иметь разделы:

## Baseline

- actual main SHA;
- WP-11 merge SHA;
- WP-12 implementation baseline после Phase 0.

## Baseline recovery

- initial failures;
- classification;
- fixes.

## Discovery

- command inventory;
- ownership inventory;
- required API extensions;
- architectural decisions.

## Implemented

По vertical slices.

## Acceptance evidence

Evidence matrix.

## Review A

Findings + fixes.

## Review B

Findings + fixes.

## Verification

Final exact HEAD и required checks.

## Known limitations

Только реальные оставшиеся ограничения.

---

# 35. Anti-patterns

Считать архитектурным defect:

- React-компонент редактирует DSL;
- regex-based semantic mutation;
- renderer становится semantic owner;
- canvas хранит canonical graph;
- relation ищется только по endpoints;
- stale interaction может commit;
- composite create создаёт несколько independent history entries;
- rejected operation меняет layout;
- orphan layout entry после Undo/Delete;
- test удаляется из-за failure;
- flaky race маскируется retry без анализа;
- public API создаётся без проверки существующего contract;
- новый abstraction дублирует уже существующий owner.

---

# 36. Agent Stop Conditions

Агент **не должен останавливаться** после:

- первого commit;
- открытия PR;
- первой CI ошибки;
- первого review;
- одного исправленного test;
- transient GitHub/tool error.

Автономный цикл продолжается до final DoD.

Остановиться разрешено только если:

1. достигнут DoD;
2. возник decision gate из раздела 27;
3. объективный внешний blocker делает дальнейшую работу невозможной.

В случае blocker агент обязан указать:

- точную причину;
- доказательство;
- минимально необходимое решение пользователя.

---

# 37. Финальный операционный цикл агента

```
read latest main
→ create/verify branch
→ Phase 0 baseline recovery
→ establish clean implementation baseline
→ architecture inventory
→ implement smallest vertical slice
→ push
→ GitHub CI
→ diagnose/fix
→ next slice
→ full acceptance
→ Review A
→ fix
→ exact-HEAD CI
→ Review B
→ fix
→ exact-HEAD CI
→ resolve all review threads
→ mark non-draft
→ verify mergeability
→ verify evidence matrix
→ stop before merge

```

---

# 38. Финальный отчёт

После достижения DoD агент обязан сообщить только проверенные факты:

- PR URL;
- branch;
- base SHA;
- WP-12 implementation baseline SHA;
- final exact HEAD SHA;
- PR draft status;
- mergeability;
- unresolved threads count;
- final CI checks;
- реализованные slices;
- acceptance evidence status;
- known limitations;
- merge status.

Нельзя писать «полностью готово», если хотя бы один обязательный пункт не подтверждён.

---

# 39. Итоговый DoD Checklist

-  Latest main проверен.
-  WP-11 merge присутствует.
-  Fresh baseline CI выполнен.
-  Phase 0 green.
-  WP-12 implementation baseline зафиксирован.
-  Command inventory выполнен.
-  Ownership inventory выполнен.
-  Logical direct connection реализован.
-  Dynamic direct connection реализован.
-  Deployment direct connection реализован.
-  Connected element create реализован атомарно.
-  Один Undo удаляет connected-create полностью.
-  Unified edge inspector работает.
-  Duplicate relations независимо editable.
-  Exact semantic identity применяется.
-  Stale interactions fail closed.
-  Keyboard contract выполнен.
-  Input protection выполнена.
-  Busy/single-flight выполнен.
-  Multi-file ownership проверен.
-  Source preservation проверено.
-  Dynamic unsafe rewrite fail closed.
-  Manual layout invariants выполнены.
-  WP-10 regression green.
-  WP-05 regression green.
-  Language-services tests green.
-  EditorWorkspace tests green.
-  GUI tests/typecheck green.
-  Production build/smoke green.
-  Playwright acceptance green.
-  Agent instruction check green.
-  `git diff --check` green.
-  Evidence matrix заполнена.
-  Review A завершён.
-  Findings Review A исправлены.
-  Review B завершён.
-  Findings Review B исправлены.
-  README обновлён.
-  ROADMAP.STATUS обновлён.
-  PR body актуален.
-  PR non-draft.
-  PR mergeable.
-  `0 unresolved review threads`.
-  Все required checks green на final exact HEAD.
-  Merge не выполнен без отдельной команды пользователя.
