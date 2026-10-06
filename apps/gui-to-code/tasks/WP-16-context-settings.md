# WP-16 — Быстрые настройки элемента в контекстном меню

Авторизация: прямой запрос пользователя 6 октября 2026: типы, цвет, тег и прочие настройки по ПКМ.

- Acceptance: AC-02, AC-04, AC-05, AC-07, AC-08, AC-10; выбор типа из спецификации,
  существующей формы (включая БД), цвета, тегов и технологии без открытия инспектора.
- Scope: app menu/App/styles/default kinds, element.patch contract/workspace verification,
  DG-01 DocumentEditService AST/CST planner, focused tests, README, changeset и этот packet/report.
- Interfaces: existing element.patch → isolated candidate compile → EditorWorkspace commit/history;
  menu captures workspace/revision/view/selection, respects locked/busy/dirty inspector guards.
- DG-01 closed: extend the accepted source-preserving planner; executable tests prove kind token and style
  property edits preserve comments, other files, children, relations and exact Undo/Redo.
- Non-goals: new shapes, grammar, semantic owner, persistence format, dependencies, tag definition styling,
  publication, mobile/WCAG. Imported projects expose only their declared kinds/tags/custom colors.
- Checks: focused planner/workspace tests; generate → typecheck → app tests → build;
  desktop browser settings/history/reload/export journey, formatting/lint, instructions and diff check.
- Stop: the new build passes the supported desktop journey; remaining proof gaps are reported.
- Escalate: source editing requires a new owner or storage/renderer schema.

## Продолжение: ПКМ, 7 октября 2026

Прямой запрос пользователя разрешает продолжение WP-16: нативный ПКМ открывает меню элемента,
связи (линия, подпись, точка изгиба) и пустого холста. AC-02/04/08/10.
Bounded scope: RelationshipEdge event arbitration, public callback documentation, patch changeset,
native-mouse browser regression and this packet/report. Opening must preserve source, geometry and history.
Existing DG-01 and workspace owner are unchanged; no new semantic operations or preview editing.
Checks: production build, native Chromium regression, focused typecheck/lint/format and rendered menu review.
Stop/escalation: any context-menu opening writes a snapshot/source or requires a new geometry owner.
