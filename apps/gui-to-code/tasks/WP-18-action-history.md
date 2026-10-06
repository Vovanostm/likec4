# WP-18 — История действий

Авторизация: прямой запрос пользователя 6 октября 2026 — история как в Photoshop с паттерном Command.
Результат: панель «История» позволяет выбрать любое подтверждённое состояние кода и раскладки.
Acceptance: AC-02, AC-03, AC-04, AC-06, AC-08, AC-09, AC-10.
Dependencies: реализованные workspace commands/history, DG-01, WP-17. Новых DG нет.

Write scope: app contracts/workspace, history helper/UI, runtime/semantic hook, App/styles;
focused tests и документация этого пакета. Shared package API, storage schema и renderer не меняются.
Interfaces: typed history action metadata; workspace.goToHistory(index, expectedRevision);
derived chronological list from past/current/future. Историческая позиция независима от revision.
Invariants: один owner EditorWorkspace; атомарный compile/restore; монотонная revision; failed/stale
commands не добавляют запись; новая правка удаляет future; Undo/Redo сохраняют названия записей;
sources и standard snapshots восстанавливаются вместе; busy/read-only/pending-layout/dirty-inspector guards.
Non-goals: сохранение полной истории после reload или в ZIP, ветвящаяся история, named snapshots,
история transient selection/zoom/layers, облако, публикация, mobile/compliance.
Checks: command/branch/multi-file/layout/failure/stale tests; app generate/typecheck/tests/build;
desktop browser history jump/Undo/Redo/branch/geometry/save/reload; focused format/lint;
agent-instructions и diff check.
Stop: эти сценарии проходят; ограничения документированы. Escalate: требуется второй owner,
новая storage schema или замена стандартных layout snapshots.
