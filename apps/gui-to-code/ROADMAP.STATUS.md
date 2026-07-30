# Состояние исполнения roadmap

Дата актуализации: 30 июля 2026
Ветка: `feat/gui-to-code-wp02-editor-workspace-create`
PR: #3 — Complete gui-to-code WP-02 canvas element creation
Базовый commit: `869835bb646d31b6883cc1301cf486b7df13a3c6`
Проверенный implementation head: `1ce64c4ce5007887d9bc56e4e319f4eb85cd38b5`

Этот файл — изменяемая часть плана. Стабильные outcomes, acceptance criteria и границы work packages находятся в `ROADMAP.md`. Следующий агент обязан прочитать оба файла до выбора `WP-*`.

## Managed state

```yaml
# managed-state:v2
revision: 5
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
  - WP-02
ready:
  - WP-03
planned:
  - WP-04
  - WP-05
  - WP-06
  - WP-07
  - WP-08
blocked: []
```

## WP-00 — done

Реализованы русский пользовательский UX, source/import/export vertical slice, last-valid preservation, compile-before-commit form commands, stale compilation suppression, startup smoke и dedicated GUI-to-code workflow.

## WP-01 — done

### DG-01 — source-preserving document edits

`@likec4/language-services` предоставляет browser-compatible AST/CST-backed `DocumentEditService`, revision-bound `SourceEditPlan`, `DocumentTextEdit`, `applyDocumentTextEdits`, rename/remove dependency contracts и stale-source protection.

### DG-02 — canvas intents

`@likec4/diagram` предоставляет `CanvasIntent`, `CanvasIntentHandler`, `createCanvasIntentController` и optional `LikeC4EditorCallbacks.onCanvasIntent`. Diagram владеет только transient gesture lifecycle и не выполняет semantic mutation.

## WP-02 — done

### Фактический EditorWorkspace API

Owning files:

- `src/editor/contracts.ts`;
- `src/editor/workspace.ts`;
- `src/editor/adapters/language-services.ts`;
- `src/compiler.ts`;
- `src/App.tsx`.

`EditorWorkspace` является единственным runtime owner:

- `committedSources`;
- `draftSources`;
- monotonically increasing `revision`;
- revision-aware compilation state;
- `lastValidModel`;
- history foundation `past/future`;
- serialized semantic dispatch.

React хранит только transient UI state: active tool, feedback, focus и pointer/keyboard interaction state.

### Operation/result contracts

Реализован только фактически поддерживаемый semantic command:

```text
EditorOperation {
  id
  expectedRevision
  semantic: element.create
}
```

Результат имеет варианты `applied`, `rejected` и `conflict`. Stale operation не мутирует workspace. Две операции на одной revision сериализуются: максимум одна применяется, следующая получает conflict.

### Compiler port

Compiler принимает `{ revision, sources[] }` и возвращает `{ revision, diagnostics, model }`.

Семантическая операция выполняется по схеме:

```text
validate expectedRevision
→ plan source edit
→ apply isolated candidate
→ compile candidate revision
→ verify created FQN
→ atomic source/revision/model commit
```

Invalid candidate не меняет committed sources, revision, model или history. Invalid direct draft остаётся видимым отдельно, while last-valid model сохраняется. Stale asynchronous result не заменяет актуальное состояние.

### Canvas adapter и UX

Canvas является primary area. Toolbar предоставляет:

- «Актор»;
- «Система»;
- «Компонент».

Pointer click и keyboard Enter/Space проходят через один `createCanvasIntentController`. Escape отменяет active tool. Canvas point не сохраняется в DSL или отдельный geometry store.

Доступность kind определяется по `lastValidModel.$data.specification.elements`. Недоступный kind disabled и имеет русское объяснение.

### Source edits и ID allocation

Production source-edit adapter использует:

- `createDocumentEditService`;
- `DocumentEditService.planAddElement`;
- `applyDocumentTextEdits`.

Legacy brace scanner не используется canvas create path.

ID выделяется детерминированно и collision-free в root scope:

```text
actor → actor2 → actor3
system → system2 → system3
component → component2 → component3
```

После candidate compile workspace проверяет наличие created FQN в resulting model.

### Persistence и ограничения

Сохранена backward-compatible localStorage schema: persisted source string, workspace реконструируется при startup. Новая persisted schema, IndexedDB и multi-project model не вводились.

Не реализованы в WP-02:

- relation creation;
- nesting;
- rename/remove/patch;
- view CRUD;
- product undo/redo controls;
- manual layout;
- IndexedDB/ZIP;
- backend/RPC;
- parallel semantic graph.

`@likec4/diagram` public API и `ViewChange` не изменялись, changeset не требуется.

## Verification

На implementation head `1ce64c4ce5007887d9bc56e4e319f4eb85cd38b5` успешно завершены:

- `GUI-to-code` workflow run `30564643270`;
- `CI (PR & push)` workflow run `30564643477`;
- `push` workflow run `30564643390`.

Dedicated GUI-to-code gate подтвердил на одном head:

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

Финальные documentation commits обязаны повторно пройти те же required checks перед merge.

## Reviews

### Correctness review

Проверено и исправлено:

- workspace revision увеличивается только после valid commit;
- stale operation fail-closed;
- concurrent same-revision operations не дают silent last-write-wins;
- candidate компилируется до mutation committed state;
- invalid draft не меняет committed source, revision, model или history;
- source edit и compiler выделены в injected ports, поэтому workspace core тестируется без запуска browser language server;
- ID allocation детерминирован;
- created FQN проверяется в compiled model;
- point не попадает в semantic source;
- relation intent не выполняет semantic command в WP-02;
- user-facing errors и statuses на русском.

### Architecture/product-boundary review

Подтверждено:

- `EditorWorkspace` — единственный owner sources/revision/history foundation;
- DSL остаётся semantic persisted SSOT;
- compiled model и diagram derived;
- второго mutable graph нет;
- diagram не импортирует workspace/language-services;
- `ViewChange` не расширен semantic CRUD;
- parser, generators, manual layout, persistence schema и backend не изменялись;
- relation/view/inspector scope не начат;
- public package API не расширялся.

## Handoff для WP-03

WP-03 готов к началу после merge PR #3.

Следующий агент получает:

- stable `EditorWorkspace.dispatch`;
- `EditorOperation.expectedRevision`;
- serialized operation boundary;
- history foundation;
- revision-aware compiler port;
- source-preserving language-services adapter;
- canvas intent controller integration;
- transient selection/tool state;
- compile-before-commit invariant.

WP-03 должен реализовать только directed relation creation и atomic Undo в границах соответствующего task packet. Не менять SSOT и не начинать inspector/view/manual-layout/persistence work packages.