# Состояние исполнения roadmap

Дата актуализации: 30 июля 2026
Ветка: `feat/gui-to-code-wp01-production-contracts`
PR: #2 — Complete gui-to-code WP-01 production contracts
Базовый commit: `6959b53d3f8d5373dba238713928e9f33e700c74`

Этот файл — изменяемая часть плана. Стабильные outcomes, acceptance criteria и границы work packages находятся в `ROADMAP.md`. Следующий агент обязан прочитать оба файла до выбора `WP-*`.

## Managed state

```yaml
# managed-state:v2
revision: 4
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
ready:
  - WP-02
planned:
  - WP-03
  - WP-04
  - WP-05
  - WP-06
  - WP-07
  - WP-08
blocked: []
```

## WP-00 — done

Реализовано:

- весь пользовательский интерфейс и accessibility labels переведены на русский;
- invalid source draft сохраняет diagnostics и последнюю валидную диаграмму;
- form-команды компилируются до commit и отклоняются атомарно;
- stale async compilation results игнорируются sequence guard;
- устранена повторная компиляция уже проверенной form-команды;
- import обрабатывает пустой файл и ошибки чтения, input сбрасывается после попытки;
- export сохраняет точный текущий `model.c4`;
- добавлены focused tests для draft state, rejected command и stale compilation;
- добавлен production-build startup smoke;
- README приведён к фактическому состоянию;
- добавлен отдельный CI workflow `GUI-to-code` с явным ordered bootstrap generated dependencies;
- исправлен Vite resolution: используется canonical workspace package `@likec4/styles`;
- сохранены package-specific Turbo overrides для `@likec4/generators`.

## WP-01 — done

### DG-01 — source-preserving document edits

Owning package: `@likec4/language-services`.

Публичные primitives:

- `createDocumentEditService`;
- `DocumentEditService`;
- `SourceEditPlan` и `DocumentTextEdit`;
- `RemovalDependencyReport`;
- `applyDocumentTextEdits`;
- `sourceRevision`.

Реализовано:

- browser-compatible AST/CST-backed add element;
- semantic rename declaration и resolved Langium references;
- structured dependency inspection;
- revision-bound explicit cascade approval;
- deterministic non-overlapping workspace edits;
- stale-source rejection;
- URI-based multi-document-ready plan shape;
- browser и Node public exports;
- owning-package tests на реальные linked LikeC4 documents.

Ограничения:

- WP-01 покрывает element add/rename/remove primitives, но не product CRUD;
- unsupported semantic cascade fail-closed;
- применение edit plan и compile-before-commit остаются ответственностью приложения.

### DG-02 — canvas intents

Owning package: `@likec4/diagram`.

Публичные primitives:

- `CanvasIntent`;
- `CanvasIntentHandler`;
- `createCanvasIntentController`;
- optional `LikeC4EditorCallbacks.onCanvasIntent`.

Реализовано:

- element-create request;
- directed relation-create request;
- selection change;
- explicit cancellation contract;
- Escape path;
- tool-change/source-unavailable cancellation;
- duplicate suppression;
- deterministic self-connect rejection;
- backward-compatible optional callback;
- `ViewChange` не расширен semantic operations;
- diagram не импортирует app contracts или language services.

Ограничения:

- production toolbar, drag-to-connect UX, inspector и semantic command execution не реализованы;
- keyboard product UX должен использовать тот же controller в WP-02.

### Integration proof

`apps/gui-to-code/src/wp01-contracts.ts` является compile-only adapter и подтверждает:

- `CanvasIntent` преобразуется только в app-level command candidate;
- revision-bound source edit plan может быть применён к in-memory candidate;
- diagram не выполняет semantic mutation;
- production canvas CRUD не начат.

Runtime semantics edit planner и canvas controller покрыты тестами в owning packages. Отдельный app-runtime test удалён как дублирующий: dedicated GUI-to-code workflow запускает app tests до package build и не предназначен для загрузки runtime entry опубликованного `language-services` package.

### Release

Changeset:

- `.changeset/calm-otters-edit.md` для `@likec4/language-services` и `@likec4/diagram`.

### Reviews

Correctness review:

- исправлена классификация Langium references через AST container chain для relation endpoints и scoped views;
- cascade остаётся revision-bound и fail-closed;
- проверены deterministic/non-overlapping edits и duplicate intent suppression.

Architecture review:

- source остаётся единственным persisted semantic SSOT;
- `@likec4/diagram` не зависит от language services;
- `ViewChange` не загрязнён semantic operations;
- `EditorWorkspace`, history, persistence и WP-02 product UX не начаты;
- Turbo dependency graph не изменён.

## Verification gate

Финальный PR должен пройти на одном head SHA:

```bash
pnpm --filter @likec4/style-preset sources
pnpm --filter @likec4/styles sources
pnpm --filter @likec4/styles emit-pkg
pnpm --filter @likec4/language-server generate
pnpm --filter @likec4/layouts generate
pnpm --filter @likec4/gui-to-code generate
pnpm --filter @likec4/gui-to-code typecheck
pnpm --filter @likec4/gui-to-code test
pnpm --filter @likec4/gui-to-code build
pnpm --filter @likec4/gui-to-code smoke:start
pnpm check:agent-instructions
git diff --check
```

Также обязательны общий Linux/Windows test gate, repository typecheck/type tests, package build/lint/pack smoke, docs, playground, E2E types, Playwright E2E и final quality gate.

## Handoff для WP-02

Следующий агент должен:

1. Проверить merge commit PR #2 и зелёные checks на финальном head.
2. Взять только `WP-02`.
3. Создать однопроектный `EditorWorkspace` как единственного owner sources/revision/history.
4. Подключить `CanvasIntent → EditorOperation → DocumentEditService → compile-before-commit`.
5. Не создавать параллельный semantic graph или persisted XYFlow graph.
6. Сначала реализовать минимальный vertical slice create/connect/selection через существующие owning contracts.
