# WP-18 — История действий

Локальная реализация: 7 октября 2026. Авторизация и границы: [packet](WP-18-action-history.md).

Добавлена кнопка «История» рядом с Undo/Redo. Панель показывает состояния после подтверждённых
команд, текущую позицию и отменённые шаги. Клик восстанавливает sources всех файлов и стандартные
manual-layout snapshots вместе. Новая команда после возврата заменяет future.

EditorWorkspace остаётся единственным владельцем. Типизированные semantic/layout commands записывают
метаданные одновременно с commit; обновление корректного DSL получает запись `source.edit`.
`goToHistory(index, expectedRevision)` использует общую очередь, компилирует только целевой документ,
проверяет freshness и атомарно меняет позицию с новой монотонной revision. Undo/Redo сохраняют
названия записей; rejected/stale commands не добавляют шаги. UI не хранит копию графа или снимков.

Панель соблюдает exclusive-panel, dirty-inspector, busy/read-only, invalid-source и pending-layout guards.
История сессии сбрасывается при reload/replacement. IndexedDB/ZIP сохраняют выбранное корректное
состояние, без полной истории; схема хранения и public package API не изменены.

## Проверки

- PASS: focused workspace/history/selection/panel — 28/28, 4 файла; `final-owner-tests.txt`.
- PASS: runtime read-only, synchronous busy и replacement freshness — 3/3 выбранных проверки;
  остальные 16 намеренно не входят в этот focused run; `runtime-history-tests.txt`.
- PASS: durable conflict recovery начинает новую историю — 1/1 выбранная проверка;
  остальные 46 не входят в этот focused run; `durable-history-tests.txt`.
- PASS: repository/app generate, production build, focused lint/format, instruction checks 10/10 и diff check.
- PASS: native desktop Chromium: несколько source edits → прямой переход назад/вперёд → Undo/Redo →
  новая ветка → save; точное равенство source bytes, current/undone labels и отсутствие старого future.
- PASS: canvas inline title command → native pointer movement → переход между состояниями;
  точные node transforms и SVG paths, неизменные source bytes для geometry-only steps, save/reload,
  новая сессионная история после reload.
- PASS: dirty inspector → отказ сохраняет ввод → discard выполняет переход;
  invalid DSL блокирует историю, сохраняет last-valid canvas и не добавляет запись.

Browser journey проверен на отдельной immutable сборке `index-DdrlVgXB.js`, origin 62118,
без замены storage/вкладок пользователя. Финальная интеграционная сборка: `index-my04-1CX.js`.
На финальной immutable сборке origin 62119 дополнительно проверены canvas semantic command,
один шаг истории, русское название, прямые переходы назад/вперёд, Undo/Redo и save;
`browser-final-build.txt`, `final-build.png` и `manifest.json` фиксируют фактический asset.
Подробные логи, browser scripts и screenshots: `output/playwright/action-history-20261006/`.

Общий app suite НЕ green: после повторных стандартных timeout failures в существующих placement,
runtime и bootstrap scenarios этот прогон остановлен (exit 130). Полное прохождение оставшейся матрицы
не заявляется. Ограничения времени и assertions существующих тестов не менялись. Для новых history
unit tests тяжёлые compiler/document ports изолированы; исходный fixture компилируется настоящим
компилятором, а полный пользовательский путь проверен с настоящими ports в браузере.

Рабочая папка параллельно изменяется другими задачами. Их изменения сохранены; общий gate
и current-source typecheck фиксируются отдельно от feature proofs. Closeout typecheck НЕ green:
`use-professional-canvas.ts` вызывает ещё отсутствующие `pasteSubgraph`, `inspectSubgraphRemoval`
и `removeSubgraph`; этот параллельный незавершённый API не входит в write set истории.
CI/release, Safari/Firefox,
persisted full history и large-history stress — NOT_RUN. Changeset не требуется для private app.
Commit/push/deploy не выполнялись. WP-18 остаётся active до общего gate.
