# AI-ready execution plan — WP-06 Dynamic и Deployment semantics

Статус: следующий `ready` work package после merge WP-05  
Репозиторий: `Vovanostm/likec4`  
Рабочая область: `apps/gui-to-code/**`; owning packages изменяются только при доказанном отсутствии необходимого public contract  
Целевой PR: один squash-mergeable PR в `main`  
Предлагаемая ветка: `feat/gui-to-code-wp06-dynamic-deployment`  
Предлагаемый PR title: `feat(gui-to-code): add dynamic and deployment workflows`

## 0. Execution contract

Реализовать только `WP-06` из `ROADMAP.md`: пользователь должен создавать и изменять минимально полноценные dynamic и deployment сущности через canvas/UI, а каждое semantic изменение должно проходить через существующие revision-safe `EditorWorkspace` и source-preserving document services.

Финальный DoD:

- dynamic и deployment vertical flows работают без ручного редактирования DSL для поддержанного минимального набора;
- source remains canonical persisted semantics;
- canvas/diagram не владеют semantic graph и не пишут DSL;
- все semantic writes проходят `EditorOperation(expectedRevision) → document port → candidate compile → command-specific verification → atomic commit`;
- Undo/Redo атомарно восстанавливает sources и manual-layout snapshots;
- invalid, stale, ambiguous и unsupported operations fail closed без изменения state identity;
- весь пользовательский UX и aria-тексты на русском;
- `ROADMAP.STATUS.md` переводит `WP-06` в `done`, `WP-07` в `ready` только после зелёного final head;
- PR не draft, mergeable, без unresolved review threads, все required checks зелёные на одном неизменившемся head;
- PR не мержить без отдельной команды пользователя.

## 1. Authority order

Перед изменениями прочитать в указанном порядке:

1. корневой `AGENTS.md`;
2. `apps/gui-to-code/AGENTS.md`;
3. `apps/gui-to-code/SPEC.md`;
4. `apps/gui-to-code/ROADMAP.md`;
5. `apps/gui-to-code/ROADMAP.STATUS.md`;
6. `apps/gui-to-code/README.md`;
7. этот execution plan;
8. текущие contracts/tests/code на фактическом `main`.

При конфликте более ранний документ имеет приоритет. Код и тесты на актуальном `main` являются фактом реализации; этот план не разрешает переписывать доказанно работающие WP-00…WP-05 contracts без конкретного дефекта.

## 2. Facts, assumptions, decisions

### Facts, которые нельзя менять без доказанной ошибки

- `EditorWorkspace` — единственный owner sources, manual layouts, revision, compilation state и history.
- Persisted semantic representation — LikeC4 DSL; model/tree/canvas derived.
- `@likec4/diagram` — renderer/layout/gesture owner; semantic CRUD через `ViewChange` запрещён.
- Manual layout хранится только как `.likec4/<view>.likec4.snap`.
- Browser compiler и document edits уже revision-bound; stale candidate не коммитится.
- Static view creation уже source-preserving и fail-closed при неоднозначном target URI.
- Selection, active view, focus, dialog и active tools — transient UI state.
- WP-07 владеет IndexedDB, ZIP, migrations и multi-project persistence; WP-08 владеет release hardening.

### Assumptions, которые агент обязан проверить исполняемым proof

- текущая grammar/AST уже содержит необходимые dynamic/deployment constructs;
- `@likec4/language-services` предоставляет достаточные linked AST/CST boundaries для минимальных edits;
- существующий compiler может layout/render dynamic и deployment views в browser;
- текущий `@likec4/diagram` public API достаточен для отображения и выбора сущностей без нового semantic API.

Если любое предположение не подтверждается focused test/prototype, не обходить owner. Зафиксировать точный gap и минимальный interface proposal в `apps/gui-to-code/decisions/`, пометить WP как `blocked` только если vertical slice действительно невозможно завершить без нового public contract.

### Frozen decisions

- Не использовать regex, brace parser, global string replacement или whole-document regeneration для существующего source.
- Не добавлять второй mutable graph/document model.
- Не импортировать `@xyflow/react` в app для хранения geometry.
- Не расширять grammar ради удобства UI.
- Не добавлять внешние dependencies без доказанного обязательного gap.
- Не начинать relation metadata/style CRUD, IndexedDB, ZIP, multi-file project UI, backend collaboration или AI generation, если они не являются минимально необходимой частью dynamic/deployment vertical.

## 3. Product boundary — minimum complete WP-06

### 3.1 Dynamic workflow

Поддержать один честный end-to-end сценарий:

1. пользователь создаёт dynamic view с корректным уникальным `ViewId`;
2. выбирает существующие logical endpoints из model;
3. добавляет направленный dynamic step через UI;
4. DSL получает минимальный source-preserving dynamic declaration/step;
5. candidate компилируется, view появляется в selector и рендерится как dynamic;
6. Undo удаляет ровно одно последнее semantic действие; Redo восстанавливает его;
7. missing endpoint, stale revision, duplicate/invalid ID и unsupported scope отклоняются без mutation.

