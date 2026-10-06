# WP-14 — Отчёт реализации UX fixes

2026-10-03. Статус: локальная реализация завершена; browser/human acceptance NOT_RUN.
Spec: `UX-FIXES.spec.json`. Packet: `WP-14-ux-fixes.md`. Checkout HEAD `7cedbbe182f834a8a589ef6e84535cf76301f4a7`
НЕ описывает dirty candidate; commit, push, PR и deploy не выполнялись.

## Реализованные исправления

| Fix    | Реализация и regression evidence                                                                                                                                                                                      |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| FIX-01 | Durable token CAS для save/replacement/clear; storage-v3 upgrade, recovery/legacy safety, repeated stale writes. `indexeddb-workspace.spec.ts`.                                                                       |
| FIX-02 | Derived draft status относительно saved snapshot; exact entry draft download; late save, unavailable storage, conflict queues. `use-durable-workspace.spec.ts`.                                                       |
| FIX-03 | Inspector draft/base values; явный committed conflict; save/discard/stay перед navigation/creation; hidden panel остаётся mounted. `ElementInspector.spec.ts`, `editor-drafts.spec.ts`.                               |
| FIX-04 | Whole-form blur containment, awaitable single save, nonempty outside-blur commit, rejected draft retention и reason-based focus. `InlineTitleEditor.spec.ts`, `ux-keyboard.spec.ts`.                                  |
| FIX-05 | Общий mutation reason в UI + live command-boundary refs; read-only не блокирует просмотр/selection/export/recovery. `mutation-availability.spec.ts`, `runtime-mutation-guards.spec.ts`, `workspace-recovery.spec.ts`. |
| FIX-06 | Rejected/conflict/thrown inspection показывает canvas alert и local error, очищает busy, не открывает false confirmation. `semantic-removal.spec.ts`.                                                                 |
| FIX-07 | Existing root create → scoped view действительно отображает root; guided empty state и no-kinds recovery. `workspace-ux.spec.ts`, `empty-workspace.spec.ts`.                                                          |
| FIX-08 | Specification-derived catalogue с custom titles; known 1–3 mappings неизменны; unknown kind fail closed; exact history/layout. `canvas-element-kinds.spec.ts`, `workspace-ux.spec.ts`.                                |
| FIX-09 | Native modal dialog, Cancel initial focus, busy/unsupported guards, return focus fallback. `RemoveElementConfirmation.spec.ts`, `ux-keyboard.spec.ts`.                                                                |
| FIX-10 | Popup items вне Tab order; roving arrows/Home/End; Tab dismiss/exit; outside pointer не крадёт focus. `CanvasQuickCreateMenu.spec.ts`, `ux-keyboard.spec.ts`.                                                         |
| FIX-11 | Local composition lifecycle/isComposing/keyCode 229 guards; ordinary Enter submits once. Inline/create specs и keyboard browser scenarios.                                                                            |
| FIX-12 | Primary inspector title/description/remove; technical fields в «Подробности», layout в «Дополнительно», visible disabled reasons, accurate drag connection guidance. `usability.spec.ts`; human criteria NOT_RUN.     |

Независимые reviews обнаружили и исправили ещё пять интеграционных defects:

- retained inline draft после same-view/same-FQN replacement не перезаписывает новый title;
- creation/view switch проходят dirty inspector guard ДО mutation, Stay/Escape завершают pending promise без command;
- view form блокирует input/duplicate/Escape во время pending submit;
- invalid import не отменяет delayed/queued autosaves retained workspace;
- create menu освобождает awaitable submission latch в finally даже без промежуточного busy render.

Follow-up reviews подтвердили исправление этих пяти defects; в проверенных участках не осталось blocking findings.
Ограничение review evidence: production-hook/component-handler probes не проверяют mounted DOM lifecycle,
native focus или реальный пользовательский ввод. App Save/Discard/Stay и keyboard creation описаны browser tests,
но эти scenarios не запускались; deferred view submit и create-menu error/cancel lifecycle требуют browser acceptance.

## Границы и migration

EditorWorkspace остаётся semantic/history owner; source-preserving planners и compile-before-commit не менялись.
Geometry — standard `.likec4/*.likec4.snap`, без второго mutable graph. Packages, grammar, dependencies,
portable envelope/ZIP v1 не менялись в этом task. Application private — новый changeset не требуется.

Database version 3 добавляет opaque token в metadata того же store; active/backup source bytes не переписываются
при upgrade v1/v2. Старые writers после upgrade получают VersionError. Blocked upgrade требует закрыть старую
вкладку. Downgrade невозможен; rollback только через export/import portable v1 в совместимое приложение.
См. `decisions/DG-FIX-PERSISTENCE.md` и `decisions/DG-FIX-EMPTY-BOOTSTRAP.md`.
Tests используют isolated in-memory DB/browser contexts; пользовательское хранилище не очищалось.

