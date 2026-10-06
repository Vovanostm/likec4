# WP-14 — Безопасное и предсказуемое редактирование

Авторизация: запрос пользователя от 2026-10-03 реализовать `UX-FIXES.spec.json`.
Outcome: пользователь сохраняет работу и редактирует диаграмму без скрытой потери ввода.
Acceptance: AC-01–AC-05, AC-07–AC-10; FIX-01–FIX-12 и T01–T12 из JSON.

## Границы

- Write scope: `apps/gui-to-code/src/**`, `e2e/tests/gui-to-code/**`, этот packet,
  `decisions/DG-FIX-*.md`, README и managed state.
- Не менять packages, grammar, зависимости, portable envelope/ZIP v1 или renderer.
- WP-13 сохраняет прежние границы и непроверенные browser criteria.
- Integration owner: App, workspace, runtime/semantic hooks, shared contracts, roadmap, окончательная проверка.
- Persistence worker: IndexedDB, durable hook и их tests; локальный persistence API согласован ниже.
- UI workers: непересекающиеся inspector и keyboard/modal/menu components с tests.

## Интерфейсы и gates

DG-FIX-PERSISTENCE: storage v3, opaque token рядом с active/backup; атомарный load + token,
save/replace/clear сравнивают expected token. Каждый write вращает token. Старая версия fail closed
через IndexedDB version upgrade, `versionchange` закрывает connections. Envelope и ZIP неизменны.
Worker сначала добавляет исполняемые CAS/migration/recovery tests и ADR, затем реализует этот контракт.

DG-FIX-EMPTY-BOOTSTRAP: integration owner сначала доказывает visible first root через existing
element.create/view.create. При провале FIX-07 останавливается на contract proposal, без packages edits.

Остальные независимые FIX не зависят от этих gates и могут выполняться параллельно.
Новый migration contract явно ограничен IndexedDB v3 и этим packet; rollback на старый writer запрещён.

## Инварианты и проверки

EditorWorkspace — единственный semantic/history owner; compile-before-commit и source preservation.
Geometry — только standard snapshots. Selection/forms остаются transient. Все UI строки русские.
Сохранять существующие изменения dirty worktree. Нет browser-policy обхода.

Focused tests: `pnpm --filter @likec4/gui-to-code test`.
Integration: app generate → typecheck → test → build; ast-grep; instruction check; dprint; diff check.
Browser/human criteria: NOT_RUN при policy block, не заменять unit или HTTP evidence.
Stop: все доступные tests passed, gates документированы, remaining acceptance явно отмечена.
Escalate: public package API, новая dependency/semantic owner, другой data format или недоказанный bootstrap.

## Follow-up 2026-10-04 — recovery, ошибки удаления и края canvas

Авторизация: пользователь запросил исправить три findings и выполнить два независимых review passes.
Это продолжение active WP-14, не новый пакет и не завершение browser acceptance.
Acceptance: AC-02, AC-04, AC-05, AC-07, AC-09, AC-10.

- Recovery worker: `use-durable-workspace.ts` и его tests. ZIP экспортирует все committed sources и standard
  snapshots даже при invalid draft; точный entry draft скачивается отдельным действием. Удалить двусмысленный
  `exportLocal`; `reloadLatest` требует подтверждения перед заменой локальной работы и сохраняет её при отказе/ошибке.
- Inline worker: `InlineTitleEditor.tsx`, его tests и scoped CSS rules в `style.css`. Поле и действия остаются внутри
  canvas при edge creation, изменении размера панелей и показе ошибки; geometry документа не меняется.
- Modal worker: `RemoveElementConfirmation.tsx` и его tests. `onConfirm(): Promise<boolean>` явно сообщает неуспех,
  `error?: string | null` показывает конкретную причину внутри modal; busy/retry/cancel остаются безопасными.
- Integration owner: `App.tsx`, `use-semantic-editor.ts`, semantic-removal tests, browser scenario definitions,
  документация и все финальные gates. `confirmRemoval` возвращает boolean; применённое удаление закрывает окно,
  rejected/conflict/null не закрывают его и сохраняют доступную ошибку.

Не менять storage/ZIP schema, semantic commands, public packages, dependencies или browser policy.
Добавить regression tests для multifile + invalid draft + conflict recovery, declined reload,
rejected/conflicting/thrown deletion и inline placement/resizing.
После интеграции: review A correctness/data safety → исправления → review B UX/regression/React hooks → final gates.
Browser/native focus/dragging/viewport acceptance остаются NOT_RUN без разрешённого browser access.

Review A расширил только recovery worker scope двумя связанными regression cases:

- P1: pending durable replacement A + rejected newer B не освобождает mutation lock, пока A может установить workspace.
- P2: confirmed request получает порядок до file read/size/decode; поздний read/error старого запроса не заменяет
  новый workspace и не перезаписывает сообщение нового запроса. Отказ от confirmation не supersedes accepted request.

Request recency и число незавершённых replacement operations проверяются независимо; committed durable snapshot
обязательно materialize в локальном owner. Форматы и семантические команды не меняются.

Review B обнаружил отдельный integration race: semantic/layout cleanup мог очистить общий busy во время импорта.
Integration owner добавляет `setReplacementBusy` в app-local runtime и проверяет обе очередности завершения,
а также deferred command → accepted import через реальные runtime/durable hooks в Node. Recovery worker использует
отдельный setter; общий live/UI busy — OR двух owner flags. Browser/storage schemas и public API не меняются.
