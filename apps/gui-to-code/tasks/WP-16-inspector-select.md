# WP-16 — Компактный инспектор и выбор технологии

Авторизация: запрос пользователя от 6 октября 2026, «Карточка в карточке» и select с autocomplete.

- Acceptance: AC-02 synchronization, AC-04 failure safety, AC-07 round trip, AC-08 architecture, AC-10 Russian UI;
  один searchable combobox вместо сетки,
  выбор мышью/клавиатурой, custom value, очистка, сохранение technology/icon, Undo/Redo и reload.
- Scope: `src/editor/ui/TechnologySelect.tsx`, оба inspectors и их tests, `src/style.css`, существующий
  technology browser regression; этот packet, `README.md` и `ROADMAP.STATUS.md`.
- Interfaces: существующие draft callbacks, `technologyFields`, `onPatch`; DG-01 закрыт, новых DG нет.
- Invariants: единственный semantic/history owner EditorWorkspace, source-preserving edits, прежние dirty guards.
- Non-goals: новые зависимости, каталог технологий, persistence/public API, публикация, mobile/WCAG programme.
- Checks: focused inspector/catalogue tests, generate → typecheck → app tests → build,
  реальный desktop browser journey, formatter/lint, agent instructions и diff check.
- Stop: пользовательский путь прошёл на новой сборке; report точных ограничений.
- Escalate: требуется изменение owner/API/data format.

## Проверки

- Focused inspector/catalogue: 30/30; generate, typecheck, build, oxlint, dprint passed.
- App suite: 462/465, три timeout по 5 секунд в runtime/workspace tests при одновременной сборке.
  Отдельный повтор двух файлов без сборки: 26/26 со штатными timeout. Полный suite в одном повторном
  запуске не объявляется green.
- Production browser regression: technology catalogue + inspector editing, 2/2; поиск всех шести
  технологий, мышь/клавиатура, custom/clear, reload и ZIP.
- Frozen final candidate: `output/playwright/inspector-select-candidate`, asset `index-BIBQyPZu.js`,
  SHA-256 `4f282f722a6377259520519cf8cd83785bc7223839b4e259c66b2d7043e8f3a2`.
  Общий dist обновляется другими задачами; frozen copy сохраняет final browser evidence.
- Native desktop: search, Enter без преждевременного submit, Escape, save, Undo/Redo passed;
  1440×1000 и 1280×720, dropdown целиком внутри панели, на малой высоте открывается вверх.
  Снимки: `output/playwright/inspector-technology-select.png`, `output/playwright/inspector-compact.png`.
- Native logical relation: catalogue selection, custom HTTPS, сохранение и очистка прошли;
  выбор связи проверен через её label. Undo/Redo сохраняет existing revision-bound сброс selection.
- Instruction validation: 10/10; final diff check passed.
- CI/publication, новая полная acceptance других WP и другие browsers: NOT_RUN.
