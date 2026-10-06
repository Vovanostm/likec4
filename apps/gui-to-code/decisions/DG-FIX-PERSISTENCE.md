# DG-FIX-PERSISTENCE — IndexedDB CAS и статус черновика

Дата: 2026-10-03. Пакет: WP-14, FIX-01/FIX-02. Решение согласовано локальной границей packet.

## Решение

IndexedDB `likec4-gui-to-code` получает storage version 3. В прежнем store `workspace` ключ
`metadata` содержит `{ token: string }`, где token создаётся через `crypto.randomUUID()`.
Он не принадлежит semantic revision/history и не входит в portable envelope/ZIP v1.
Upgrade v1/v2 добавляет только metadata: source bytes, entryDocumentUri, active и backup не переписываются.

`loadWithRecovery()` читает active, backup и token в одной транзакции. Recovery valid backup в active
вращает token в той же транзакции и сохраняет backup. Save, confirmed replacement и clear проверяют
observed expectedToken внутри readwrite transaction; successful write вращает token. Clear оставляет
metadata, поэтому возврат к пустому workspace не позволяет повторно использовать старый token.
Initial empty load тоже имеет token. Conflict не меняет ни одной записи; revision сама по себе не CAS.
Identical save сохраняет backup, но вращает token, как и другие успешные writes.

Open connections закрываются на versionchange. Старое приложение, открывающее version 1/2 после upgrade,
получает VersionError. Blocked upgrade сообщает ошибку и закрывает connection при eventual success.
Rollback к старому writer запрещён: downgrade IndexedDB не поддерживается; для переноса данных нужен
явный export/import через совместимый portable v1 format. Metadata corruption fail closed.

Hook хранит token только в persistence boundary. Conflict блокирует mutations и следующие queued writes,
сохраняя local workspace для export; reload получает новый согласованный snapshot/token.
Storage failure не объявляет saved. Derived draft status сравнивает draft/committed sources и layouts
с успешно сохранённым snapshot, поэтому late save не объявляет новый или invalid draft сохранённым.

## Альтернативы

Semantic revision/workspaceId и timestamp не различают import с reused revision; BroadcastChannel
не гарантирует доставку. Изменение portable envelope ради CAS нарушило бы совместимость и owner boundary.

## Исполняемый gate

`indexeddb-workspace.spec.ts`: два sessions, same-revision replacement, stale repeated save,
concurrent writers в обоих порядках, initial empty/clear, migration v1/v2, recovery, invalid records,
legacy VersionError/versionchange, blocked/unavailable/quota failure.
`use-durable-workspace.spec.ts`: draft status, late completion, conflict queue inhibition.
Tests добавлены до production implementation; focused gate должен пройти перед handoff.
Focused gate: PASS, 2 files / 39 tests. App typecheck, instruction validation, formatter и scoped diff check: PASS.
Production hook проверен node lifecycle harness: conflict блокирует второй queued save, delayed save сохраняет invalid
draft status, storage unavailable не объявляет saved, exportLocal скачивает точный invalid entry draft как `.c4`.
Дополнительно написаны `e2e/tests/gui-to-code/workspace-recovery.spec.ts` и `workspace-save-status.spec.ts`.
Browser acceptance T01-d/T02-a/T02-c: NOT_RUN, integration owner выполняет отдельно. Full app build/acceptance остаются
проверками integration owner; этот worker не меняет managed roadmap state.
