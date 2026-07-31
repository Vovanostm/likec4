# Состояние исполнения roadmap

Дата актуализации: 31 июля 2026  
Текущая ветка: `main`  
WP-05 PR: `https://github.com/Vovanostm/likec4/pull/6` — merged  
WP-05 final implementation head: `79d1d5616bd1e5fd5be3bc8711ebd07def740768`  
WP-05 squash merge commit: `44c2729965754bc27c5e772957032ec3c4d117a2`  
AI-ready WP-06 specification commit: `ec4acb5c0914d8ca922e98c0b903c7b87c363f1a`

Этот файл — изменяемое состояние исполнения. Стабильные outcomes, acceptance criteria и границы work packages находятся в `ROADMAP.md`. Следующий агент обязан прочитать корневой и scoped `AGENTS.md`, `SPEC.md`, `ROADMAP.md`, этот файл и `AI-READY.WP-06.md` до изменений.

## Managed state

```yaml
# managed-state:v2
revision: 9
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
  - WP-02
  - WP-03
  - WP-04
  - WP-05
ready:
  - WP-06
planned:
  - WP-07
  - WP-08
blocked: []
```

## WP-05 — done and merged

### Наблюдаемый результат

Пользователь может:

- создать source-backed static element view для выбранного logical element;
- выбрать доступный view без semantic mutation и нового history entry;
- переместить узлы в canvas edit mode и сохранить стандартную ручную раскладку;
- экспортировать snapshot как `<view>.likec4.snap`;
- сбросить только manual layout без изменения semantic DSL;
- импортировать snapshot с проверкой `ViewId`, view type и структуры;
- перезагрузить страницу и восстановить source и сохранённые snapshots;
- отменить и повторить semantic/layout changes через общую атомарную историю;
- увидеть core layout drift после semantic change без перезаписи snapshot.

### Architecture state

`EditorWorkspace` остаётся единственным owner:

- committed/draft sources;
- manual-layout snapshots;
- revision и compilation state;
- last-valid model;
- shared Undo/Redo history.

Production path:

```text
UI/canvas intent
→ revision-guarded queued EditorOperation
→ source-preserving document edit или standard ViewChange snapshot
→ isolated candidate compile
→ command-specific verification
→ atomic sources + manualLayouts commit
→ one history entry
```

Source-edit owner для static views — browser/Node-compatible `ElementViewDocumentEditService` в `@likec4/language-services`.

Manual layout хранится в versioned envelope `likec4.gui-to-code.manual-layouts.v1` с canonical virtual paths `.likec4/<view>.likec4.snap`. App не владеет XYFlow geometry и не использует semantic `ViewChange`.

### Final evidence

Exact PR head: `79d1d5616bd1e5fd5be3bc8711ebd07def740768`.

- standalone `GUI-to-code` workflow `30654350594` — success;
- root `CI (PR & push)` workflow `30654352163` — success;
- `push` workflow `30654352400` — success;
- Playwright WP-05 acceptance — success без retries;
- agent-instructions и `git diff --check` — success;
- unresolved review threads — none;
- PR mergeable и non-draft до merge;
- squash merge commit — `44c2729965754bc27c5e772957032ec3c4d117a2`.

### Review outcome

Correctness review complete:

- source preservation и target URI ambiguity fail closed;
- candidate compile и exact semantic verification;
- atomic source/layout history;
- manual snapshot persistence/reload/import/export/reset;
- stale selection, dialog focus и toolbar focus исправлены;
- canvas edit mode включается до drag acceptance;
- E2E storage isolation не очищает snapshot при проверяемом reload.

Architecture/product review complete:

- один `EditorWorkspace` и один DSL owner;
- один production `App.tsx`;
- no semantic `ViewChange` extension;
- no app-owned geometry;
- no grammar change;
- no WP-07/WP-08 scope leakage;
- public package additions покрыты focused tests и patch changeset.

## WP-06 — ready

Следующий пакет: dynamic и deployment semantics без обхода document layer.

Исполняемое AI-ready ТЗ:

[`AI-READY.WP-06.md`](./AI-READY.WP-06.md)

Baseline для старта:

- минимально проверенный merged code baseline: `44c2729965754bc27c5e772957032ec3c4d117a2`;
- документация ТЗ зафиксирована commit `ec4acb5c0914d8ca922e98c0b903c7b87c363f1a`;
- агент должен брать фактический latest `main`, сравнить его с baseline и записать exact base SHA в PR body.

WP-06 получает:

- revision-safe `EditorWorkspace`;
- atomic source/manual-layout history;
- source-preserving logical CRUD и static view creation;
- standard manual-layout persistence и core drift;
- synchronized canvas/tree/inspector selection;
- отдельный GUI browser acceptance workflow с failure artifacts.

Обязательные границы:

- dynamic и deployment families имеют собственные typed commands и verification;
- grammar/AST/model/renderer capability сначала доказывается parse → model → render tests;
- existing-source edits используют linked AST/CST owner;
- deployment/dynamic semantics не маскируются под logical/static commands;
- semantic commands не переписывают manual snapshots;
- не начинать IndexedDB, ZIP, multi-project persistence и release hardening;
- final DoD — один green, non-draft, mergeable PR без unresolved review threads;
- не merge без отдельной команды пользователя.
