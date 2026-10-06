# WP-15 — Локальная реализация canvas-first workspace

2026-10-04. Пакет остаётся active: native browser/CI/human acceptance не подтверждены.
Не менялись public packages, dependencies, storage/ZIP schemas или renderer; dirty worktree сохранён.

## Реализованный срез

- При старте открывается только холст. Structure, Inspector и Code доступны по запросу; одновременно одна панель.
- Панели остаются mounted при скрытии; dirty Inspector draft сохраняется. Close/Escape возвращают focus к trigger
  либо холсту, не создавая modal trap. Nested controls/modal/menu и IME имеют собственный Escape.
- Wide workspace docks одну панель; при ширине ≤1400 CSS размещает её поверх холста с отдельным scroll.
  Убраны responsive rules, превращавшие приложение в длинную вертикальную страницу.
- Пустые model/views предлагают типы specification. Один `diagram.create` создаёт root и scoped static view,
  компилирует/проверяет exact candidate и commits один revision/history entry. Начальное имя открывается inline
  после соответствующего render; stale workspace/revision/view handoff отбрасывается.
- Synthetic `index` без source provenance не подменяет первый пользовательский вид. Authored `index` сохраняется.
- View form начинает с названия; технический ID optional в «Подробности». IDs `view1`, `view2`, … назначает owner;
  `view` не используется, поскольку parser воспринимает его как keyword и создаёт anonymous view.

## Workers и независимые reviews

Implementation scopes: transaction + tests; reusable panel + tests; view form + tests; authored browser scenarios.
Parent владеет App/styles/contracts/hooks/docs и final verification.

Review A (correctness/history) выявил:

1. Stale command completion мог публиковать ошибки/selection/feedback в replacement workspace.
   Runtime semantic/layout callbacks теперь отбрасывают результат и catch до `finishResult` при смене owner.
   Node regression проверяет delayed applied/rejected/throw view completion при same-revision replacement.
2. Bootstrap ошибочно считал entry document местом `model` block. Оmitted target теперь выбирает existing planner;
   entry metadata остаётся прежним. Spec-only entry + separate model, exact bytes/Undo/Redo проверяются отдельно;
   explicit invalid target отклоняется с точной причиной.
3. Exact verification не проверял view title. Теперь сравнивает requested/default title и отклоняет wrong-title
   planner candidate без изменения source/revision/layout/history.

Review B (UX/focus) выявил canvas deletion bypass dirty Inspector. Keyboard и quick-delete теперь проходят
existing guard; после Save используется текущий semantic callback, учитывающий rename/move. Browser regression
описывает скрытый dirty draft → Stay/Discard/Save → удаление именно актуального ID.

Оба reviewers повторно проверили fixes и закрыли все четыре findings на source-level; новых confirmed defects
в пределах packet не выявлено. Parent проверил добавленные четыре authored deletion regressions и static gates.

## Evidence и ограничения

До review fixes полный Node suite прошёл: 342/342 tests, 33 files, 37.16s. Это исторический прогон, не final proof.
После correctness fixes bootstrap focused: 24/24; runtime focused: 12/12.

Final full Node suite: **350/350 tests, 33 files, 39.88s**. App generate/typecheck/build, scoped oxlint,
ast-grep scan и instruction validation прошли. Production preview на `127.0.0.1:4174` сохраняет существующий
процесс и отдаёт rebuilt HTML/assets. Это startup/artifact evidence, не browser acceptance.

Полный `tsc --noEmit -p e2e/tsconfig.json` НЕ прошёл: отсутствуют unrelated generated fixtures
`e2e/src/likec4-model` и `e2e/src/likec4-views`; связанные implicit-any errors — следствие missing modules.
GUI-only strict static check passed отдельно без этих generated fixtures:
`cd e2e && pnpm exec tsc --noEmit --strict --skipLibCheck --target esnext --module esnext --moduleResolution bundler --types node tests/gui-to-code/*.ts`.

Formatter проверен для изменённых app/e2e files. Более широкий e2e formatter check обнаружил прежнее formatting
в untouched `wp12-direct-canvas.spec.ts`; файл не переписан ради unrelated cleanup.

Browser сценарии только authored/statically typechecked. НЕ выполнены Playwright, native focus/IME/select popup,
pointer drag, viewport geometry, 200% zoom, 60-second onboarding, contrast или сравнение живых Miro boards.
HTTP 200 и passing Node tests не заменяют эти gates. Нет обхода browser policy через CDP/alternate browser.
Known pre-existing warnings: compiler process listeners и production main chunk около 4.69 MB.
