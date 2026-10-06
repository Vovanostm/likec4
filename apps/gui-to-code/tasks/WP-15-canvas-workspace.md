# WP-15 — Холст прежде панелей

Авторизация: запрос пользователя 2026-10-04 реализовать улучшения с workers и независимыми критическими reviews.
Outcome: начать диаграмму без технического ID и работать на холсте, который не уезжает за пределы экрана.
Acceptance: AC-01–AC-05, AC-08–AC-10. Зависимость: завершённый WP-12; WP-13/WP-14 остаются active.

## Контракт и границы

- Все панели скрыты при старте; свойства открываются по запросу, незавершённый ввод не теряется при скрытии.
- Широкий экран: docked panels при достаточном месте. Узкий экран: одна немодальная overlay panel с собственным
  scroll, доступным закрытием/Escape и возвратом focus; фон не inert, modal focus trap не применяется.
- Editor shell остаётся в viewport; панели не становятся вертикальными секциями под диаграммой.
- `diagram.create` — app-local domain command для пустых model/views. Input: kind, optional title/documentUri.
  Output: createdElementId + createdViewId. Workspace выделяет IDs, вызывает существующие source planners,
  компилирует и проверяет кандидата, commits ровно один revision/history entry либо ничего.
- Первый root видим в scoped static view; название меняется existing inline/inspector patch. Для imported model
  без views сохраняется explicit view creation, ID генерируется owner по умолчанию, expert override в «Подробности».
- Gate закрыт `decisions/DG-15-bootstrap.md`; готовый probe `workspace-ux.spec.ts` доказывает source-planner path.

## Ownership

- Parent: App, styles, contracts, semantic/runtime hooks, integration tests, docs/state и final gates.
- Bootstrap worker: workspace.ts и новый workspace-bootstrap.spec.ts; не менять contracts или hooks.
- Panel worker: новый WorkspacePanel.tsx и его tests; не менять App/styles/существующий Inspector.
- View worker: ViewToolbar.tsx/spec; onCreateView('', title) означает owner-generated ID.
- Reviewers read-only: correctness/history и UX/focus/responsive; findings с воспроизводимым path/impact.

Не менять packages, dependencies, renderer, portable/storage schemas, другие WP; не обходить browser policy.
Сохранять dirty worktree. Новые abstractions только для реально повторяемых панелей.

Focused: bootstrap/panel/view tests. Final: app generate → typecheck → full tests → build; oxlint, ast-grep,
dprint, instruction validation, diff check. Browser/native geometry/focus/60-second acceptance — NOT_RUN.
Stop: доступные checks выполнены, reviewers findings закрыты или явно отмечены, docs фактические.
Escalate: public API, другой semantic owner/schema/dependency, недостаточный existing source-planner contract.
