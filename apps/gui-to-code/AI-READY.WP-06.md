# AI-ready техническое задание — WP-06 Dynamic и Deployment semantics

Статус: `ready`  
Дата фиксации: 31 июля 2026  
Репозиторий: `Vovanostm/likec4`  
Рабочая область: `apps/gui-to-code/**`; owning packages изменяются только при доказанном отсутствии необходимого public contract  
Минимально проверенный baseline `main`: `44c2729965754bc27c5e772957032ec3c4d117a2` — squash merge PR #6 / WP-05  
Проверенный implementation head WP-05: `79d1d5616bd1e5fd5be3bc8711ebd07def740768`  
Предлагаемая ветка: `feat/gui-to-code-wp06-dynamic-deployment`  
Целевой PR title: `feat(gui-to-code): add dynamic and deployment workflows`  
Целевой результат: один green, non-draft, mergeable PR в `main`; не merge без отдельной команды пользователя

## 0. Миссия агента

Реализовать только `WP-06` из `ROADMAP.md`.

Пользователь должен получить два честных canvas-first vertical slice:

1. создание dynamic view и направленного dynamic step между существующими logical endpoints;
2. создание deployment view, минимальной deployment entity/reference и deployment relation.

Каждое semantic изменение обязано проходить через существующий revision-safe pipeline:

```text
Russian UI / canvas intent
→ typed EditorCommand
→ queued EditorOperation(expectedRevision)
→ source-preserving document owner
→ isolated candidate compile
→ command-specific semantic verification
→ atomic sources + manualLayouts commit
→ one history entry
→ derived model/tree/canvas render
```

Агент работает автономно. Не запрашивать подтверждение для обычных engineering decisions, исправления тестов или CI. Остановиться можно только по доказанному stop condition из раздела 13.

## 1. Финальный Definition of Done

WP-06 завершён только одновременно при выполнении всех условий:

- dynamic golden flow работает без ручного редактирования DSL;
- deployment golden flow работает без ручного редактирования DSL;
- persisted semantic SSOT остаётся LikeC4 source внутри единственного `EditorWorkspace`;
- canvas и `@likec4/diagram` не становятся владельцами semantic graph и не пишут DSL;
- dynamic/deployment families представлены собственными typed commands и command-specific verification;
- existing-source edits source-preserving и используют принятый AST/CST owner;
- stale, invalid, ambiguous, duplicate и unsupported operations fail closed без mutation state identity;
- Undo/Redo восстанавливает sources и manual-layout snapshots атомарно;
- manual snapshots не переписываются semantic commands;
- весь пользовательский UX, aria-labels, errors, empty/disabled/success states — на русском;
- focused unit/integration/browser tests доказали обе families и отрицательные сценарии;
- `README.md` описывает только реально поддержанный minimum;
- `ROADMAP.STATUS.md` переводит `WP-06` в `done`, `WP-07` в `ready` только после зелёного final head;
- PR не draft, mergeable, без unresolved review threads;
- standalone `GUI-to-code`, root CI и остальные required checks зелёные на одном неизменившемся head;
- проведены два review pass: correctness и architecture/product;
- PR не смержен без отдельной команды пользователя.

## 2. Authority order

Перед изменениями прочитать в указанном порядке:

1. корневой `AGENTS.md`;
2. `apps/gui-to-code/AGENTS.md`;
3. `apps/gui-to-code/SPEC.md`;
4. `apps/gui-to-code/ROADMAP.md`;
5. `apps/gui-to-code/ROADMAP.STATUS.md`;
6. `apps/gui-to-code/README.md`;
7. этот execution plan;
8. contracts, tests и production code на фактическом `main`.

При конфликте более ранний документ имеет приоритет. Код и тесты актуального `main` — факт реализации. Это ТЗ не разрешает переписывать доказанно работающие WP-00…WP-05 contracts без конкретного воспроизводимого дефекта.

Если `main` новее baseline `44c2729`, агент обязан сначала сравнить изменения, подтвердить совместимость и записать фактический base SHA в PR body.

## 3. Проверенный baseline WP-05

Следующие решения считаются frozen, пока не доказана ошибка:

- `EditorWorkspace` — единственный owner committed/draft sources, manual layouts, revision, compilation state, last-valid model и history.
- DSL/source — canonical persisted semantics; model, tree, inspector и canvas производны.
- Все semantic writes идут через дискриминированные `EditorCommand` и serialization queue.
- Source edits принадлежат language/document layer и проверяются candidate compile до commit.
- `@likec4/diagram` владеет renderer, layout и gestures; semantic CRUD через layout-only `ViewChange` запрещён.
- Manual layout хранится только как `.likec4/<ViewId>.likec4.snap`.
- Selection, active view, focus, dialog и active tools — transient UI state.
- Static view creation source-preserving и fail-closed при неоднозначном target URI.
- WP-05 browser flow drag → persist → reload → export → reset → import доказан Playwright без retries.
- WP-07 владеет IndexedDB, ZIP, migrations и multi-project persistence.
- WP-08 владеет release hardening и финальным MVP gate.

Evidence WP-05:

- PR #6 merged как `44c2729965754bc27c5e772957032ec3c4d117a2`;
- final PR head `79d1d5616bd1e5fd5be3bc8711ebd07def740768`;
- `GUI-to-code` run `30654350594` — success;
- root `CI (PR & push)` run `30654352163` — success;
- `push` run `30654352400` — success.

## 4. Обязательный discovery gate до production code

WP-06 нельзя реализовывать на предположениях о grammar или model shape.

Агент обязан найти и доказать исполняемыми tests/prototypes:

- syntax и AST dynamic view;
- syntax и AST dynamic step, direction и endpoints;
- parsed/model representation dynamic view/steps;
- layout/render support dynamic view в browser;
- specification vocabulary deployment entities;
- syntax/AST deployment element, instance/reference и relation;
- parsed/model representation deployment family;
- layout/render support deployment view в browser;
- доступные AST/CST insertion boundaries и document URI ownership.

Создать в PR body таблицу:

| Construct | Grammar/AST owner | Parsed/model representation | Source document/range | Renderer proof | Required edit owner |
| --- | --- | --- | --- | --- | --- |
| Dynamic view | … | … | … | … | … |
| Dynamic step | … | … | … | … | … |
| Deployment view | … | … | … | … | … |
| Deployment entity/reference | … | … | … | … | … |
| Deployment relation | … | … | … | … | … |

До заполнения таблицы и появления parse → model → render proofs production UI и workspace commands не менять.

Если public contract отсутствует, не обходить owner. Зафиксировать точный gap и минимальный interface proposal в `apps/gui-to-code/decisions/`.

## 5. Product scope

### 5.1 Dynamic minimum

Поддержать один законченный сценарий:

1. пользователь создаёт dynamic view с корректным уникальным `ViewId`;
2. выбирает существующие logical endpoints из compiled model;
3. добавляет один направленный dynamic step;
4. document owner вносит минимальный source-preserving edit;
5. candidate компилируется;
6. verification подтверждает exact view type, direction и endpoints;
7. view появляется в selector и рендерится как dynamic;
8. Undo удаляет ровно последнее semantic действие;
9. Redo восстанавливает его;
10. stale revision, invalid/duplicate ID, missing endpoint и unsupported scope отклоняются без mutation.

Не включать без доказанной необходимости:

- parallel/loop/branch groups;
- nested dynamic groups;
- reorder steps;
- advanced step metadata/styles;
- generic visual workflow engine.

### 5.2 Deployment minimum

Поддержать один законченный сценарий:

1. пользователь создаёт deployment view;
2. создаёт минимальную deployment entity, реально разрешённую текущей grammar/specification;
3. при необходимости создаёт instance/reference существующего logical element через typed selector;
4. создаёт одну deployment relation между валидными deployment endpoints;
5. document owner вносит source-preserving edit;
6. candidate компилируется;
7. verification подтверждает exact family, kind, scope/reference target и relation endpoints;
8. deployment view рендерится;
9. Undo/Redo не оставляет dangling references;
10. invalid kind, missing logical target, scope collision, stale revision и unsupported cascade fail closed.

Точный vocabulary определяется discovery gate. Не маскировать deployment entity под logical `element.create` и не использовать static `view.create` с ложным `_type`.

