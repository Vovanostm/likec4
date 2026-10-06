# WP-16: исправления и повторная критическая проверка

Актуальный статус после UI-only C4 authoring 5 октября: **changes_requested**, WP-16 active.
[Новый пользовательский проход](../c4-service-audit-2026-10-05/REPORT.md) воспроизвёл overlap и возврат старого
manual placement после auto→reload; выявил C1/technology/layer/navigation gaps. Прежние разделы ниже — evidence
отдельных операций, а не подтверждение полной готовности C4 редактора.

Расширенная проверка 5 октября выявила новые незакрытые пункты вне прежней browser matrix. Актуальная desktop оценка: [DESKTOP-CHECKLIST.md](DESKTOP-CHECKLIST.md); [STANDARDS-CHECKLIST.md](STANDARDS-CHECKLIST.md) — историческая матрица. Результаты ниже сохраняют scope первого цикла; они не являются полным conformance claim.

Дата: 5 октября 2026. Исходный аудит: [REPORT.md](REPORT.md). Авторизация: [WP-16](../WP-16-critical-ux-loop.md).

Локальный результат: исправлены F01–F18 и дополнительные дефекты, обнаруженные при повторной проверке. В проверенном поддержанном пути открытых подтверждённых P1/P2 нет. Это результат проверки рабочего дерева, а не CI, релизная или человеческая приёмка. Исторические WP-13–WP-15 остаются active.

## Проверяемый кандидат

- Preview: `http://127.0.0.1:4174/`, production build; Chrome DevTools MCP, отдельный контекст `wp16-loop1-20261004`.
- Checkout HEAD: `7cedbbe182f834a8a589ef6e84535cf76301f4a7`. Рабочее дерево содержит прежние изменения WP-13–WP-15 и текущие WP-16; HEAD не является идентификатором проверенного приложения.
- JS: `index-D5nht3iQ.js`, SHA-256 `6d7ff7dd7ee7241dbc8c9b69df07c804470d94dd2c11a2790a677b07d17a594d`.
- CSS: `index-KGPskMPl.css`, SHA-256 `6598e44facab209009727045c2860f15a998c082fa78fbbc9fff43b854b8244a`.
- Chrome прочитал оба обслуживаемых asset и вычислил те же SHA-256. После сборки вкладка перезагружена; во время итогового browser acceptance сборка не изменялась.
- Контексты Playwright изолированы, acceptance работает против этого же `dist` на порту 62004.

## Решения и доказательства по исходным замечаниям

