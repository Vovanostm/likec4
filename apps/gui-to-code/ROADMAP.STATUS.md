# Состояние исполнения roadmap

Дата актуализации: 3 августа 2026  
Текущая ветка: `feat/gui-to-code-wp07-durable-workspace`  
WP-06 PR: `https://github.com/Vovanostm/likec4/pull/7` — merged  
WP-06 squash merge commit: `88f13a7a8384217d73245d4350ae71288935a0aa`  
WP-07 PR: `https://github.com/Vovanostm/likec4/pull/8`

Этот файл — изменяемое состояние исполнения. Стабильные outcomes и acceptance criteria находятся в `ROADMAP.md`.

## Managed state

```yaml
# managed-state:v2
revision: 11
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
  - WP-02
  - WP-03
  - WP-04
  - WP-05
  - WP-06
  - WP-07
ready:
  - WP-08
planned: []
blocked: []
```

## WP-07 — implementation complete

### Наблюдаемый результат

Пользователь может:

- закрыть или полностью перезагрузить страницу и восстановить последний valid workspace;
- хранить committed sources, manual-layout snapshots и metadata одной IndexedDB transaction;
- импортировать один `.c4` как полную transactional workspace replacement;
- экспортировать текущий source как `model.c4`;
- импортировать и экспортировать переносимый workspace ZIP;
- получить прежний workspace после невалидного `.c4`, повреждённого ZIP или unsupported version;
- видеть русские состояния восстановления, сохранения и ошибок;
- явно подтвердить destructive import, который сбрасывает Undo/Redo history.

### Architecture state

`EditorWorkspace` остаётся единственным owner semantic state. Persisted envelope `likec4.gui-to-code.workspace` version `1` содержит только:

- committed source files;
- standard `.likec4/<ViewId>.likec4.snap` snapshots;
- workspace ID, revision, save timestamp и entry document metadata.

Не сохраняются compiled model, diagnostics, selection, dialogs, focus, canvas nodes или отдельный deployment/dynamic graph.

Production path:

```text
valid EditorWorkspace commit
→ immutable envelope
→ queued optimistic IndexedDB save

.c4 / ZIP input
→ bounded validation
→ isolated candidate compile
→ durable candidate transaction
→ atomic active workspace replacement
```

ZIP manifest authoritative; archive entries проверяются на traversal, absolute/drive paths, backslashes, case-collisions, duplicates, undeclared entries, CRC mismatch, unsupported compression, count и uncompressed size limits.

### Scope decisions

- Использован app-owned native IndexedDB adapter; новый state-management framework не добавлен.
- Использован минимальный deterministic store-only ZIP codec; новая dependency и lockfile change не потребовались.
- Imported/hydrated revision корректно rebased в новый `EditorWorkspace`; затем сразу фиксируется новый durable head.
- Workspace replacement сбрасывает Undo/Redo history; semantic/layout commands сохраняют прежние history semantics.
- `localStorage` WP-05 path остаётся backward-compatible fallback, но durable workspace owner — IndexedDB envelope.
- Public publishable packages не изменены; changeset не требуется.

### Verification contract

Final exact-head evidence фиксируется в PR #8 после terminal GitHub CI:

- standalone `GUI-to-code` workflow;
- root `CI (PR & push)` workflow;
- push workflow;
- GUI typecheck, tests, build, smoke and Playwright acceptance;
- agent-instructions and `git diff --check`;
- unresolved review threads = 0;
- PR non-draft and mergeable.

Merge выполнять только после отдельной явной команды пользователя.

## WP-08 — ready

Следующий пакет: MVP release gate — финальная русификация UX, accessibility review, CI matrix, release documentation, artifact smoke и product/quality review.