## Фактические проверки

- PASS: app generate; app typecheck; 31 test files / 227 tests (повторный parent run 2026-10-03, 15:02 MSK);
  production build.
- PASS: changed-source oxlint; ast-grep; canonical instruction validation; format; `git diff --check`.
- PASS: browser-test discovery — 37 scenarios / 13 files; static TypeScript validation changed browser tests.
- NOT_RUN: browser execution, real IME/native focus/dragging, screenshots, 200% browser zoom,
  human AC-01 timing, contrast audit, CI и exact committed-head release acceptance.
- Warnings: существующие MaxListenersExceededWarning в suites и большой production JS chunk (~4.68 MB minified).
  Эти warnings не подавлены и не объявляются новыми UX regression failures.

## Изменённые пути

Все относительные пути ниже разрешаются от `/Users/vovanostm/learn/likec4/`.

- `apps/gui-to-code/src/App.tsx`, `src/style.css`.
- `apps/gui-to-code/src/editor/indexeddb-workspace.ts`, `indexeddb-workspace.spec.ts`,
  `use-durable-workspace.ts`, `use-durable-workspace.spec.ts`.
- `apps/gui-to-code/src/editor/use-workspace-runtime.ts`, `use-semantic-editor.ts`,
  `use-canvas-entity-editor.ts`, `use-wp06-runtime.ts`, `workspace.ts`.
- `apps/gui-to-code/src/editor/mutation-availability.ts`, `mutation-availability.spec.ts`,
  `runtime-mutation-guards.spec.ts`, `semantic-removal.spec.ts`, `workspace-ux.spec.ts`.
- `apps/gui-to-code/src/editor/ui/CanvasToolbar.tsx`, `canvas-element-kinds.ts`, `canvas-element-kinds.spec.ts`,
  `CanvasCreateMenu.tsx`, `CanvasCreateMenu.spec.ts`, `CanvasQuickCreateMenu.tsx`, `CanvasQuickCreateMenu.spec.ts`,
  `ElementInspector.tsx`, `ElementInspector.spec.ts`, `InlineTitleEditor.tsx`, `InlineTitleEditor.spec.ts`,
  `RemoveElementConfirmation.tsx`, `RemoveElementConfirmation.spec.ts`, `ViewToolbar.tsx`, `ViewToolbar.spec.ts`.
- `e2e/tests/gui-to-code/editor-drafts.spec.ts`, `empty-workspace.spec.ts`, `usability.spec.ts`,
  `ux-keyboard.spec.ts`, `workspace-recovery.spec.ts`, `workspace-save-status.spec.ts`,
  `wp04-inspector.spec.ts`, `wp05-views-layout.spec.ts`.
- `apps/gui-to-code/README.md`, `ROADMAP.md`, `ROADMAP.STATUS.md`,
  `decisions/DG-FIX-EMPTY-BOOTSTRAP.md`, `decisions/DG-FIX-PERSISTENCE.md`,
  `tasks/WP-14-ux-fixes.md`, этот report. Исходный JSON proposal сохранён как audit baseline.

## Остаточная приёмка

WP-14 остаётся active: выполнить browser suite в разрешённом runner/CI, затем human first-user flow без coaching,
viewport/200%-zoom и contrast/target-size review. Unit/helper probes не заменяют эту приёмку.
Inspector save-and-continue сохраняет разные разделы отдельными существующими commands: если поздний раздел
rejected, ранее подтверждённый раздел остаётся сохранённым, остальные drafts доступны. Generic batch не введён.
`.c4` draft export содержит entry source; ZIP — только committed valid workspace.

## Follow-up 2026-10-04 — recovery, удаление и inline title

Авторизация: исправления с subagents и два независимых review rounds. Исходный отчёт выше — историческое
доказательство предыдущего candidate; его 227 tests не являются результатом текущих изменений.

Три disjoint worker scopes внедрили:

- Recovery: ZIP всех committed sources, entry metadata и standard snapshots доступен при invalid/compiling draft
  только после хотя бы одной valid compilation. Точный entry draft скачивается отдельно. Загрузка актуального workspace
  всегда подтверждается до изменения coordination state; отмена/ошибка сохраняет локальную работу.
- Удаление: `confirmRemoval(): Promise<boolean>` закрывает modal только после applied command. False/rejected/conflict
  и исключения сохраняют modal с доступной ошибкой; конкретный parent error приоритетнее fallback.
- Inline title: измеряемая форма ограничена canvas, реагирует на panel/form resize и рост ошибки, имеет scroll для
  маленькой панели. Cleanup отключает observer/listener; semantic geometry не меняется.