| Finding  | Что исправлено                                                                                                                                                                                                             | Повторная проверка и граница доказательства                                                                                                                                                                       |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F01 · P1 | Inspector отправляет только изменённые поля. DocumentEditService изменяет только переданные CST-свойства; Markdown читается общим helper. Неизменённые комментарии, delimiter, technology и остальные свойства сохраняются | Реальный compiler round trip, owner tests и browser exact-source title-only/edit/clear/Undo/Redo/reload. `wp16-critical-loop.spec.ts`                                                                             |
| F02 · P1 | Workspace согласует текущую семантику с совместимой геометрией через стандартный manual-layout helper. Новые подписи и связи попадают в snapshot, удалённые сущности исчезают; draft commit сохраняет updated layouts      | Compiler regression, native drag, актуальная длинная подпись/новая связь/удаление без призраков, точная позиция/Undo/Redo/reload. Snapshot export/import/reload: `wp05-views-layout.spec.ts`                      |
| F03 · P2 | Совместимый drift согласуется до показа Compare. Renderer передаёт ошибки reconcile/save через callback; отклонённая запись snapshot бросает ошибку вместо сообщения об успехе                                             | Исходный label-added сценарий теперь проходит без ошибочного Compare. Rejected save проверен на host boundary. Искусственный отказ непосредственно Compare actor в браузере НЕ выполнен                           |
| F04 · P2 | Dirty guard восстанавливает native node/edge selection; inspector сохраняет исходную сущность до решения пользователя                                                                                                      | Browser Stay/Escape/Discard/Save-and-continue, native selection и focus. `editor-drafts.spec.ts`                                                                                                                  |
| F05 · P2 | Dirty inspector меняет глобальный статус на несохранённый, скрывает старый успех и предупреждает при уходе; скрытие панели сохраняет ввод                                                                                  | Browser retained fields/caret, rejected save и dirty navigation; hook tests для beforeunload                                                                                                                      |
| F06 · P2 | Enter маршрутизируется приложением до обработчика renderer, открывает свойства; русское описание клавиатурного действия                                                                                                    | Browser node/edge Enter, F2, Delete, Escape и отсутствие перехвата ввода/IME. `ux-keyboard.spec.ts`, WP04/WP10/WP11                                                                                               |
| F07 · P2 | Выбор предпочитает authored views; synthetic index не предлагается, authored index сохраняется                                                                                                                             | Первый элемент/вид, Undo/Redo/reload, authored-index regressions. `empty-workspace.spec.ts`, WP16                                                                                                                 |
| F08 · P2 | Изменение ревизии сбрасывает transient edge selection и stale actions; проверки expectedRevision сохранены                                                                                                                 | Logical/dynamic/deployment title/remove, Undo/Redo, повторный выбор и stale action rejection. WP11/WP12                                                                                                           |
| F09 · P2 | «Новый пустой проект» использует существующее подтверждение замены и сброс истории; стартовая specification содержит логические и deployment kinds                                                                         | Новый проект без ввода DSL → первый компонент/вид/название → reload. WP16                                                                                                                                         |
| F10 · P2 | Одна app toolbar, renderer controls отключены, неподдержанные style actions скрыты. Toolbar и selection actions находятся в потоке над холстом                                                                             | Chrome screenshot, контекстное создание/связи, node picking и native drag; WP12 и canvas-context-menu                                                                                                             |
| F11 · P2 | На узком экране компактное меню добавления; целевые кнопки 44 px, нет горизонтального overflow страницы                                                                                                                    | Chrome 390×844 с mobile/touch emulation и browser responsive tests                                                                                                                                                |
| F12 · P2 | Мобильный inspector ограничен половиной рабочей области; «Выбрать на холсте» закрывает его и возвращает focus                                                                                                              | Chrome mobile inspector, retained draft и panel replacement browser tests                                                                                                                                         |
| F13 · P2 | Dynamic/deployment IDs генерируются; русские default titles, формы соответствуют семье вида. Отсутствие deployment kinds объясняется с доступным следующим действием                                                       | Chrome actual forms: пустые виды, автоматические IDs, первый dynamic step и восстановление после reload; browser deployment edge CRUD. Node/instance create compiler tests; ручной путь проверен исходным аудитом |
| F14 · P2 | Русские accessible names, корректные роли/expanded, shortcuts в aria-keyshortcuts; visible label входит в имя                                                                                                              | Browser keyboard/focus/role checks; Lighthouse accessibility 100 desktop/mobile                                                                                                                                   |
| F15 · P2 | Default blue fill/stroke исправлены; attribution получает контрастный фон/текст внутри ShadowRoot, error text не наследует muted цвет                                                                                      | Заголовок 6.16:1, metadata 4.72:1; Lighthouse contrast checks на проверенных состояниях. Все пользовательские палитры не сертифицированы                                                                          |
| F16 · P2 | Renderer использует русскую локаль, ошибки объясняются по-русски с техническими подробностями; переведены сообщения развёртывания                                                                                          | Chrome AX и видимые строки, language/renderer tests; исходные DSL identifiers и названия технологий сохранены                                                                                                     |
| F17 · P3 | Подтверждение удаления показывает названия сущностей и зависимостей, технические адреса раскрываются отдельно                                                                                                              | Browser deletion/dependencies, modal focus/Tab/Escape; WP04, UX keyboard                                                                                                                                          |
| F18 · P2 | Одна tree с group, правильными level/expanded и стандартными стрелками/Home/End                                                                                                                                            | Chrome AX: shop.api level 2, right → child, left → parent, Home → first; tree tests. Чтение реальным screen reader НЕ выполнено                                                                                   |

## Повторные циклы и дополнительные находки

Каждая существенная группа изменений проходила focused regression, новую сборку и повторную проверку. Тесты выявляли реальные несоответствия, которые исправлялись до следующего кандидата:

1. Source preservation: sparse UI patch недостаточен без selective CST owner. Исправлен DocumentEditService; точная сохранность исходника подтверждена настоящим compiler и браузером.
2. Manual layout: обнаружен stale layout в source draft commit. Commit теперь сохраняет reconciled snapshots; labelBBox перемещается вместе с узлом. Нативное перемещение, source changes и перенос snapshot прошли повторно.
3. Draft/focus: native dialog не был исключён из capture shortcuts, из-за чего Escape перехватывался раньше modal. Добавлено исключение; Stay возвращает focus в исходное поле. Quick menu Tab учитывает summary/скрытые controls и возвращается на canvas, если следующая цель недоступна.
4. Компоновка: toolbar перекрывала file menu; topbar получила соответствующий stacking order. Скрытие disabled «Создать вид» с пояснением на mobile ухудшало discoverability, поэтому было отменено. Причина недоступности остаётся видимой.
5. Русский интерфейс: после успешного создания deployment view обнаружено английское сообщение. Переведены сообщения семьи развёртывания. Подсказка «первый шаг» заменена на «шаг», поскольку форма используется и для последующих шагов.
6. **Дополнительный P2 — обрезанные кнопки масштаба.** Финальный screenshot выявил, что `max-height: 35%` сжимал footer до 25 px при кнопках 44 px. Native hit test и две browser regressions воспроизвели дефект на 1440 и 390 px. Ограничение заменено на `min(16rem, 35dvh)`; верх, центр и низ каждой кнопки теперь доступны для клика. Полный browser suite повторён после этой правки.

Ни одна из этих правок не вводит второй semantic owner, отдельный persisted XYFlow graph или portable schema migration. EditorWorkspace сохраняет compile-before-commit и единую историю; geometry остаётся стандартным manual-layout snapshot. Public package изменения сопровождаются patch changesets.

## Проверки

| Проверка                                  | Фактический результат                                                                                                                                                                                                                                       |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Полный app Vitest                         | 355/355, 35 files, один worker; [лог](evidence/accepted/unit-355.log). После него изменились только видимые сообщения и CSS footer, не semantic logic                                                                                                       |
| Полный браузерный набор, финальный JS/CSS | 51/51, включая обе footer regressions; [лог](evidence/accepted/e2e-51-final.log)                                                                                                                                                                            |
| Предыдущий полный browser candidate       | 49/49; [лог](evidence/accepted/e2e-49-before-wording.log). Это история итерации, не acceptance финального CSS                                                                                                                                               |
| Повтор WP11/WP16 после перевода           | 5/5; [лог](evidence/accepted/e2e-wording-5.log)                                                                                                                                                                                                             |
| Footer regression до исправления          | 2/2 воспроизведения FAIL; [лог](evidence/accepted/footer-reproduction.log)                                                                                                                                                                                  |
| Language-services owner                   | 14/14; [лог](evidence/accepted/language-services-14.log)                                                                                                                                                                                                    |
| Diagram owners                            | 19/19; [лог](evidence/accepted/diagram-19.log)                                                                                                                                                                                                              |
| Generation/build/typecheck                | Root generation 7 tasks, app generation/production build, app source-mode tsc, diagram tsc и language-services composite build passed                                                                                                                       |
| Source quality                            | Focused owner oxlint и AST scan passed; Formatting 111 файлов, instruction validator и diff check passed; [форматирование](evidence/accepted/format-owners.log), [инструкции](evidence/accepted/instructions.log), [diff](evidence/accepted/diff-check.log) |
| Lighthouse final candidate                | Accessibility 100, Best Practices 100 на desktop/mobile. SEO 80, Agentic 50: robots.txt и llms.txt; приватный локальный редактор, performance в этом аудите исключён                                                                                        |
| Chrome runtime                            | Нет error console или failed asset requests после reload финальной сборки; compiler startup warning «No likec4 documents found» до загрузки sources сохранён как warning                                                                                    |

Один compiler integration describe получил timeout 15 s вместо 5 s: он выполняет несколько полных parser/Graphviz/revision циклов; assertions не менялись. Итоговые 355 tests прошли при одном worker. Сбои перегруженных параллельных прогонов не выдаются за итоговую приёмку. После завершения обязательных проверок они не повторялись без нового изменения.

Для native upload Chrome MCP не разрешил путь файла. Использован настоящий input handler с File/DataTransfer; системный file picker не проверен. Playwright использует штатный file input. Снимки интерфейса: [desktop](evidence/accepted/desktop.png), [mobile](evidence/accepted/mobile.png); AX и runtime evidence находятся рядом.

## Остаточные границы и следующий уровень приёмки