## 6. Explicit non-goals

В WP-06 запрещено начинать:

- IndexedDB и workspace migrations;
- ZIP import/export;
- multi-project persistence UI;
- backend collaboration/cloud sync;
- canonical generator redesign;
- AI generation;
- полное rules/styles CRUD;
- release hardening WP-08;
- собственную XYFlow geometry model;
- grammar expansion только ради удобства UI;
- новый generic command framework вместо расширения существующего pipeline.

Новая dependency допустима только при документированном обязательном gap и review её ownership/cost.

## 7. Typed contracts

После discovery определить минимальные discriminated commands. Имена должны соответствовать фактической domain model. Рекомендуемая форма:

```ts
type EditorCommand =
  | ExistingCommands
  | { type: 'dynamicView.create'; input: DynamicViewCreateInput }
  | { type: 'dynamicStep.create'; input: DynamicStepCreateInput }
  | { type: 'deploymentView.create'; input: DeploymentViewCreateInput }
  | { type: 'deploymentElement.create'; input: DeploymentElementCreateInput }
  | { type: 'deploymentRelation.create'; input: DeploymentRelationCreateInput }
```

Требования:

- dynamic и deployment families различимы на уровне типов;
- command содержит semantic input, но не XY coordinates;
- document port имеет отдельную ответственность на каждый distinct source edit;
- `CommandResult.applied` возвращает stable created IDs/FQNs для selection reconciliation;
- issue codes стабильные и command-specific;
- user messages русские;
- workspace switch exhaustiveness проверяется compile-time test;
- combined semantic+layout operation не вводить без реального атомарного UI action.

## 8. Source-edit owner contract

Existing-source edits выполняются только принятым language/document owner.

Обязательные свойства:

- linked AST/CST и source URI используются для target range;
- exact URI имеет приоритет;
- unique suffix допустим только при единственном результате;
- ambiguous basename fail closed;
- edit plan связан с digest/revision исходных документов;
- identifier, family, scope, endpoint/reference existence и collisions проверяются до edit;
- байты вне edit ranges сохраняются;
- comments, whitespace и соседние declarations не регенерируются;
- повторное применение stale/already-applied plan не создаёт duplicate construct;
- browser и Node exports имеют одинаковую семантику.

Запрещены regex parser, brace parser, global replacement и whole-document regeneration существующего source.

Public API owning package требует focused tests, browser/Node exports и patch changeset. Если public API не нужен, package surface не расширять.

## 9. Workspace execution invariants

Для каждого command:

1. проверить `expectedRevision` и valid workspace state;
2. построить source-preserving candidate;
3. compile candidate изолированно;
4. проверить ровно ожидаемый semantic delta;
5. отклонить ambiguous delta или collateral changes;
6. сохранить sources + existing manualLayouts атомарно;
7. добавить ровно один history entry;
8. вернуть stable identity созданной сущности.

Mandatory verification:

- dynamic view имеет exact `_type`/family;
- dynamic step имеет exact direction и endpoints;
- deployment entity имеет exact kind, scope и optional logical reference target;
- deployment relation принадлежит deployment family и имеет exact endpoints;
- появляется ровно одна ожидаемая сущность/связь;
- существующие manual snapshots не переписываются;
- semantic drift остаётся ответственностью core mechanisms;
- rejected/conflict result сохраняет state identity;
- invalid candidate не заменяет committed или last-valid state;
- Undo/Redo компилирует exact document snapshot перед restore;
- все операции проходят существующую serialization queue.

## 10. Delivery waves

### Wave 0 — Baseline

- fetch latest `main`;
- записать exact base SHA;
- проверить отсутствие overlapping open PR;
- прогнать baseline focused matrix;
- открыть draft PR и зафиксировать scope/non-goals.

Acceptance: baseline green или каждая pre-existing failure документирована до production changes.

### Wave 1 — Grammar/model/render proofs

- выполнить discovery gate раздела 4;
- добавить minimal fixtures;
- доказать parse → model → render для dynamic и deployment;
- определить exact supported minimum.

Acceptance: обе families доказаны исполняемыми tests/prototypes.

