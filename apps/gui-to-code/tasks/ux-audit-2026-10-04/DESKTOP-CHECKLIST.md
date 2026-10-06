# Desktop — проверка редактора диаграмм

Дата: 5 октября 2026. Актуальный продуктовый scope — только desktop, по прямой инструкции пользователя.
Каноническая policy: [AGENTS.md](../../../../AGENTS.md). Mobile, touch, WCAG/AT и accessibility certification
исключены из приёмки. [Исторический standards audit](STANDARDS-CHECKLIST.md) сохраняет прежние результаты;
исключённые проверки не считаются пройденными.

Статусы: PASS — выполненная конкретная проверка; PARTIAL — ограниченное подтверждение; NOT_RUN — не выполнено; FAIL — требуемый пользовательский результат не достигнут.
Матрица подтверждает выбранные инженерные практики и локальный desktop путь, а не полную сертификацию стандартов.
После полного C4 прохода актуально 28 строк: 16 PASS, 4 PARTIAL, 3 NOT_RUN, 5 FAIL.
**Product readiness: changes_requested.** Новые findings: [C4 audit](../c4-service-audit-2026-10-05/REPORT.md). [Машиночитаемая версия](DESKTOP-CHECKLIST.json).

## Результат предыдущего цикла отдельных операций

ST01 исправлен: keyboard, pointer и кнопки «Положение» используют renderer constraints и стандартный snapshot.
Повторная критическая проверка выявила и закрыла stale ZIP race, потерю последнего drag position и рассогласование
выбора через дерево. Repeat/blur/window blur заканчивают одну layout transaction. EditorWorkspace остаётся
единственным semantic/history owner, compiler-before-commit и source-preserving edits сохранены.

Production browser: 54/54 desktop scenarios; app: 355/355; diagram owners: 23/23. Сборка не менялась во время
browser acceptance. Chrome DevTools проверил actual key/button interactions и обслуживаемые SHA-256.
Кандидат и логи: [manifest](evidence/desktop/manifest-current.json),
[Chrome](evidence/desktop/chrome-current-movement-and-assets.json),
[startup](evidence/desktop/startup-current-cold.json).

## Заполненная матрица

