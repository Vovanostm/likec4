# Состояние исполнения roadmap

Дата актуализации: 6 октября 2026
Текущая ветка checkout: `main`
Текущий HEAD checkout: `7cedbbe18` (merge PR #17)
WP-11 merge commit: `5858553bb7fdeee3a87b5e7ea0e3ca43da59a0e0`
WP-12 delivery PR: #17

Верхние сведения относятся к текущему checkout; описания WP-12 и ниже сохраняют исторические delivery/review facts.
ZIP v1 contract alignment is a working-tree change pending integration and is not release evidence until committed and
verified at that exact HEAD.

Этот файл — изменяемое состояние исполнения. Стабильные outcomes и acceptance criteria находятся в `ROADMAP.md`.

## Managed state

```yaml
# managed-state:v2
revision: 62
contract_review: complete
active:
  - WP-19
  - WP-18
  - WP-13
  - WP-14
  - WP-15
done:
  - WP-16
  - WP-00
  - WP-01
  - WP-02
  - WP-03
  - WP-04
  - WP-05
  - WP-06
  - WP-07
  - WP-08
  - WP-09
  - WP-10
  - WP-11
  - WP-12
  - WP-17
ready: []
planned: []
blocked: []
```

## WP-19 — Просмотр готовой схемы

2026-10-07 local implementation revision 60: полноэкранный preview, выбор видов/темы, масштаб,
стандартные snapshots и last-valid warning реализованы без нового mutable owner.
Native Chromium: 25/25 checks; focused UI/keyboard: 89/89; build и instruction checks PASS.
Глобальные body hotkeys фонового editor изолированы после executable geometry regression.
Общий gate остаётся неполным: typecheck текущего рабочего дерева обнаружил незавершённый
`use-professional-canvas` API; полный app suite — 439 pass / 38 fail, включая owner test timeouts.
WP-19 остаётся active до общего gate; текущие статусы других пакетов сохранены.
[Отчёт](tasks/WP-19-diagram-preview-report.md).

2026-10-06 active transition revision 58: реализуется admitted packet через существующий renderer.

2026-10-06 ready admission revision 57: прямой запрос пользователя на просмотр схемы как на сайте LikeC4.
[Packet](tasks/WP-19-diagram-preview.md): публичный read-only renderer, существующий last-valid model,
стандартные snapshots; новых DG или изменений contracts/persistence нет. Остальные active пакеты сохранены.

## WP-18 — История действий

2026-10-07 local implementation revision 62: панель «История», typed command labels и атомарный
переход к состоянию реализованы через существующий EditorWorkspace. Focused owners 28/28,
runtime guards 3/3 и durable recovery 1/1 PASS; native Chromium проверил semantic/source/layout
history, точные source/geometry/SVG paths, branch truncation, dirty/invalid guards и reload.
Final build `index-my04-1CX.js`: command → history jump → Undo/Redo → save PASS.
Build/generate, quality, instructions и diff checks PASS. Общий gate остаётся неполным:
full app run остановлен после повторных existing timeouts; closeout typecheck падает на ещё
отсутствующих subgraph API в параллельном `use-professional-canvas`. WP-18 остаётся active;
остальные пакеты сохранены. [Отчёт](tasks/WP-18-action-history-report.md).

2026-10-06 active transition revision 56: implement admitted history packet using existing command owner.

2026-10-06 ready admission revision 55: прямой запрос пользователя на историю как в Photoshop.
[Packet](tasks/WP-18-action-history.md): typed commands и существующий EditorWorkspace остаются владельцами;
панель и атомарный переход по истории без storage migration. Остальные active пакеты сохранены.

## WP-17 — Файлы исходников

2026-10-06 local closeout revision 50: дерево/поиск исходников, редактирование выбранного файла,
переход к точному объявлению элемента и файловая диагностика реализованы через существующий workspace/compiler.
Черновики, source bytes/CRLF, единая история, entry URI и стандартные snapshots сохранены.
Final asset `index-DbeiHckw.js`, CSS `index-B5z53Ysv.css`: app 465/465, focused 69/69,
existing browser regressions 15/15; native Chromium journey 61 checks на 12 файлах.
Generate/typecheck/build, quality и instruction checks passed; source/dist/served hashes совпали.
WP-17 done в локальных границах первого этапа; WP-13–WP-15 остаются active, WP-16 done.
Файловый CRUD/реорганизация, модульная маршрутизация и прочие этапы не реализованы; CI/release,
Safari/Firefox и новая stress acceptance — NOT_RUN. [Отчёт](tasks/WP-17-source-files-report.md).

2026-10-06 active transition revision 49: public location spike passed for a child declared through extend
in another file; diagnostic paths identify that file. Implement admitted packet without new public API.

2026-10-06 ready admission revision 48: пользователь подтвердил реализацию предложения по композиции.
Первый bounded slice — [packet](tasks/WP-17-source-files.md): навигация/редактирование нескольких исходников
и переход к объявлению выбранного элемента через существующие compiler/workspace contracts.
WP-13–WP-15 остаются active; WP-16 done и его доказательства сохранены. Файловая реорганизация,
маршрутизация новых сущностей и прочие этапы предложения не входят в этот packet.

## WP-16 — Расширенный цикл проверки стандартов

2026-10-07 direct-request continuation: нативный ПКМ исправлен для линий и точек связи;
11 focused browser scenarios PASS, public diagram types/build PASS. App typecheck сохраняет известный
use-professional-canvas blocker. Visual spacing PASS для element 1440×900/relation 900×900;
низкий canvas/прокрутка element menu 900×600 и 900×900 остаётся FAIL, без общего visual approval.
[Дополнение отчёта](tasks/WP-16-context-settings-report.md). Managed states других задач сохранены.

2026-10-07 context-menu local proof: панель «Положение» удалена, ЛКМ только выделяет, ПКМ/Shift+F10
открывают transient overlay внутри самой диаграммы. Final asset `index-BiHevCyn.js`: browser **28/28 PASS**,
focused unit **65/65 PASS**. Existing managed statuses сохранены; текущая общая интеграция PARTIAL:
после внешнего stash merge typecheck падает в use-professional-canvas (три отсутствующих workspace API),
а промежуточные full/stress unit runs имели failures. [Отчёт](tasks/canvas-context-2026-10-06/REPORT.md).

2026-10-07 inspector local closeout revision 59: компактный searchable select вместо сетки
технологий, inline очистка, custom value и секции тегов без вложенных карточек; оба инспектора.
Focused 30/30, production browser regressions 2/2, native search/keyboard/save/Undo/Redo/Escape
и dropdown placement на 1440×1000 и 1280×720 прошли на frozen candidate `index-BIBQyPZu.js`.
Generate/typecheck/build и focused quality прошли. App suite: 462/465; три timeout при совместной
нагрузке сборки, отдельный повтор обоих файлов 26/26 со штатными лимитами. Полный green suite
в одном новом запуске не заявляется. Остальные WP сохранены; CI/release вне локальной приёмки.
[Packet и проверки](tasks/WP-16-inspector-select.md).

2026-10-06 context-settings ready admission and active follow-up: прямой запрос пользователя
на быстрый выбор типа, цвета, тегов и других настроек в контекстном меню.
[Packet](tasks/WP-16-context-settings.md). Расширяется существующий DG-01 element.patch planner;
остальные active пакеты и предыдущие доказательства сохранены.

2026-10-07 context-settings local closeout: быстрые type/shape/color/tag/technology настройки
через существующий source-preserving command owner; 15/15 focused, 53/53 planners,
10/10 production Chromium. Build и quality checks прошли. Общая typecheck текущего checkout
имеет три ошибки в параллельном use-professional-canvas contract; full suite не заявляется зелёной.
[Отчёт](tasks/WP-16-context-settings-report.md). Managed state других пакетов сохранён.

2026-10-06 context-menu ready admission revision 53, active transition revision 54: прямой запрос
пользователя удалить панель «Положение» и сдвиг холста при выборе. [Packet](tasks/canvas-context-2026-10-06/WP-16.md).
Existing context callbacks/DG-01 достаточны; WP-13–WP-15 и прежние изменения сохранены.

2026-10-06 inspector active transition revision 52: реализуется пользовательский UI follow-up.
Ready admission revision 51: [packet](tasks/WP-16-inspector-select.md), существующие DG закрыты.
Компактные секции вместо вложенных карточек; searchable select технологий с custom value.
WP-13–WP-15 сохранены; prior acceptance относится к прежней сборке.

2026-10-06 properties local closeout revision 47: создание тегов из инспектора элемента/связи,
metadata логических связей (title/description/technology/tags), компактное описание и поддержка связей
без названия реализованы через DG-01 AST/CST planner и единую workspace history. Native UI прошёл
на восьмиуровневом fixture: draft preservation, назначение/снятие, exact Undo/Redo, fresh zero-tag project,
.c4/ZIP export, replacement/import/reload, точные source/node positions/SVG paths.
Final asset `index-BvuFrzjW.js`: app 455/455, planner owners 48/48, affected browser regressions 16/16,
zero retries/skips/flaky/unexpected/runner errors; generate/types/build, quality и instruction checks passed.
Source/dist/served hashes совпали. Tag styling/rename/remove, relation style и полное specification authoring
остаются за границами packet; CI/release и произвольная сложность не заявляются. WP-13–WP-15 сохранены.
[Отчёт](tasks/nested-ux-2026-10-06/PROPERTIES-REPORT.md); [packet](tasks/nested-ux-2026-10-06/WP-16-properties.md).

2026-10-06 properties active transition revision 46: implement the admitted packet sequentially through DG-01.

2026-10-06 properties ready admission revision 45: пользователь поручил Implement fixes после nesting audit.
Bounded follow-up: [packet](tasks/nested-ux-2026-10-06/WP-16-properties.md).
Создание тегов и metadata логических связей через existing DG-01 AST/CST planner; prior acceptance сохранён.
WP-13–WP-15 и пользовательские данные не меняются.

2026-10-06 nested usability local closeout revision 44: исправлены сжатие дерева на глубоких уровнях,
многострочный breadcrumb header и наложение новых внешних узлов на ручную раскладку при создании
межветочной связи. Добавлены поиск по title/FQN, создание дочернего элемента без промежуточного вида,
доступный блок назначения объявленных тегов. Native fixture: 13 UI-authored logical elements, восемь
уровней вложенности ниже корня, две связи, десять видов; rename/reparent, теги, layers, native movement,
exact history/source/geometry и ZIP/reload прошли без наложений. Final immutable asset `index-DOXRRZdz.js`:
browser 67/67 без retries/skips/flaky/unexpected/runner errors; app 450/450 при одном worker и штатных
timeouts, generate/types/build, focused quality, 10/10 instruction checks и diff check passed.
Source/served asset hashes совпали. Ограничения GUI tag definitions и relationship tags/styles явно
зафиксированы; arbitrary complexity, CI/release и другие browsers не заявляются. WP-13–WP-15 остаются
active, user storage/dirty checkout сохранены, commit/push/deploy отсутствуют.
[Отчёт](tasks/nested-ux-2026-10-06/REPORT.md); [packet](tasks/nested-ux-2026-10-06/WP-16-nesting.md).

2026-10-06 nested usability active transition revision 43: real UI creation of eight nested levels
reproduced shrinking tree rows and a five-row breadcrumb header. Fix within the admitted app presentation
owners; verify tag assignment and cross-branch command/history/persistence on the integrated build.

2026-10-06 nested usability ready admission revision 42: новый запрос пользователя расширяет browser
проверку на глубокую вложенность, связи между уровнями, назначение тегов и остальные поддержанные
действия. Прежний routing closeout сохраняет доказательства своей матрицы. Follow-up packet:
[WP-16 nesting](tasks/nested-ux-2026-10-06/WP-16-nesting.md). WP-13–WP-15 остаются active;
проектные данные и dirty checkout сохраняются, публикация не входит в scope.

2026-10-06 strengthened local desktop acceptance revision 41: исправлены независимое распределение
портов по сторонам и fan-out по геометрии, превращение автоматических линий в ручные кривые,
потеря manual label intent при semantic recompile, последняя позиция pointer drag, перехват следующего
клика и рассогласование native/host selection после кнопки/Escape. Geometry save/reset/history используют
уже проверенную модель без повторного compiler/layout для неизменных sources; изменённые sources
по-прежнему компилируются. Snapshot/revision/history/persistence contracts сохранены.
Final immutable asset `index-BK3aO3U0.js`: browser 67/67 без retries/skips/flaky/unexpected, app 443/443
при одном worker и штатных timeouts, geometry owners 55/55, types/build, focused lint/format и instruction
checks passed. Native 200-node/370-edge SVG: нет наложений leaf nodes или проходов через их тела;
перемещение, Undo/Redo, source bytes, paths и reload exact. Manual labels/curves сохранены после
изменения свойств и ZIP/reload. Native typography восьми leaf nodes согласована по ролям.
Подтверждённая граница — локальный Chromium desktop и конечные fixtures, без гарантии произвольного
размера: displacement 253 ms, сохранение ~1.62 s включает штатный debounce 1 s. User storage 4174 и
preview 4184 не заменены; commit/push/deploy отсутствуют. WP-16 done в этих границах, WP-13–WP-15
сохранены active. [Текущий отчёт](tasks/c4-connection-readability/2026-10-06-ROUTING-AUDIT.md).

2026-10-06 routing/visual-editing reopen revision 40: пользователь повторно отклонил визуальную приёмку
и поручил критически проверить линии, отображение и ручную настройку сложной архитектуры. Прежний done
применим только к прежней матрице, без доказательства аккуратных точек подключения и сохранения ручных
подписей при semantic recompile. WP-16 active, остальные пакеты сохранены. Авторизованный follow-up
продолжает existing diagram route/layout owners и browser QA без новой геометрической схемы или API.
Packet: tasks/c4-connection-readability/WP-16-routing.md; follow-up закрыт результатом revision 41 выше.

2026-10-05 corrected desktop acceptance revision 39: создание/перемещение и восстановление согласуют
маршруты с финальной геометрией; reverse/parallel paths, labels, arrow attachment и точные curves проверены
через native SVG/DOM и screenshots. Исправлены same-revision snapshot repair, inner-node keyboard persistence,
relation dirty discard и первый title для fully qualified target. Фактический user source сохранён byte-for-byte;
Customer отделён от system, остальные manual positions сохранены, revision 44 восстановлена после reload.
Current asset `index-D4ia-oHx.js`: полная production browser matrix 65/65 без retries/skips, app 441/441,
diagram 44/44, source owner 35/35, types/generate/build, focused quality и 10/10 instruction checks passed.
Independent critic просмотрел actual desktop result и три route scenarios, reviewed P1/P2 не осталось.
[Checklist](tasks/c4-completion/READINESS.md): 15/15 PASS только для локального desktop scope;
[current manifest](tasks/c4-connection-readability/evidence/manifest.json). Browser assets обслуживаемой
сборки совпали по SHA-256; immutable preview исключил изменение candidate чужим rebuild во время tests.
WP-16 done в этих границах; WP-13–WP-15 active, dirty worktree сохранён. Исторические transitions ниже сохранены.
CI/release/human/Safari/Firefox и sustained stress beyond 57 elements — NOT_RUN; commit/push/publish отсутствуют.

2026-10-05 connection readability reopen revision 38: пользователь отклонил визуальную приёмку.
Прежние 59 functional tests и no-overlap assertions не проверяли маршруты связей, прохождение через
посторонние узлы, различимость reverse/parallel edges и читаемость диаграммы в текущем browser viewport.
WP-16 active; previous local-ready verdict withdrawn. Новая приёмка требует реального browser proof
этих свойств на current workspace и connected C4 sample, без подмены ручной геометрии reset-only решением.
WP-13–WP-15 и dirty worktree сохранены. Packet: tasks/c4-connection-readability/WP-16-routing.md.

2026-10-05 C4 desktop local acceptance transition revision 37: UI-only C1/C2/C3 authoring, root context/bootstrap,
container presets, six technology logos, layers, collision-free creation и durable auto arrangement реализованы.
Frozen asset `index-CZeOH7MY.js`: desktop browser 59/59, app 422/422, source owners 42/42, diagram owners 23/23,
types/build/generate и focused quality gates passed. Chrome DevTools проверил technology, layers, root relation,
C1/C2 navigation, auto→reload и совпадение SHA-256 main JS/CSS. Independent source critic не оставил reviewed P1/P2.
[Текущий checklist](tasks/c4-completion/READINESS.md): 14/14 PASS в локальном desktop scope;
[evidence manifest](tasks/c4-completion/evidence/manifest.json). WP-16 done только для этой матрицы.
WP-13–WP-15 active; CI/release/human/Safari/Firefox и sustained stress beyond 57 elements — NOT_RUN.
Dirty worktree сохранён, commit/push/publish отсутствуют. Исторические reopen/acceptance transitions ниже сохранены.

Авторизация пользователя 2026-10-04: повторять исправления и критическую проверку до удовлетворительного пользовательского пути. Ready admission revision 30, active transition revision 31, local acceptance transition revision 32. Packet: `tasks/WP-16-critical-ux-loop.md`; исходный аудит: `tasks/ux-audit-2026-10-04/REPORT.md`; исправления и доказательства: `tasks/ux-audit-2026-10-04/CORRECTIONS.md`.

F01–F18 и дополнительные найденные дефекты исправлены. В проверенном поддержанном пути открытых подтверждённых P1/P2 нет. App 355/355, финальная production-сборка — 51/51 browser scenarios, Lighthouse accessibility/Best Practices 100 desktop/mobile. SHA-256 обслуживаемых JS/CSS совпали с локальными. Локальные checks не являются CI/release/human acceptance; остаточные границы записаны в отчёте. `done` относится только к этому авторизованному локальному циклу. WP-13–WP-15 остаются active; preexisting dirty worktree сохранён, commit/publish не выполнялись.

2026-10-05 пользователь поручил продолжить проверку стандартов и заполнить checklist. Reopen transition revision 33: расширенная матрица обнаружила ST01–ST04 (keyboard layout persistence, text-resize stress, single-pointer placement, cold mobile startup). Поэтому прежний local acceptance относится только к прежней browser matrix; текущий расширенный цикл active. [STANDARDS-CHECKLIST.md](tasks/ux-audit-2026-10-04/STANDARDS-CHECKLIST.md) содержит 55 WCAG A/AA criteria и 28 engineering controls с actual status/evidence/closure action. Product code в этом проходе не менялся; 27 Markdown и 15 workspace/ZIP tests passed. Полное standards/CI/release/human acceptance не подтверждено. WP-13–WP-15 не изменены.

2026-10-05 scope transition revision 34: пользователь ограничил продукт и приёмку desktop-редактором диаграмм. Canonical policy обновлена в root AGENTS.md. Mobile, WCAG/AT и text-size accessibility stress больше не являются обязательными gates. ST01 keyboard persistence остаётся в работе; placement проверяется как удобство desktop. Performance оценивается на desktop. WP-16 остаётся active до новой функциональной browser проверки изменённой сборки.

2026-10-05 desktop local acceptance transition revision 35: ST01 исправлен. Keyboard/pointer/button movement
проходит constraints и standard snapshot; pending layout защищает ZIP/history; выбор через дерево согласован с renderer.
App 355/355, diagram owners 23/23, production desktop browser 54/54, app/diagram types/build и focused quality checks passed.
Chrome DevTools подтвердил native movement, tree/button target, Undo/reload и SHA-256 index-CSKAq45U.js.
[Актуальный checklist](tasks/ux-audit-2026-10-04/DESKTOP-CHECKLIST.md): 16 PASS, 3 PARTIAL, 3 NOT_RUN.
WP-16 done только в пределах локального desktop acceptance; большие модели, CI/release, human/Safari/Firefox — NOT_RUN.
WP-13–WP-15 и прежние изменения не переименованы/не закрыты. Commit/push/publish не выполнялись.

2026-10-05 C4 user journey reopen revision 36: пользователь потребовал проверить создание сервиса как обычный
пользователь, layers, technology images, levels и auto placement. Chrome на прежнем frozen asset воспроизвёл
sibling overlap 160×99 и возврат старого manual layout после auto→reload. C1 root context, container presets,
logo catalogue и layers отсутствуют; scoped C2/C3 creation работает вручную. Поэтому WP-16 active, product readiness
changes_requested; прежняя local acceptance относится только к 54 narrow scenarios. Product code не менялся.
[Отчёт](tasks/c4-service-audit-2026-10-05/REPORT.md) и [план](tasks/c4-service-audit-2026-10-05/PLAN.md).
Checklist: 16 PASS, 4 PARTIAL, 3 NOT_RUN, 5 FAIL; отдельные статусы WP-13–WP-15 сохранены.

## WP-15 — Canvas-first workspace: локальная реализация, browser acceptance pending

Авторизация 2026-10-04: implement с workers и независимыми критическими reviews. Ready admission revision 27,
active transition revision 28. Границы: `tasks/WP-15-canvas-workspace.md`; gate `decisions/DG-15-bootstrap.md`.
Canvas-only startup, exclusive retained panels, viewport-bound responsive workspace и atomic first diagram
реализованы локально. Review corrections и evidence: `tasks/WP-15-implementation-report.md`.
WP-13/WP-14 остаются active; native browser/CI/human acceptance не заменяется static checks.

## WP-14 — UX fixes: локальная реализация, browser acceptance pending

Авторизация пользователя: реализовать `tasks/UX-FIXES.spec.json`. Границы: `tasks/WP-14-ux-fixes.md`.
Реализованы FIX-01–FIX-12; оба DG закрыты ADR и исполняемыми tests. Проверки и ограничения:
`tasks/WP-14-implementation-report.md`. WP-13 не расширен; прежние edits/deletions сохранены.
227 tests / 31 files, app generate/typecheck/build, oxlint, ast-grep, instruction validation и diff check прошли.
37 browser scenarios обнаружены и statically typechecked, но НЕ выполнены.
Пакет остаётся active до разрешённого browser/CI и human acceptance; 60-second onboarding, 200% zoom,
contrast, реальные IME/focus и viewport geometry не объявляются passed по unit tests.

2026-10-04: авторизован follow-up трёх UX findings внутри active WP-14: полный committed ZIP при invalid draft,
подтверждение recovery replacement, ошибки удаления внутри modal и inline title placement внутри canvas.
Три disjoint worker scopes и parent integration реализовали эти исправления. Два независимых review rounds
выявили и помогли исправить три import/runtime races: порядок requests до file read, lock незавершённых replacements
и раздельные operation/replacement busy owners. Все findings закрыты targeted source rechecks.
Hook suite 41/41 и runtime integration suite 6/6 прошли. Final full suite: 277/278 tests, 30/31 files;
один существующий WP10 scoped-create test timeout 5000 ms, все новые regressions passed. Full-suite gate НЕ green;
assertions/timeout не ослаблены. Generate/typecheck/build и source quality gates прошли; preview обслуживает
свежий main asset с HTTP 200. Это не browser/UX acceptance.
Точные проверки/ограничения: `tasks/WP-14-implementation-report.md`. Managed state не объявляет browser/human
acceptance завершённой и не считает локальные source checks release evidence.

## WP-13 — Удобное редактирование на холсте: локальная реализация

Продолжение авторизованного улучшения UX в духе Miro. Границы и проверки:
`tasks/WP-13-canvas-editing.md`. WP-12 завершён; новые DG, public API, schema migration и зависимости не требуются.
Исходные изменения рабочего дерева сохраняются. Browser automation для локальной вкладки отклонена политикой инструмента;
unit/static validation не считается визуальным browser evidence.

Реализованы плавающие инструменты, быстрые действия выбранной сущности, compact canvas feedback и единый keyboard routing.
Native text Undo, dialogs/menus, IME, repeat и disabled-state изолированы от editor commands; Enter в дереве открывает
свойства, а Enter с create tool на canvas использует `screenToFlowPosition` и существующий `element.createAt`.
Смена вида сбрасывает transient tools. Удаление через быстрые действия возвращает focus на canvas.

Локальная проверка: app generate, typecheck, 20 test files / 139 tests, build, oxlint, ast-grep и instruction check прошли.
Независимый review выявил и помог исправить tree-Enter и focus-after-edge-removal regressions.
Пакет остаётся active до browser/CI acceptance; browser geometry, narrow viewport и DOM focus ещё не подтверждены.

## WP-12 — Production-grade Direct Canvas Editing complete

AI-ready contract: `apps/gui-to-code/AI-READY.WP-12.md`. Delivery PR: #17. Historical WP-11 baseline: `5858553bb7fdeee3a87b5e7ea0e3ca43da59a0e0`. Clean WP-12 implementation baseline after Phase 0 recovery: `c4d42b55a4244d46518865a27ef0cfb57a8d4db9`.

### Baseline recovery

Fresh GUI-to-code CI reproduced the remaining WP-10 acceptance failure. The product did persist the inline title into LikeC4 DSL, but the test assumed inline declaration syntax while the source-preserving patch planner correctly emitted a `title` property block. The failure was classified `STALE_TEST`; the acceptance assertion was updated to verify the actual source-preserving DSL form while retaining exact source and Undo/Redo checks. GUI-to-code run #318 then passed generation, language-services tests/typecheck, GUI typecheck/unit tests, production build/startup, full Playwright acceptance, agent-instruction validation and `git diff --check`.

### Delivered outcome

- existing → existing connection handles retain typed logical, dynamic and deployment authoring through the active compiled view family;
- connection gestures remain revision/view-bound and fail closed when their captured interaction context becomes stale;
- logical, dynamic and deployment edge inspectors expose exact title patch/remove with parser/compiler-owned semantic identity;
- logical edge selections now capture the same revision/view context as dynamic and deployment edges, so stale logical inspector actions cannot commit after workspace/view changes;
- duplicate same-endpoint logical relations remain independently selectable through their exact relation IDs and discriminator;
- existing → empty connected creation now collects element kind and initial title before mutation and passes both through the existing `element.createConnected` command;
- element + initial title + directed relation + standard manual-layout position therefore commit as one `EditorWorkspace` transaction and one history entry;
- one Undo removes the complete connected-create result; Redo restores its exact semantic and layout state;
- empty-canvas creation keeps its existing inline-title workflow because it is a separate user interaction, while connected creation no longer creates an extra title-patch history entry;
- F2/double-click node title editing, keyboard edge actions, editable-control protection, busy-state gating and focus restoration remain on the existing canvas-first paths;
- `EditorWorkspace` remains the sole mutation/history owner, LikeC4 DSL remains canonical, and no renderer semantic owner, persistence migration, grammar change or new dependency was introduced.

### Review A — architecture and correctness

Verified/fixed findings:

- reused the existing `element.createConnected` command and its source-preserving document planner instead of introducing a composite command batch or second transaction;
- reused existing title support in `CreateConnectedElementCommand`, preserving candidate compile, exact semantic verification, layout transactionality and one history entry;
- generalized the existing edge freshness guard so logical/dynamic/deployment inspector actions share the same captured revision/view rule;
- semantic relation identity remains relation ID / parser-owned identity rather than endpoint-only lookup;
- dynamic `StepSeries` unsafe segment removal remains fail-closed;
- rejected/stale operations do not mutate source, revision, history or manual layout.

### Review B — product, reliability and accessibility

Verified/fixed findings:

- connected-create menu uses Russian labels, requires a non-empty initial title, supports Enter submission and Escape cancellation, and disables conflicting submission while busy;
- kind selection and title entry occur before the atomic connected-create command, so the UI no longer misleadingly reports one operation while requiring a second title mutation;
- logical stale-edge actions now surface the same Russian retry guidance as the other edge families;
- keyboard Delete/Backspace protection for editable controls, Enter inspector focus, F2 rename and Escape cancellation remain unchanged;
- existing responsive canvas/inspector shell and focus behavior are reused rather than introducing another overlay/state owner.

### Verification

Release evidence is GitHub CI only. The final exact HEAD, required workflow run IDs, mergeability and zero unresolved review-thread evidence are maintained in PR #17 because the HEAD changes whenever this status document itself is committed.

### Explicit limitations

- edge metadata editing remains title-only;
- exact dynamic removal supports standalone `Step`; unsafe `StepSeries` segment rewriting fails closed;
- connected-create is supported in logical/static element views; dynamic/deployment direct authoring creates their existing relation/step families but does not create a new logical element from an empty drop;
- selection, focus, menus and captured interaction state remain transient UI state and are not persisted as domain data.

## WP-11 — Dynamic & Deployment Edge CRUD Parity complete

AI-ready contract: WP-11 implementation contract delivered in PR #16. Discovery record: `apps/gui-to-code/decisions/WP-11-DYNAMIC-DEPLOYMENT-EDGE-CRUD-DISCOVERY.md`.

### Delivered outcome

- canvas-selected dynamic steps expose a Russian inspector with endpoints, editable title and exact remove action;
- canvas-selected deployment relations expose the same title/remove parity;
- dynamic identity resolves through parser-owned `astPath` carried by the compiled edge;
- deployment identity resolves through parser-owned `RelationId` to the owning parsed document and exact relation `astPath`;
- duplicate endpoint declarations are source-addressed exactly rather than by endpoint-only matching;
- public `DynamicDeploymentDocumentEditService` now owns source-preserving patch/remove planning for both edge families;
- browser and Node language-services entrypoints expose the same additive API and a patch changeset records the package contract change;
- all mutations remain `EditorWorkspace` transactions: captured revision → source-preserving candidate → compile → exact semantic verification → one atomic commit/history entry;
- semantic patch/remove leaves `manualLayouts` unchanged;
- Undo/Redo restores exact source bytes for patch/remove;
- stale inspector actions fail closed after revision or view changes;
- Enter and Shift+F10 focus the edge inspector, Delete/Backspace remove outside editable controls, and Escape clears selection with canvas focus restoration;
- unsupported edge metadata remains hidden instead of rendered as a misleading disabled form.

### Review A — correctness and architecture

Fixed findings:

- post-compile verification initially assumed non-selected dynamic `astPath` and deployment `RelationId` remained stable after deletion; removing an earlier declaration can renumber derived identities, so verification now compares the exact remaining semantic multiset while source targeting remains AST/CST-owned;
- first and second duplicate declarations are covered separately so endpoint duplication cannot collapse patch/remove onto all matches;
- dynamic `StepSeries` segment removal is rejected fail-closed when deleting one segment would structurally rewrite neighboring flow semantics;
- source planners use Langium AST/CST and existing source revisions; React never computes source ranges or relation occurrences;
- no renderer, persisted schema, dependency, grammar, manual-layout format or secondary semantic graph was introduced.

### Review B — UX and accessibility

Verified/fixed findings:

- dynamic/deployment inspector labels use Russian domain terminology and no longer expose unsupported metadata messaging;
- busy state disables title editing and destructive actions, preventing double submit;
- Delete/Backspace is guarded for `input`, `textarea`, `select` and `contenteditable` targets;
- successful patch deterministically returns focus to the editable title; successful removal returns focus to the canvas;
- stale selection remains actionable through a Russian error and performs no mutation;
- existing responsive inspector/workspace layout is reused without adding a new narrow-view surface.

### Verification

Focused language-services, workspace integration and Playwright WP-11 acceptance tests are included. Exact-head release evidence is the required green `GUI-to-code`, `CI (PR & push)` and `push` GitHub Actions set recorded in PR #16. No local validation is release evidence.

### Explicit limitations

- supported edge metadata editing is title-only;
- exact removal is supported for standalone dynamic `Step`; deleting one segment from `StepSeries` fails closed when it would require structural rewriting of neighboring steps;
- selection, inspector focus and captured stale-state guards remain transient and are not persisted as domain data.

## WP-10 — Canvas Entity Editing and Atomic Creation complete

AI-ready contract: `apps/gui-to-code/AI-READY.WP-10.md`.

### Delivered outcome

- canvas edges are selectable as typed logical relation, dynamic step or deployment relation entities;
- logical relation title can be patched and the exact selected duplicate can be removed source-preservingly;
- node double-click and F2 open inline display-title editing;
- empty-canvas double-click creates a logical element at the exact flow coordinate;
- active static `viewOf` scope owns newly created canvas elements, so they remain visible in the current view;
- connection existing → empty creates element, directed relation and standard manual-layout position atomically;
- connection lifecycle distinguishes `connected`, `empty` and `cancelled` without creating DSL inside `@likec4/diagram`;
- screen coordinates are converted through `XYFlowInstance.screenToFlowPosition` before persistence;
- source and `ViewManualLayoutSnapshot` are committed through one `EditorWorkspace` transaction and one history entry;
- Undo/Redo restores source and layout together;
- structure, inspector and DSL panels are collapsible; DSL is hidden by default;
- keyboard routes cover F2, Enter, Delete/Backspace, Escape and Shift+F10 without intercepting editable controls;
- responsive layout collapses to one column and avoids page-level horizontal overflow.

### Review A — architecture and atomicity

Fixed findings:

- scoped static view creation initially produced an invisible root element; document planning now creates and moves it under `viewOf`, then verifies the full FQN;
- nested relations can use relative endpoints; exact relation identity now resolves lexical element scope, `this` references and duplicate endpoint occurrence;
- create-and-connect remains a dedicated domain command rather than a generic command batch;
- renderer remains gesture-only; `EditorWorkspace` remains the sole source/revision/layout/history owner;
- rejected or stale candidates do not mutate source, layout, revision or history;
- create-and-connect acceptance now uses a valid sibling relation, while a forbidden parent-to-child relation is covered as an exact rollback case.

### Review B — UX and accessibility

Fixed findings:

- creation menu focuses the first enabled kind rather than a disabled control;
- F2 cannot edit a stale node selection while an edge is selected;
- contextual overlays are clamped to canvas bounds;
- direct-create tool reset no longer overwrites success feedback;
- inline edit has explicit Enter-save, Escape-cancel and blur-cancel behaviour with focus return;
- submit-induced blur no longer closes the inline editor, and a rejected save restores input focus;
- edge alternatives expose a discriminator when one visual edge aggregates multiple logical relations.

### Verification

Focused diagram lifecycle, source-preservation, workspace atomicity and Playwright canvas acceptance tests are included. Exact-head GitHub CI evidence is recorded in PR #15; no local validation is used as release evidence.

### Explicit limitations

- logical relation metadata editing is title-only;
- selection, focus, menus and gesture state remain transient and are not persisted as domain data.

## WP-09 — Direct connection foundation complete

- pointer drag existing → existing creates static, dynamic or deployment semantics through the existing typed command pipeline;
- semantic family is selected by the active compiled view rather than visual node shape;
- gesture start captures exact view ID and workspace revision and completion fails closed after either changes;
- invalid, busy and element-create-tool states disable direct authoring;
- existing form/select controls remain keyboard fallbacks.

## WP-08 — MVP release gate complete

- Russian UX terminology and durable-workspace states are consistent;
- critical controls have accessible names and responsive production smoke coverage;
- production artifact build, preview smoke and Playwright acceptance are part of the standalone `GUI-to-code` workflow;
- README documents supported features, recovery, persisted schema and MVP limitations.
