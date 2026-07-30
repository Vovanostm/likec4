# Состояние исполнения roadmap

Дата актуализации: 31 июля 2026
Ветка: `feat/gui-to-code-wp03-relation-undo`
PR: Complete gui-to-code WP-03 relation creation and undo
Базовый commit: `69e8fff7810aab16d789a153857994197a9466eb`
Проверенный implementation head: будет зафиксирован после final-head CI

Этот файл — изменяемая часть плана. Стабильные outcomes, acceptance criteria и границы work packages находятся в `ROADMAP.md`. Следующий агент обязан прочитать оба файла до выбора `WP-*`.

## Managed state

```yaml
# managed-state:v2
revision: 6
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
  - WP-02
  - WP-03
ready:
  - WP-04
planned:
  - WP-05
  - WP-06
  - WP-07
  - WP-08
blocked: []
```

## WP-03 — done

### Relation edit API

`@likec4/language-services` предоставляет browser/Node-compatible `DocumentEditService.planAddRelation`.

Фактический контракт:

- вход: `source`, `target`, optional `documentUri` и `project`;
- endpoints разрешаются через linked Langium model locator;
- relation вставляется по CST boundary model block;
- план содержит URI-aware edits и exact source revision digest;
- comments, declarations и unrelated bytes не генерируются заново;
- missing endpoint, cross-project и self relation fail-closed.

### Workspace relation operation

`relation.create` проходит один production path:

```text
CanvasIntent
→ revision-guarded EditorOperation
→ source-preserving relation edit
→ isolated candidate compile
→ compiled relation set difference
→ exact source/target verification
→ atomic workspace commit
```

Успешная операция увеличивает revision один раз, добавляет ровно один `past` snapshot, очищает `future` и возвращает фактический `RelationId` compiled model. Stale, invalid, source-edit, compile и identity-verification failures не меняют semantic state.

### Atomic Undo

`EditorWorkspace.undo(expectedRevision)` использует ту же очередь, что и dispatch:

- stale Undo возвращает conflict;
- invalid visible draft и empty history fail-closed;
- предыдущие exact source bytes компилируются на `revision + 1` до restore;
- successful Undo удаляет один `past` entry, переносит текущий snapshot в `future`, восстанавливает committed/draft sources и derived model атомарно;
- новая semantic operation после Undo очищает `future`;
- Redo UI не входит в WP-03.

### Canvas и keyboard UX

- «Связать» активирует relation interaction;
- pointer drag использует существующие XYFlow source/target handles и optional logical `onConnect` seam `@likec4/diagram`;
- callback передаёт только logical FQN endpoints и не мутирует diagram edges;
- keyboard source/target chooser вызывает тот же `completeRelationConnection`, `CanvasIntentController` и `EditorOperation` path;
- duplicate completion подавляется controller state;
- Escape/tool change отменяют transient interaction;
- Undo доступен кнопкой «Отменить» и Ctrl/Cmd+Z;
- пользовательские состояния и ошибки русифицированы.

### Verification

Focused suites включают:

- relation source preservation, direction, missing/self endpoint и stale-source protection;
- relation workspace commit, actual identity, failure atomicity и same-revision serialization;
- Undo byte-exact restore, past/future transitions, stale/empty/invalid/compile-rejected paths;
- shared pointer/keyboard intent adapter and self-connect rejection;
- существующие element-create и direct source regressions.

Final workflow run IDs и verified head добавляются после успешного final-head CI.

### Reviews

Correctness review проверяет one gesture → one intent → one operation → one relation → one history entry, direction, identity diff, compile-before-commit, compile-before-restore и byte-exact Undo.

Architecture review подтверждает, что `EditorWorkspace` остаётся единственным owner sources/revision/history, DSL остаётся persisted semantic SSOT, diagram остаётся gesture layer, `ViewChange` не изменён и WP-04 scope не начат.

## Handoff для WP-04

WP-04 получает:

- стабильные element/relation creation operations;
- source-preserving relation adapter;
- compiled relation identity verification;
- revision-safe queued Undo;
- валидные `past/future` transitions;
- transient selection/tool state;
- compile-before-commit и compile-before-restore invariants.

WP-04 не должен заменять workspace или history owner.
