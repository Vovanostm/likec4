# Состояние исполнения roadmap

Дата актуализации: 31 июля 2026
Ветка: `feat/gui-to-code-wp04-inspector-safe-edit`
PR: `https://github.com/Vovanostm/likec4/pull/5`
Базовый commit: `d7347951aa2a9f55d74ba8408cf59cae11167e2b`
Проверенный implementation head: `6179676250dad9db9cde9d83da299e1c96e52035`

Этот файл — изменяемая часть плана. Стабильные outcomes, acceptance criteria и границы work packages находятся в `ROADMAP.md`. Следующий агент обязан прочитать оба файла до выбора `WP-*`.

## Managed state

```yaml
# managed-state:v2
revision: 7
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
  - WP-02
  - WP-03
  - WP-04
ready:
  - WP-05
planned:
  - WP-06
  - WP-07
  - WP-08
blocked: []
```

## WP-04 — done

### Наблюдаемый результат

Inspector, дерево структуры и canvas используют один transient selection, а все semantic changes проходят через `EditorWorkspace` и source-preserving document port.

Пользователь может:

- изменить title, description, technology и tags выбранного logical element;
- переименовать локальный ID с обновлением полного subtree и типизированных ссылок;
- переместить subtree между root и другим logical parent;
- до удаления увидеть полный revision-bound dependency report;
- подтвердить атомарное cascade removal только для точного актуального набора зависимостей;
- отменить и повторить patch, move, rename и remove через общую историю;
- использовать canvas, рекурсивное дерево и inspector с синхронным selection/focus;
- открыть inspector клавишей Enter, удалить через Delete/Backspace, закрыть confirmation через Escape и выполнить Undo/Redo с клавиатуры.

### Document edit owner

`@likec4/language-services` предоставляет browser/Node-compatible `DocumentEditService` для:

- `planPatchElement`;
- `planMoveElement`;
- `planRenameElement`;
- `inspectRemoveElement`;
- `planRemoveElement`.

Правки строятся по linked Langium AST/CST и URI-aware source ranges. Глобальная строковая замена, отдельный brace parser и регенерация всего документа не используются.

Rename/move формируют одно mapping старого subtree в новое, обновляют declaration и typed FQN references. Неоднозначная, недоступная или небезопасная ссылка отклоняет операцию до изменения workspace.

Remove разделяет contained, separate и unsupported dependencies. Report связан с digest актуальных документов и dependency IDs. Cascade выполняется только при точном совпадении revision и полного approved set; stale, missing, unknown или unsupported dependency fail-closed.

### Workspace и история

Production path:

```text
Canvas / Structure / Inspector intent
→ revision-guarded queued EditorOperation
→ source-preserving candidate sources
→ isolated candidate compile
→ command-specific semantic verification
→ atomic commit + one history entry
```

Инварианты:

- `EditorWorkspace` остаётся единственным owner sources, revision, compile state и history;
- DSL остаётся persisted semantic representation;
- selection, focus, dialog и active tool не входят в document state/history;
- patch/move/rename/remove сериализуются той же queue, что create/relation/Undo/Redo;
- candidate compile выполняется до commit;
- subtree move/rename подтверждает точное old→new соответствие каждого ID и сохранение element kind;
- remove подтверждает отсутствие всего исходного subtree;
- rejected/conflict операции сохраняют state identity;
- Undo/Redo сначала компилируют exact source snapshot и только затем атомарно восстанавливают его;
- новая semantic operation после Undo очищает future.

### UX и accessibility

- Inspector и рекурсивная «Структура» полностью русифицированы.
- Canvas/tree/inspector selection синхронизирован без второго semantic graph.
- Все destructive actions блокируются общим `busy` lifecycle.
- Remove dialog имеет `role=dialog`, `aria-modal`, initial focus и локальную обработку Escape без двойного bubbling.
- Cancel восстанавливает focus на initiator; successful remove переводит focus на доступную структуру или canvas.
- Invalid workspace оставляет last valid model доступной, но блокирует semantic commands.

### Verification

Focused suites покрывают:

- patch validation и source preservation;
- subtree rename/move root↔parent, collision/cycle и typed-reference remapping;
- точный dependency report, stale/exact approval и atomic cascade remove;
- rejection при изменении kind любого descendant во время subtree rewrite;
- selection reconciliation и focus-preserving remove flow;
- symmetric byte-exact Undo/Redo и same-revision serialization;
- browser flow patch → rename → safe remove → Undo → Redo;
- изоляцию GUI-to-code Playwright suite от стандартного LikeC4 preview.

Проверенные workflow для implementation head `6179676250dad9db9cde9d83da299e1c96e52035`:

- `CI (PR & push)` run `30612180063` — success: TypeScript/type tests, Linux/Windows tests, package build/lint, packed smoke, E2E types, Playwright E2E, docs, playground, GUI-to-code и quality gate;
- `push` run `30612180173` — success с той же полной matrix;
- отдельный `GUI-to-code` workflow остаётся обязательным merge gate для focused language-services, app build/smoke и GUI browser acceptance на финальном PR head.

### Reviews

Correctness review complete. Исправлены найденные P1:

- patch включён в общий mutual-exclusion `busy` lifecycle;
- subtree verification усилена exact old→new mapping и kind preservation;
- Escape локализован внутри dialog и больше не обрабатывается одновременно корневым editor handler;
- remove confirmation больше не создаёт вложенные busy lifecycles;
- Playwright использует value assertions для controlled textarea и проверяет обновление relation reference;
- стандартный E2E config исключает GUI-specific suite, у которой отдельный app server.

Architecture/product review complete:

- `EditorWorkspace` и DSL ownership не изменены;
- `@likec4/diagram` остаётся gesture/render layer;
- `ViewChange` не расширен semantic CRUD;
- manual layout, persistence schema, grammar, generators и core model не изменены;
- relation metadata/update/remove и view CRUD не начаты;
- второго mutable graph или UI-side source edit path нет.

## Handoff для WP-05

Следующий ready package: `WP-05` — создание/выбор views и standard manual-layout snapshots.

WP-05 получает:

- единый revision-safe `EditorWorkspace`;
- source-preserving logical element/relation edit layer;
- patch/move/rename/remove commands;
- точное reference remapping и dependency inspection;
- синхронный canvas/tree/inspector selection;
- atomic Undo/Redo;
- отдельный GUI browser acceptance workflow.

Обязательные границы WP-05:

- semantic view creation/selection проходит через новый явный `EditorCommand` и document port;
- manual layout хранится только в стандартном `.likec4/<view>.likec4.snap` через существующий LikeC4 editor API;
- layout save/reset не меняет semantic DSL и не создаёт собственную XYFlow geometry model;
- layout drift использует существующие core/diagram механизмы;
- не начинать deployment semantics, IndexedDB/ZIP persistence или release hardening из WP-06–WP-08.