Минимальный набор не должен притворяться полным dynamic editor. Parallel/loop/branch/nested groups, step metadata и reorder добавлять только если они обязательны для валидного базового сценария или уже естественно поддерживаются тем же contract без расширения scope.

### 3.2 Deployment workflow

Поддержать один честный end-to-end сценарий:

1. пользователь создаёт deployment view;
2. создаёт минимальную deployment entity, разрешённую текущей specification/grammar;
3. при необходимости создаёт instance/reference существующего logical element через типизированный selector;
4. создаёт одну deployment relation между валидными deployment endpoints;
5. DSL меняется source-preserving, candidate компилируется и deployment view рендерится;
6. remove/Undo/Redo не оставляют dangling deployment references;
7. invalid kind, missing logical target, scope collision, stale revision и unsupported cascade fail closed.

Точный минимальный vocabulary определить по grammar, generated AST, parsed model и существующим fixtures. Не маскировать deployment entity под logical `element.create` и не использовать static `view.create` с ложным `_type`.

## 4. Delivery waves

Каждая волна должна заканчиваться focused tests и review diff. Не переходить к UI, пока document/verification contracts не доказаны.

### Wave 0 — Baseline and executable inventory

- Проверить clean `main`, текущий merge SHA WP-05 и отсутствие незавершённых PR на ту же область.
- Прогнать baseline verification matrix.
- Инвентаризировать grammar/AST/model types/fixtures для:
  - dynamic view declaration;
  - dynamic step/endpoints;
  - deployment specification kinds;
  - deployment elements/instances/relations;
  - deployment view declaration.
- Составить таблицу `construct → AST owner → parsed/model representation → source file/range → renderer proof`.
- Зафиксировать supported minimum и explicit non-goals в PR body до implementation.

Acceptance: ни одного production change до появления исполняемого parse/render proof для обеих families.

### Wave 1 — Document-owner proofs

В `@likec4/language-services` или существующем принятом owner:

- добавить минимальные browser/Node-compatible source-edit services;
- получать target documents/ranges через linked AST/CST и URI;
- применять exact/unique URI resolution; ambiguous basename отклонять;
- возвращать revision-bound edit plans;
- проверять identifier, scope, endpoint existence, collision и construct family до edit;
- не переписывать соседние comments/whitespace/декларации.

Focused tests:

- add dynamic view и один step;
- add deployment view/entity/relation;
- multi-file exact target;
- ambiguous target fail-closed;
- stale plan rejection;
- byte preservation вне edit ranges;
- duplicate/invalid ID и missing scope/endpoint;
- retry после уже применённого candidate.

Публичный API owning package требует patch changeset и exports для browser/node. Если public API не нужен, не расширять package surface.

### Wave 2 — Typed workspace contracts

Расширить `apps/gui-to-code/src/editor/contracts.ts` минимальными discriminated commands. Названия выбрать по фактической domain model; рекомендуемая форма:

```ts
type EditorCommand =
  | ExistingCommands
  | { type: 'dynamicView.create'; input: ... }
  | { type: 'dynamicStep.create'; input: ... }
  | { type: 'deploymentView.create'; input: ... }
  | { type: 'deploymentElement.create'; input: ... }
  | { type: 'deploymentRelation.create'; input: ... }
```

Требования:

- dynamic/deployment families различимы в типах;
- every command carries only semantic input, no XY coordinates;
- document port exposes one method per distinct source-edit responsibility;
- `CommandResult.applied` returns created IDs/FQNs needed for deterministic selection;
- issue codes are stable, command-specific and user messages Russian;
- combined semantic+layout operations не вводить без реального UI action, которое обязано быть атомарным.

Перед реализацией workspace switch добавить compile-time exhaustiveness tests.

### Wave 3 — Workspace execution and verification

Для каждого нового command:

1. validate current state and revision;
2. request source-preserving candidate;
3. compile candidate in isolation;
4. verify exact semantic delta in compiled model;
5. reject ambiguous delta or unexpected collateral changes;
6. commit sources + layouts + one history entry atomically;
7. return stable created/updated identity.

Mandatory invariants:

- dynamic step verification подтверждает direction и exact endpoints;
- deployment verification подтверждает family/kind/scope/reference target;
- relation verification находит ровно одну новую relation нужной family;
- semantic changes preserve existing manual snapshots and expose core drift rather than rewriting snapshots;
- rejected/conflict result preserves state identity;
- Undo/Redo compile exact document snapshots before restore;
- operations use the existing serialization queue.

### Wave 4 — Russian canvas/UI verticals

Добавить только UI, необходимый для supported minimum:

- создание/выбор dynamic и deployment views;
- type-aware create controls;
- endpoint selectors and keyboard alternative;
- deployment logical-reference selector from compiled model;
- clear Russian empty/disabled/error/success states;
- focus restoration after create/cancel;
- selection reconciliation after created/renamed/removed entities;
- `busy` disables conflicting semantic/destructive actions.