| Проверка                                                 | Статус  | Основание и граница                                                                                                                                                                           |
| -------------------------------------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D01 Desktop-only policy и согласованные инструкции       | PASS    | Root/scoped AGENTS, README/SPEC/ROADMAP и task packet согласованы. Instruction validator: 10/10.                                                                                              |
| D02 Создание пустого проекта без DSL                     | PASS    | Production browser: empty-workspace и WP16 bootstrap, первый элемент/вид, Undo/Redo и reload.                                                                                                 |
| D03 Создание элементов, именование и инспектор           | PASS    | Production browser: WP04/WP10/WP12, context menu, draft сохранён при смене панелей.                                                                                                           |
| D04 Направленные связи, static/dynamic/deployment        | PASS    | WP11/WP12: точная связь, title/remove, stale rejection, атомарное create-and-connect.                                                                                                         |
| D05 Удаление и защита зависимостей                       | PASS    | Browser CRUD и owner tests: зависимые сущности/подтверждение/отклонение без изменения валидной ревизии.                                                                                       |
| D06 Source-preserving patches                            | PASS    | Exact-source title/Markdown/clear/Undo/Redo/reload. Comments, technology и untouched properties сохранены.                                                                                    |
| D07 Last valid canvas и invalid DSL                      | PASS    | Invalid draft сохраняет valid diagram; semantic и geometry actions блокируются; точный draft доступен для скачивания.                                                                         |
| D08 Единая семантическая история Undo/Redo               | PASS    | EditorWorkspace owner; browser exact history для semantic и layout операций, keyboard repeat — один Undo.                                                                                     |
| D09 Ручное перемещение мышью и constraints               | PASS    | Native drag; compound переносит детей один раз, отдельный ребёнок не сдвигает соседа. Owner: 4 solver regressions.                                                                            |
| D10 Клавиатурное перемещение, repeat и потеря фокуса     | PASS    | WP16: release, blur, window blur, Shift, source unchanged, Undo/Redo, reload. Chrome native ArrowRight 50→55, сохранено после reload.                                                         |
| D11 Кнопки «Положение», выбор через дерево и read-only   | PASS    | Один renderer API; tree selection снимает прежний canvas selection; button movement/Undo, invalid/read-only guards.                                                                           |
| D12 Reload и ZIP сохраняют ручное положение              | PASS    | Реальный ZIP download/import и reload; стандартные .likec4 snapshots, без app-owned geometry.                                                                                                 |
| D13 Экспорт ждёт незавершённую раскладку                 | PASS    | Held arrow: статус saving, ZIP и Undo disabled. После сохранения ZIP содержит актуальное положение.                                                                                           |
| D14 IndexedDB, backup, CAS и replacement races           | PASS    | 355 app tests и browser two-page stale-token/recovery; sources/layout/metadata сохраняются транзакционно.                                                                                     |
| D15 Desktop canvas, панели и основные controls           | PASS    | Desktop/wide browser smoke, 1440×1000 Chrome; zoom controls reachable. Mobile исключён из финальной matrix.                                                                                   |
| D16 Безопасный bounded ZIP import и Markdown             | PARTIAL | 15 workspace/ZIP и 27 Markdown owner tests из расширенного аудита; script/javascript probe не исполнился. Полный security audit не выполнен.                                                  |
| D17 Desktop startup и работа небольшой диаграммы         | PARTIAL | Текущий fresh Chrome context: 3 nodes, first diagram 449.4 ms, LCP 484 ms, FCP 212 ms, CLS 0, max long task 156 ms. Один loopback lab sample, не field CWV/INP.                               |
| D18 Большие модели и длительная нагрузка                 | NOT_RUN | Нет corpus, согласованного budget и sustained benchmark. Отдельный performance packet: задать число nodes/edges и измерить startup/edit/drag/history/memory.                                  |
| D19 App tests, public owner checks, types и build        | PASS    | App 355/355; diagram owners 23/23; app/diagram typecheck и production build. В браузере SHA-256 совпал с dist.                                                                                |
| D20 Focused lint/format, architecture/instruction checks | PARTIAL | Focused oxlint, scoped dprint, AST, instruction validator и diff check passed. Полный root lint имеет 3 прежних import-type violations вне изменённых owners; не заявляется clean repository. |
| D21 CI и опубликованный release candidate                | NOT_RUN | Dirty worktree, без commit/push/publish. После отдельной авторизации публикации: CI на неизменном commit/artifact.                                                                            |
| D22 Реальный пользователь и desktop browser matrix       | NOT_RUN | Chrome automation не заменяет human onboarding, Safari/Firefox. Следующий отдельный QA: supported browser list и реальный путь create→edit→save→ZIP→reload.                                   |

| D23 C1 context без DSL | FAIL | C4-01: root actor исчезает из scoped view; actor→system сохранена, но не отображается; root context UI не найден. |
| D24 Генерация C2/C3 и прямые переходы | PARTIAL | Scoped views, child creation и dropdown работают. C4-07: ручное создание, нет ясного drill/back; double-click открывает rename. |
| D25 Каталог технологий и изображения | FAIL | C4-04/05: PostgreSQL — текст без logo; отсутствует C4 Container starter kind. |
| D26 Рабочие слои и дерево | FAIL | C4-06: recursive selection list всегда раскрыт; hide/lock/order отсутствуют. |
| D27 Создание без наложения siblings | FAIL | C4-02: API и база после двух create-at пересеклись 160×99 px. |
| D28 Сохраняемая авторасстановка | FAIL | C4-03: выбор auto развёл узлы; reload без правок вернул manual и старое перекрытие. Reset — отдельный обход. |

## Граница и дальнейший план

Новый C4 проход выявил открытые C4-01–C4-07. Предыдущий «нет открытых P1/P2» относился к узкому набору
операций и больше не является актуальной оценкой продуктовой готовности. WP-16 снова active.
[План исправления](../c4-service-audit-2026-10-05/PLAN.md) начинает с placement/auto, C1 bootstrap и навигации,
далее technology logos и layers. Старые PASS сохранены как точные owner checks, а не полная C4 приёмка.

Без commit/push/publish. WP-13–WP-15 сохраняют отдельные delivery статусы. D18/D21/D22 остаются внешними
непроведёнными gates; они не заменяют исправление конкретных desktop product gaps. Mobile/a11y scope не расширен.

Предыдущие startup JSON и desktop.png в evidence/desktop относятся к index-BJDzM4Uo.js и являются историческими.
Только файлы с current в имени и manifest-current.json относятся к текущей сборке. Большой JS chunk и lab long task
сохранены как ограничения; один быстрый запуск маленького starter не доказывает скорость больших диаграмм.
