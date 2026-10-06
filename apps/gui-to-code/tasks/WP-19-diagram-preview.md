# WP-19 — Просмотр готовой схемы

Авторизация: прямой запрос пользователя 6 октября 2026 — просмотр готовой схемы как на сайте LikeC4.
Результат: кнопка «Просмотр» открывает полноэкранный read-only renderer с выбором видов и темы.
Acceptance: AC-02, AC-04, AC-06, AC-08, AC-09, AC-10.
Dependencies: существующие model provider, ReactLikeC4, last-valid model и snapshots; WP-05/WP-07 done.
Новых DG нет: используются публичные контракты без semantic/layout mutations.

Write scope: App, отдельный preview UI/CSS, focused tests, README/SPEC/ROADMAP/STATUS, packet/report.
Interfaces: immutable LikeC4Model.Layouted, initial view ID, draft warning, onClose.
Invariants: EditorWorkspace остаётся SSOT; preview не подключает editor provider/callbacks;
sources/history/snapshots/editor selection не меняются; views/theme/viewport/layout comparison локальны;
transient hidden/locked layers редактора не передаются в опубликованный вид;
некорректный DSL показывает last-valid model и явное предупреждение; editor shortcuts изолированы.
Non-goals: публикация, полный клон оболочки сайта, persistence migration, новые зависимости,
редакторские действия в просмотре, mobile/compliance.
Checks: focused preview tests; app generate/typecheck/test/build; desktop browser open/navigation/theme,
read-only drag/keyboard, return/drafts/history/layout; format/lint, agent-instructions и diff check.
Stop: просмотр и возврат проверены с сохранностью workspace. Escalate: новый mutable owner,
изменение public API или persistence format.
