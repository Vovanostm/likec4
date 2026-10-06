# Быстрые настройки контекстного меню — локальный результат

7 октября 2026. [Packet](WP-16-context-settings.md).

## Поведение

ПКМ / Shift+F10 на логическом элементе открывает меню с текущими значениями и разделами
«Тип», «Форма», «Цвет», «Теги», «Технология». Типы, теги и дополнительные цвета берутся
из спецификации проекта. Доступны все десять существующих форм, включая актора,
компонент, БД, очередь, хранилище, бакет, браузер и мобильное приложение.
Назначение тегов переключается; новый тег создаётся через существующие свойства.
Выбор технологии одновременно назначает её логотип; предусмотрена очистка.
Начальные проекты содержат типы database и queue; импортированные спецификации не переписываются.

Одна настройка — одна команда element.patch, проверенный candidate и один шаг истории.
Меню учитывает captured workspace/revision/view/selection, блокировку слоя, режим просмотра
и черновик инспектора. Source-preserving AST/CST planner меняет kind token / style values;
остальные файлы, комментарии, вложенность и связи сохраняются. Persisted schema не меняется.
Явная форма и цвет редактируются независимо от типа; смена типа сохраняет явные стилевые overrides.

Меню ограничено прямоугольником диаграммы. Длинный список прокручивается, включая keyboard navigation;
меню не сдвигает холст и не перекрывает панель инструментов. Существующие действия связи и удаления сохранены.

## Проверки

- Новый workspace/каталог/keyboard slice: 15/15.
- Повторная изолированная проверка ранее затронутых таймаутами properties/runtime guards/placement/WP-10:
  37/37 со штатными timeout values; functional regression не воспроизведена.
- DocumentEditService settings + существующие element/relation planners: 53/53.
- Production Chromium: 10/10, без retries и skips. Четыре новых сценария + шесть существующих:
  типы, унаследованная форма, project kind title, форма/цвет/теги/technology/icon,
  exact Undo/Redo, IndexedDB reload, exact .c4 download, ZIP export → изменение → import,
  locked layer, отменённый inspector draft, keyboard/back/Escape и границы меню.
- Tested production asset: index-BiHevCyn.js, CSS index-I0XOEEcF.css; preview 62004/62024.
- Generate и production build прошли. Focused format/lint, agent-instruction validation и diff check прошли.
- Расширенный прогон app tests обнаруживал таймауты и был остановлен; зелёная полная suite не заявляется.
  Последний общий повтор снова превысил штатные 20 секунд в повторном connected creation
  (workspace-placement.spec.ts), хотя изолированный повтор этой suite прошёл без изменения лимитов.
- Первоначальная typecheck прошла. Последняя общая typecheck блокируется параллельно добавленным
  src/editor/use-professional-canvas.ts: отсутствуют EditorWorkspace.pasteSubgraph,
  inspectSubgraphRemoval и removeSubgraph. Этот незавершённый clipboard/removal contract не менялся в данном срезе.

Снимки: ../../../output/playwright/context-settings-main.png и context-settings-shapes.png.
Публичное расширение API описано в .changeset/edit-element-kind-shape-and-color.md:
patch для @likec4/language-services, source-preserving изменение kind/shape/color.

## Граница результата

Локальная функциональность подтверждена на перечисленных fixtures. Общая проверка текущего меняющегося
checkout остаётся частичной; CI/release, Safari/Firefox и произвольная сложность — NOT_RUN.
Изменения других задач сохранены, commit/push/deploy не выполнялись. Общий WP-16 и остальные active пакеты
не объявляются завершёнными этим отчётом.

## Продолжение: нативный ПКМ, 7 октября 2026

Проблема воспроизведена в production Chromium: RMB по линии в manual mode добавлял точку изгиба
раньше contextmenu, менял revision и мешал открытию меню. RMB по существующей точке удалял её.
RelationshipEdge теперь уступает RMB подключённому onEdgeContextMenu; overlay точек передаёт
contextmenu тому же handler. Без host callback прежние жесты сохранены. LMB/double-click editing сохранён.
App остаётся владельцем меню/выделения, EditorWorkspace — истории; новых моделей или операций нет.

Проверки текущего candidate index-qQj2usMv.js / index-CAR0Spdm.css:

- Native mouse regression PASS: линия, подпись, точка изгиба, видимый title актора, compound title,
  пустой холст; defaultPrevented=true, меню внутри панели, source/revision/SVG paths/node positions неизменны.
  LMB по выбранной линии по-прежнему создаёт точку. Regression падала на старом candidate.
- 10 прежних context-menu/settings browser scenarios PASS; новая native regression PASS отдельно
  после корректировки event observation и реального mouse hit по тексту под shape hit surface.
  Итого 11/11 сценариев, без skips/retries; единый последний прогон всех 11 не повторялся.
- App generate/build PASS; diagram source typecheck PASS; focused oxlint/dprint PASS;
  check:agent-instructions 10/10 PASS; git diff --check PASS.
- Общая app typecheck FAIL: существующий use-professional-canvas.ts требует отсутствующие
  pasteSubgraph/inspectSubgraphRemoval/removeSubgraph. Полный app suite и CI NOT_RUN в продолжении.

Spacing/alignment отдельно, browser zoom 100%:

- PASS, element menu 1440×900: полный экран pcm-node-1440.png и читаемый pcm-node-menu-crop.png,
  padding 12px, согласованные левые края действий и правые края shortcuts/values, разделители и интервалы.
- PASS, relation menu 900×900: pcm-edge-900x900.png и pcm-edge-900x900-crop.png, ровные края,
  header/action/divider spacing без соприкасающихся контролов.
- FAIL / changes_requested, element menu 900×600: pcm-node-900.png, слишком низкий canvas оставляет
  только header и часть первой строки; в 900×900 pcm-node-900x900.png меню прокручивается,
  нижняя строка тоже видна частично. Scroll/keyboard функционально доступны, но это не визуальное
  одобрение этих состояний. Ограничение размеров существующей оболочки не исправлялось в RMB event slice.
- Inspector/advanced validation states NOT_RUN: renderer event arbitration их не меняет.

Все снимки находятся в output/playwright/ относительно корня repository.
Public patch changeset: .changeset/respect-edge-context-menu.md. Commit/push/deploy не выполнялись.