UI не парсит DSL, не строит source edits и не хранит duplicate semantic state. Допустимые kinds/endpoints/options derive from specification/compiled model.

### Wave 5 — Browser acceptance

Добавить isolated Playwright flows:

#### Dynamic golden flow

`select scope/endpoints → create dynamic view → add directed step → DSL assertion → render assertion → switch view without revision change → Undo → Redo`

#### Deployment golden flow

`create deployment view → create deployment entity/reference → create relation → DSL assertion → render assertion → safe remove or Undo/Redo`

#### Negative flow

- stale action;
- invalid/duplicate ID;
- missing endpoint/reference;
- invalid direct DSL keeps last valid diagram;
- reload preserves existing WP-05 source/layout behavior without claiming WP-07 workspace persistence.

Selectors use roles/labels/domain IDs, not implementation timing or pixel snapshots. Wait for observable state, not arbitrary sleeps.

### Wave 6 — Reviews, docs and final-head evidence

Correctness review:

- source preservation;
- exact semantic verification;
- reference integrity;
- stale/concurrent operations;
- atomic history;
- invalid rollback;
- browser/node export parity.

Architecture/product review:

- one SSOT;
- no `ViewChange` semantic abuse;
- no app-owned geometry;
- no WP-07/WP-08 scope leakage;
- UI vocabulary matches real LikeC4 domain;
- supported minimum is honestly documented.

Update only after behavior is proven:

- `README.md` current behavior and non-goals;
- `ROADMAP.STATUS.md` managed state/evidence/handoff;
- PR body with final head, checks, reviews and residual risks.

## 5. Test and verification matrix

Run focused checks during development, then the exact final matrix on one unchanged head:

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
- root `CI (PR & push)` success including Linux/Windows, TypeScript, package build, GUI job and downstream quality gate;
- push workflow success if repository policy triggers it;
- no pending/failed required checks;
- no unresolved review threads;
- PR mergeable and not draft.

## 6. Review checklist

### P0 blockers

- second semantic owner or UI-side source mutation;
- dynamic/deployment command represented as static logical command with misleading verification;
- whole-document regeneration for existing source;
- stale operation can commit;
- candidate compile skipped;
- invalid candidate replaces committed state;
- manual snapshots rewritten by semantic command;
- browser acceptance absent.

### P1 blockers

- ambiguous target document edited silently;
- exact created delta is not verified;
- focus/selection lost after command;
- hard-coded kinds diverge from specification;
- Undo/Redo creates multiple history entries for one action;
- public package change without tests/changeset;
- README claims unsupported family coverage.

## 7. Change budget

Expected primary scope:

- `apps/gui-to-code/src/editor/contracts.ts`;
- `apps/gui-to-code/src/editor/workspace.ts` and focused specs;
- `apps/gui-to-code/src/editor/language-services-adapter.ts`;
- new focused document services/specs in accepted owning package;
- minimal dynamic/deployment UI components and tests;
- isolated Playwright specs;
- changeset only for public package surface;
- README/roadmap status after proof.

Changes outside this scope require written evidence in PR body: missing owner, missing type/export, or existing defect blocking WP-06.

## 8. Stop conditions

Stop implementation and mark `blocked` only when one of these is proven:

- grammar/model cannot represent required minimum;
- no safe source range exists and a public owner change requires architecture decision;
- browser compiler/renderer cannot process the construct;
- required change would introduce a second SSOT or own XYFlow geometry;
- branch/head is being concurrently modified by another executor;
- base changed incompatibly and rebase resolution would alter frozen contracts.

A failing test, type error, CI failure or missing fixture is not a stop condition; diagnose and fix it.

## 9. First 12 actions for the next agent

1. Read authority documents and this plan.
2. Fetch latest `main`; record exact base SHA.
3. Confirm PR #6/WP-05 is merged and no overlapping open PR exists.
4. Create branch `feat/gui-to-code-wp06-dynamic-deployment` from that SHA.
5. Run baseline matrix; preserve evidence.
6. Inventory grammar/AST/types/fixtures and produce construct table.
7. Write parse→model→render proofs for one dynamic and one deployment sample.
8. Define supported minimum and explicit non-goals in draft PR body.
9. Implement document-owner focused tests before production adapter code.
10. Freeze typed commands/results/issue codes with exhaustiveness tests.
11. Implement dynamic vertical completely before deployment vertical.
12. Complete deployment vertical, browser acceptance, two review passes, docs and final-head verification.

## 10. Completion report format

Final agent response must state:

- PR URL, base SHA, final head SHA;
- exact supported dynamic/deployment scenarios;
- architecture boundaries preserved;
- focused tests and full workflow run IDs;
- correctness review findings/fixes;
- architecture/product review findings/fixes;
- unresolved risks or `none`;
- roadmap transition (`WP-06 done`, `WP-07 ready`);
- explicit statement that PR was not merged unless the user separately ordered merge.