Integration owner связал эти контракты в `App.tsx` и semantic handler, добавил handler probes и browser scenario
definitions. Все пользовательские строки остаются русскими. EditorWorkspace, durable CAS, source-preserving commands,
portable ZIP/storage schemas и public packages сохраняют прежние границы.

### Review A — correctness/data safety

Независимый reviewer Russell нашёл два source-supported import races:

- P1: rejected новый импорт освобождал busy, хотя старый durable replacement ещё мог заменить workspace.
- P2: request order назначался после file read, поэтому старый медленный `.c4`/ZIP мог заменить новый confirmed request;
  ранний отказ нового accepted request не superseded старый, а stale errors могли перекрыть актуальный feedback.

Recovery worker исправил оба в существующем hook: request recency назначается до read/validation,
а отдельный activity counter удерживает busy до завершения всех accepted imports/reloads. Declined requests
не supersede accepted work; stale read/compile errors не перекрывают актуальную ошибку. Уже committed durable
candidate устанавливается локально до освобождения lock. Focused hook suite: 39/39 tests, timeout не менялся.
Russell повторно проверил исходные P1/P2 schedules и закрыл оба finding по source/regression inspection.
Review A не нашёл других actionable defects в export/modal/placement slice; это source review, не browser proof.

### Review B — UX/regression и shared runtime lifecycle

Независимый reviewer Leibniz проверил recovery labels/download scope, modal failure feedback, inline placement,
observer cleanup и финальный import-order patch. Один P1: semantic/layout cleanup очищал общий busy, пока accepted
import оставался pending. Parent исправляет app-local runtime: command и replacement имеют разные flags,
общий live/UI busy — OR обоих. Recovery worker использует dedicated setter. Integration regression вызывает
реальные runtime/durable hooks с deferred command/import; отдельные cases проверяют обе очередности завершения.
Focused runtime suite: 6/6 tests; hook suite: 41/41 tests. Leibniz повторно проверил frozen correction и закрыл P1
по source/regression inspection. В обоих review rounds не осталось actionable findings в bounded slice;
reviewers не выполняли tests/browser/build, parent owns execution evidence.

### Текущие проверки

- PASS: isolated `workspace-ux.spec.ts`, 3 tests с неизменёнными assertions и timeout; четыре pure UI suites, 48 tests.
- PASS: static TypeScript validation двух изменённых browser-test definitions; `git diff --check`.
- Предыдущий full suite этого follow-up: 261/262 tests, один bootstrap test превысил 5000 ms. Isolated PASS не заменяет
  финальный full-suite gate. Текущий host load ниже предыдущего, но причина timeout не доказана.
- PASS до Review B correction: generate/typecheck, scoped oxlint, ast-grep, instruction validation (10 tests), format.
- Full suite до Review B correction: 272/273 tests, 30/31 files; один существующий WP10 scoped createConnected test
  превысил 5000 ms (5500 ms). Bootstrap UX suite в этом run прошёл. Full-suite gate пока не green;
  assertions и timeout не ослаблены, причина timing failure не доказана.
- PASS после Review B correction: typecheck; focused runtime suite 6/6; hook suite 41/41;
  scoped oxlint, ast-grep и format.
- Финальный full suite: 277/278 tests, 30/31 files; 2026-10-04, старт 16:19:26 MSK, duration 155.73 s.
  `workspace-wp10.spec.ts:96` — «creates a child of the scoped view and exact manual position atomically»:
  5000 ms timeout, фактически 5131 ms. Все новые regressions прошли. Full-suite gate НЕ green;
  тесты/timeout не ослаблялись и повторная попытка без изменения candidate не выполняется.
  Host load при 16:21: 30.51/26.66/31.41; это контекст, не доказанная причина failure.
- PASS: final production build, 6.65 s, main JS 4680.91 kB (существующий chunk-size warning не подавлен).
  Preview HTML ссылается на `/assets/index-CLzRiQC4.js` и `/assets/index-Cvxp0Q1d.css`; main JS отвечает HTTP 200.
- Source fingerprint девяти проверенных implementation/test/style files остался неизменным после финальных gates:
  `1e23b5a52883769e423b8d2d14c00f594ddc20f02199be8b0c5cef14860d1fdc`
  (SHA256 от ordered `shasum -a 256` outputs: App, semantic hook, durable hook/spec, runtime hook/spec,
  InlineTitleEditor, RemoveElementConfirmation, style.css).
- NOT_RUN: browser execution, mounted DOM/native focus/IME/viewport geometry, human acceptance и CI/release acceptance.
  Browser policy запретила продолжение через альтернативные browser surfaces, CDP, Playwright или shell automation;
  bypass не выполнялся. Preview отвечает HTTP 200 на `http://127.0.0.1:4174/`; это не UX acceptance.

WP-14 остаётся active; commit/push/PR/deploy и изменения пользовательского хранилища не выполнялись.
