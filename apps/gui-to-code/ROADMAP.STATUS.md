# Состояние исполнения roadmap

Дата актуализации: 31 июля 2026  
Ветка реализации: `feat/gui-to-code-wp05-views-manual-layout`  
PR: `https://github.com/Vovanostm/likec4/pull/6`  
Базовый commit: `c857859f868be363469017e9408caf476a40fc02`  
Проверенный implementation head: `05ea91346ebb103589fabb77dc309a08c219a1db`

Этот файл — изменяемая часть плана. Стабильные outcomes, acceptance criteria и границы work packages находятся в `ROADMAP.md`. Следующий агент обязан прочитать `AGENTS.md`, `SPEC.md`, `ROADMAP.md`, этот файл и `AI-READY.WP-06.md` до изменений.

## Managed state

```yaml
# managed-state:v2
revision: 8
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

## WP-05 — done

### Наблюдаемый результат

Пользователь может:

- создать source-backed static element view для выбранного logical element;
- выбрать любой доступный view без semantic mutation и без нового history entry;
- переместить узлы в canvas edit mode и сохранить одну стандартную ручную раскладку;
- экспортировать snapshot как `<view>.likec4.snap`;
- сбросить только manual layout без изменения semantic DSL;
- импортировать snapshot обратно с проверкой `ViewId`, view type и структуры;
- перезагрузить страницу и восстановить source, active compatible view и сохранённые snapshots;
- отменить и повторить semantic и layout changes через общую атомарную историю;
- увидеть core drift после semantic change, не переписывая snapshot.

### Source-edit owner

`@likec4/language-services` предоставляет browser/Node-compatible `ElementViewDocumentEditService`.

Инварианты:

- edit plan строится по linked Langium AST/CST;
- target document разрешается exact URI match или единственным suffix match;
- неоднозначный basename отклоняется до edit;
- plan связан с digest исходных документов;
- invalid identifier, duplicate `ViewId`, missing scope, stale plan и повторное применение fail closed;
- байты вне единственного insertion range сохраняются;
- static view semantics не записываются через layout-only `ViewChange`.

### Workspace, layout и история

`EditorWorkspace` остаётся единственным owner:

- committed/draft sources;
- manual-layout snapshots;
- revision и compilation state;
- last-valid model;
- shared Undo/Redo history.

Production path:

```text
View/create or diagram/layout intent
→ revision-guarded queued EditorOperation
→ source edit or standard ViewChange snapshot
→ isolated candidate compile
→ command-specific semantic/layout verification
→ atomic sources + manualLayouts commit
→ one history entry
```

Manual model materialization передаёт auto-layouted views и `manualLayouts` отдельно в core model. Snapshot не применяется дважды. Drift вычисляется существующими core mechanisms. App не хранит XYFlow geometry и не импортирует `@xyflow/react` как document owner.

### Persistence boundary

WP-05 хранит:

- source в существующем versioned `localStorage` key;
- manual layouts в versioned envelope `likec4.gui-to-code.manual-layouts.v1`;
- canonical virtual file names `.likec4/<view>.likec4.snap`.

Malformed/unsupported envelope диагностируется отдельно. Valid snapshots сохраняются, даже если соседний virtual file повреждён. IndexedDB, migrations, ZIP и multi-project workspace остаются WP-07.

### UX и accessibility

- view selector, create form, layout selector и import/export/reset controls русифицированы;
- create view доступен только при выбранном logical scope;
- после успешного create focus возвращается в selector после React commit;
- cancel возвращает focus на initiator;
- keyboard focus элемента дерева синхронизирует semantic selection;
- canvas приложения сразу переводит LikeC4 diagram в edit mode;
- layout mode передаётся в renderer явно;
- busy/invalid state блокирует конфликтующие commands;
- selection reconciles after create/remove/Undo/Redo и при исчезновении view.

### Verification coverage

Focused tests покрывают:

- source-preserving static view creation;
- multi-file target selection и ambiguous basename rejection;
- stale revision и retry collision;
- exact semantic verification после compile;
- view selection reconciliation;
- layout save/reset/import validation;
- atomic source + layout Undo/Redo;
- malformed, wrong-view и wrong-type snapshots;
- semantic drift при сохранённом snapshot;
- browser flow create/select/Undo/Redo;
- browser flow node drag → persist → reload → export → reset → import;
- regression WP-04 rename/remove keyboard flow.

Обязательные final-head gates:

- standalone `GUI-to-code` workflow: language-services tests/typecheck, app typecheck/unit/build/smoke, isolated Playwright acceptance, agent-instruction check и `git diff --check`;
- root `CI (PR & push)`: Linux/Windows tests, TypeScript/type tests, package build/lint/smoke, GUI job, docs, playground, E2E и quality gate;
- push workflow, если он запускается политикой репозитория;
- mergeable PR без unresolved review threads.

Точные final-head workflow IDs и merge SHA являются evidence в PR #6 и в следующем GitHub issue; implementation code head указан в заголовке этого файла.

### Reviews

Correctness review complete. Исправлены найденные блокеры:

- test runner использует полный source-resolution graph монорепозитория;
- legacy mock fixtures materialize parent-before-child;
- manual layout больше не применяется дважды;
- target URI ambiguity fail closed;
- static view source owner сведён к одной implementation;
- canvas edit mode включается до drag acceptance;
- tree focus восстанавливает актуальную selection после rename;
- toolbar focus переносится после React commit, а не до unmount form.

Architecture/product review complete:

- один `App.tsx`, без временного WP-specific production entrypoint;
- один `EditorWorkspace` и один DSL owner;
- no semantic `ViewChange` extension;
- no app-owned geometry;
- no grammar change;
- no IndexedDB/ZIP/deployment/dynamic scope leakage;
- public package additions имеют focused tests и patch changeset.

## Handoff для WP-06

Следующий ready package: `WP-06` — dynamic и deployment semantics без обхода document layer.

Исполняемый task packet: [`AI-READY.WP-06.md`](./AI-READY.WP-06.md).

WP-06 получает:

- revision-safe `EditorWorkspace` с atomic source/layout history;
- source-preserving logical CRUD и static view creation;
- standard manual-layout persistence и drift;
- synchronized canvas/tree/inspector selection;
- отдельный GUI browser acceptance workflow.

Обязательные границы WP-06:

- dynamic и deployment families имеют собственные typed commands и verification;
- grammar/AST/model/renderer capability сначала доказываются parse→model→render tests;
- existing-source edits используют linked AST/CST owner, не regex или whole-document regeneration;
- deployment/dynamic semantics не маскируются под logical/static commands;
- manual snapshots не переписываются semantic commands;
- не начинать IndexedDB, ZIP, multi-project persistence и release hardening из WP-07/WP-08;
- один green mergeable PR; не merge без отдельной команды пользователя.