- CI, опубликованная сборка, release и human acceptance — NOT_RUN. Commit/push/merge не выполнялись.
- Реальные iOS/Android, VoiceOver/NVDA, человеческий 60-second onboarding и 200% browser zoom — NOT_RUN. Automated keyboard/IME events не равны проверке реальной IME раскладки.
- Sustained FPS, большие модели, холодная загрузка на медленной сети и performance budgets — NOT_RUN. Build предупреждает о крупном JS chunk; после текущей функциональной приёмки нужен отдельный измеренный performance packet, без произвольного code splitting в этом исправлении.
- Искусственный отказ непосредственно renderer Compare actor — NOT_RUN; save rejection boundary и исправленный исходный drift path проверены отдельно.
- Расширенная проверка форматирования также выявила 7 прежних файлов вне изменений WP-16 (старые research/spec и persistence); их форматирование не менялось. Перечень исключений сохранён в format-owners.log.
- Полный root lint не зелёный: расширенный scan обнаружил три прежних import-type side-effect нарушения в untouched sequence files; их наличие в HEAD проверено. Focused WP-16 owners прошли. Это не утверждение о чистоте всего репозитория.
- App package private; всё LikeC4 DSL, collaborative/cloud sync и source-preserving canonical regeneration не входят в поддержанный продуктовый контракт.

Для дальнейшей внешней приёмки: QA проходит реальный mobile/скринридер/200% zoom и timed onboarding; performance owner измеряет cold-load/interaction на больших моделях и задаёт бюджет; integration owner запускает CI на опубликованном неизменном кандидате. Новое подтверждённое P1/P2 возвращает пакет в цикл воспроизведение → исправление → regression → browser recheck.

## Актуальный desktop цикл — 2026-10-05

По прямой инструкции пользователя mobile/WCAG/AT больше не являются delivery gates; policy находится в root AGENTS.md.
Предыдущие разделы и evidence сохраняют исторический scope. Текущая приёмка и дальнейшие проверки:
[DESKTOP-CHECKLIST.md](DESKTOP-CHECKLIST.md), [JSON](DESKTOP-CHECKLIST.json).

ST01 исправлен: native arrows проходят renderer constraints и snapshot/history lifecycle. Step 5, Shift 20;
held repeat — одна transaction. Keyup, element blur и window blur завершают запись. Pointer stop flushes последнюю
позицию перед hasChanges. Parent + selected child не перемещаются дважды; sibling world position сохраняется.

Повторный критический цикл выявил stale ZIP при deferred renderer sync: editor moving/pending tags и немедленное
планирование sync закрывают gap. App наблюдает pending; status, export, history, view/replacement и semantic mutation
ждут записи. Renderer callback обходит только pending guard, сохраняя read-only/busy/revision validation.
Следующий дефект: дерево меняло app selection, но оставляло прежний native selected node. Теперь approved tree selection
обновляет derived canvas selection; regression подтверждает правильный button target и Undo.

Кандидат: index-CSKAq45U.js, SHA-256 fcb8c8c0f74e7973883d65545fa087fae1d4ba31d11f8d597d91a799432be80f.
CSS index-2XorT5yy.css, SHA-256 27678784528643bbe871625228a7cc1cc7b00d7f7fa509665c3b4af73bc7453d.
Chrome fetched bytes совпадают с dist. Во время финального desktop browser suite сборка не менялась.
Логи и source/asset hashes: [manifest-current.json](evidence/desktop/manifest-current.json).
App 355/355; diagram owners 23/23; production desktop browser 54/54; types/build и focused quality checks passed.
Source unchanged, ArrowRight 50→55 и reload, tree target +20 и Undo подтверждены Chrome DevTools.

Свежий isolated Chrome context, desktop 1440×1000 DPR1, CPU1, loopback, starter 3 nodes: first diagram 449.4 ms,
LCP 484 ms, FCP 212 ms, CLS 0, max long task 156 ms. Это один lab sample, не field CWV/INP или large-model budget.
Большой main chunk 4.70 MB decoded/1.66 MB transferred остаётся измеренным ограничением; corpus и sustained load — NOT_RUN.
Предыдущие evidence/desktop startup JSON и desktop.png относятся к промежуточному index-BJDzM4Uo.js.

Открытых подтверждённых P1/P2 в проверенном desktop flow нет. 16 checklist PASS, 3 PARTIAL, 3 NOT_RUN.
Полный root lint и repo-wide formatting не объявляются clean по focused checks. Unit runner сохранил
MaxListenersExceededWarning; tests прошли с обычными timeout и одним worker. CI/release/human/other browsers — NOT_RUN.
Mobile/a11y не расширяют эту поставку. Нет commit/push/publish; WP-13–WP-15 и preexisting dirty worktree сохранены.