### Wave 2 — Document services

Сначала написать focused tests, затем implementation:

- dynamic view create;
- dynamic step create;
- deployment view create;
- deployment entity/reference create;
- deployment relation create;
- exact multi-file target;
- ambiguous target rejection;
- stale plan rejection;
- duplicate/invalid ID;
- missing scope/endpoint/reference;
- byte preservation вне edit range;
- retry/already-applied behavior.

Acceptance: source-edit owner доказан независимо от React/UI.

### Wave 3 — Typed workspace commands

- расширить contracts;
- добавить issue codes/results;
- добавить exhaustiveness proof;
- реализовать candidate compile и command-specific verification;
- доказать atomic history и state identity on reject.

Acceptance: dynamic и deployment command tests green без UI.

### Wave 4 — Dynamic vertical

- Russian create/select controls;
- endpoint selectors из compiled model;
- keyboard alternative;
- focus restoration;
- busy/invalid gating;
- selection reconciliation;
- dynamic browser acceptance.

Acceptance: полный dynamic golden flow green до начала deployment UI.

### Wave 5 — Deployment vertical

- deployment view create/select;
- type-aware entity/reference controls;
- logical target selector;
- deployment relation controls;
- safe Undo/Redo/removal behavior;
- deployment browser acceptance.

Acceptance: полный deployment golden flow green.

### Wave 6 — Negative and regression coverage

- stale action;
- invalid/duplicate ID;
- missing endpoint/reference;
- unsupported kind/scope/cascade;
- invalid direct DSL keeps last valid diagram;
- WP-04 rename/remove regression;
- WP-05 create/select/layout/reload/export/reset/import regression.

Acceptance: новые flows не ослабляют previous-package guarantees.

### Wave 7 — Reviews, docs and exact-head verification

Correctness review:

- source preservation;
- exact semantic delta;
- reference integrity;
- stale/concurrent operations;
- atomic history;
- invalid rollback;
- browser/Node parity.

Architecture/product review:

- one SSOT;
- no semantic `ViewChange` abuse;
- no app-owned geometry;
- no WP-07/WP-08 leakage;
- UI vocabulary совпадает с реальным LikeC4 domain;
- documented support не шире implementation.

Исправить все P0/P1 findings, затем обновить docs и выполнить full final matrix на одном неизменившемся head.

## 11. Browser acceptance

### Dynamic golden flow

```text
select endpoints
→ create dynamic view
→ add directed step
→ assert exact DSL
→ assert dynamic render
→ switch view without revision change
→ Undo
→ Redo
```

### Deployment golden flow

```text
create deployment view
→ create deployment entity/reference
→ create deployment relation
→ assert exact DSL
→ assert deployment render
→ Undo/Redo or safe remove
```

### Negative flow

- stale revision;
- invalid/duplicate ID;
- missing endpoint/reference;
- unsupported deployment kind/scope;
- invalid direct DSL сохраняет last-valid diagram;
- rejected action не меняет source, revision, history и state identity.

Selectors используют roles, labels и domain IDs. Запрещены arbitrary sleeps, pixel-only assertions и implementation-timing selectors.

## 12. Verification matrix

Focused checks запускать после каждой wave. На final head выполнить:

```bash
pnpm install --frozen-lockfile
pnpm --filter @likec4/style-preset sources
pnpm --filter @likec4/styles sources
pnpm --filter @likec4/styles emit-pkg
pnpm --filter @likec4/language-server generate
pnpm --filter @likec4/layouts generate
pnpm --filter @likec4/gui-to-code generate

pnpm --filter @likec4/language-services test -- DocumentEditService
pnpm --filter @likec4/language-services typecheck
pnpm --filter @likec4/gui-to-code typecheck
pnpm --filter @likec4/gui-to-code test
pnpm --filter @likec4/gui-to-code build
pnpm --filter @likec4/gui-to-code smoke:start

pnpm run pretest:e2e
pnpm install --no-lockfile
pnpm install:chromium
pnpm exec playwright test -c playwright.gui-to-code.config.ts

pnpm check:agent-instructions
git diff --check
```

Required GitHub evidence:

- standalone `GUI-to-code` workflow success;
- root `CI (PR & push)` success, включая Linux/Windows, TypeScript, package build, GUI job и downstream quality gate;
- push workflow success, если запускается repository policy;
- no pending/failed required checks;
- no unresolved review threads;
- PR mergeable и не draft;
- все run IDs относятся к одному final head SHA.

## 13. Stop conditions

Остановить implementation и перевести WP в `blocked` можно только при доказанном условии:

- grammar/model не может представить required minimum;
- safe source range отсутствует, а owner/public contract требует отдельного architecture decision;
- browser compiler или renderer не поддерживает construct;
- required change неизбежно вводит второй SSOT или app-owned geometry;
- branch реально изменяется другим executor и возникает риск потери работы;
- новый base несовместимо изменил frozen contracts, а безопасная адаптация невозможна в WP-06.

Перед stop агент обязан предоставить:

- воспроизводимый test/prototype;
- exact failing contract;
- минимальный interface/ADR proposal;
- список выполненных и оставшихся работ.

Не являются stop condition:

- failing tests;
- typecheck/lint/build errors;
- CI infrastructure retry;
- missing fixture;
- необходимость исправить собственную реализацию;
- необходимость второго review pass.

## 14. P0/P1 review blockers

### P0

- второй semantic owner или UI-side source mutation;
- dynamic/deployment представлены misleading static/logical commands;
- whole-document regeneration существующего source;
- stale operation может commit;
- candidate compile или exact semantic verification отсутствует;
- invalid candidate заменяет committed state;
- semantic command переписывает manual snapshots;
- browser acceptance отсутствует;
- final PR green только за счёт retries/flaky suppression.

### P1

- ambiguous target document редактируется молча;
- exact created delta не проверен;
- hard-coded kinds расходятся со specification;
- focus/selection теряются после command;
- Undo/Redo создаёт несколько history entries на одно действие;
- public package change без focused tests/changeset;
- README заявляет неподдержанные сценарии;
- WP-07/WP-08 scope попал в PR без обязательного gap.

## 15. Expected change budget

Основной scope:

- `apps/gui-to-code/src/editor/contracts.ts`;
- `apps/gui-to-code/src/editor/workspace.ts` и focused specs;
- `apps/gui-to-code/src/editor/language-services-adapter.ts`;
- focused document services/specs в принятом owning package;
- minimal dynamic/deployment UI components;
- isolated Playwright specs;
- changeset только при public package surface change;
- `README.md` и `ROADMAP.STATUS.md` после доказанного behavior.

Любое изменение за пределами scope требует evidence в PR body: missing owner, missing public type/export или existing defect, блокирующий WP-06.

## 16. Первые действия агента

1. Прочитать authority documents и это ТЗ.
2. Fetch latest `main`; записать exact base SHA.
3. Подтвердить merge PR #6 и отсутствие overlapping PR.
4. Создать `feat/gui-to-code-wp06-dynamic-deployment`.
5. Прогнать baseline matrix.
6. Открыть draft PR с scope, non-goals и baseline evidence.
7. Заполнить construct inventory table.
8. Добавить parse → model → render proofs.
9. Зафиксировать exact supported minimum.
10. Написать document-owner tests до implementation.
11. Зафиксировать typed commands/results/issues и exhaustiveness.
12. Завершить dynamic vertical.
13. Завершить deployment vertical.
14. Добавить negative/regression acceptance.
15. Провести correctness review и исправить findings.
16. Провести architecture/product review и исправить findings.
17. Обновить docs/roadmap.
18. Выполнить exact-head full matrix и перевести PR из draft.

## 17. Completion report

Финальный ответ агента обязан содержать:

- PR URL;
- base SHA;
- final head SHA;
- exact поддержанные dynamic/deployment scenarios;
- сохранённые architecture boundaries;
- focused tests;
- exact workflow run IDs;
- correctness review findings и fixes;
- architecture/product review findings и fixes;
- unresolved risks или `none`;
- roadmap transition: `WP-06 done`, `WP-07 ready`;
- подтверждение: PR green, mergeable, non-draft, no unresolved threads;
- явное указание, что PR не merged, если пользователь отдельно не приказал merge.
