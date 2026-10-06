# WP-17 — Файлы исходников

Статус: завершён локально в границах WP-17. Packet: [WP-17-source-files.md](WP-17-source-files.md).
Дата: 6 октября 2026. Checkout: main, HEAD 7cedbbe18; реализация находится в dirty working tree.

## Результат

- В панели «Код» доступны дерево всех исходников, поиск по пути, основной файл, текущий документ и отметки изменений/ошибок.
- Открытый документ выбирается независимо от entryDocumentUri и восстанавливается после reload как tab-local preference.
- Текстовые изменения относятся к открытому файлу и проходят через существующий EditorWorkspace: общие draft sources, compiler, history и last-valid model.
- Инспектор logical element открывает точное объявление через публичный language-services locator и выделяет его имя. Поддержано объявление дочернего элемента в отдельном extend-файле, включая Unicode-пути.
- Диагностика содержит имя исходника и переход к нему. Несколько ошибочных черновиков сохраняются при переключении; durable storage содержит последнюю корректную версию.
- Одиночный .c4 экспорт и скачивание черновика относятся к открытому файлу. ZIP по-прежнему содержит все committed sources, явный entry URI и стандартные manual-layout snapshots.
- Единообразные CRLF сохраняются при вводе через нормализующее переводы строк браузерное поле. Поле имеет отдельную DOM identity для каждого документа; отображаемое значение нормализовано отдельно от исходных bytes.
- Список файлов отделён от прокрутки кода и ограниченного списка ошибок. В исходной браузерной проверке кнопка сдвигалась между pointerdown и pointerup после исправления ошибки; исправленный переход проверен на финальной сборке без повторных кликов и увеличения timeouts.

## Границы

EditorWorkspace остаётся единственным владельцем семантики и истории. Переключение файлов не меняет ревизию,
entryDocumentUri или раскладку. Поздний locator completion отвергается после изменения owner, state, выбора
документа или выбранного элемента. Новый публичный API, dependency, grammar или storage migration не требовались.
Application private; changeset не требуется.

WP-17 реализует первый этап предложения. Файловый CRUD, модульная маршрутизация новых сущностей, перенос
объявлений между файлами, конструктор view rules, checkpoints и filesystem/Git integration остаются следующими этапами.
Canvas creation сохраняет прежние правила назначения файлов. Не заявляется произвольный размер архитектуры;
текущий envelope ограничен 256 исходниками и 16 MiB. Каждый невалидный черновик скачивается отдельным .c4;
ZIP корректной версии не является архивом всех невалидных draft sources.

## Проверки

Финальная production-сборка: `index-DbeiHckw.js`, CSS `index-B5z53Ysv.css`.
SHA-256 локальных, замороженных и обслуживаемых assets совпали: `served-assets.json`.

- PASS: app generate, typecheck, build; focused source/runtime/durable suites — 69/69.
- PASS: новый native Chromium desktop journey — 61 checks на 12 исходниках, трёх модулях, сценарии,
  deployment и межмодульных/параллельных отношениях. Проверены каждый файл, поиск, точное объявление,
  native movement, non-entry edit, Undo/Redo, два draft-файла, исправление, .c4/ZIP export,
  workspace replacement/import и reload. Source bytes, entry metadata, snapshots, node transforms и SVG paths сверены.
- PASS: архивный readback — десять нетронутых файлов совпадают byte-for-byte с исходным ZIP;
  CRLF orders model восстановлен точно; экспорт выбранного .c4 совпал с соответствующим ZIP entry;
  экспорт ошибочного выбранного черновика сохранил точные bytes.
- PASS: production-source oxlint; ast-grep; formatting; instruction validation 10/10; diff check.
- PASS: финальный последовательный полный app suite — 465/465, 50 файлов, 108.94 s.
- PASS: финальные existing browser regressions — 15/15, 31.4 s; без retries/skips/flaky/unexpected.

Один concurrent verification run имел три стандартных 5-second test timeouts при совместной нагрузке browser/unit.
Assertions и timeouts не ослаблялись; финальный последовательный полный app suite прошёл 465/465,
existing browser regressions — 15/15. Результаты относятся к указанной финальной production-сборке.
Существующие warnings: MaxListenersExceededWarning, крупный Vite chunk; intentional invalid DSL вызывает
ожидаемые compiler console diagnostics. CI, release, Safari/Firefox и новая проверка больших stress fixtures — NOT_RUN.

## Артефакты

Все paths ниже относительно repository root:

- `output/playwright/source-files-20261006/verify-files.js`, `browser-verification.txt`, `audit.json`.
- `output/playwright/source-files-20261006/app-tests.txt`, `browser-regressions.txt` — финальные полные логи.
- `output/playwright/source-files-20261006/modular-example.zip` — переносимый 12-file пример для GUI.
- `output/playwright/source-files-20261006/edited-project.zip`, `selected-file.c4`, `invalid-selected-draft.c4`.
- `output/playwright/source-files-20261006/final.png`, `source-hashes.json`, `served-assets.json`.
- `output/playwright/source-files-20261006/pre-pinned-layout-failure.txt` — сохранённая диагностика раннего UI failure.

Production write set: App, compiler, editor contracts, source-documents, element-source, SourceFileBrowser,
use-workspace-runtime, use-durable-workspace и два CSS файла. Tests: source-documents,
runtime-mutation-guards, use-durable-workspace. Docs: README, SPEC, ROADMAP/STATUS и packet/report.
Существующие изменения и browser origins пользователя сохранены; commit/push/deploy не выполнялись.
