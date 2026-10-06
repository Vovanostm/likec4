# План удобного создания C4 диаграмм

Основание: [реальный GUI проход](REPORT.md). Цель — пользователь без DSL собирает C1/C2/C3 сервиса,
видит внешних участников и нужный уровень, выбирает узнаваемые технологии, не борется с перекрытиями,
сохраняет результат и может отменить каждое изменение. Это план, а не заявление о реализованных функциях.

Главный приоритет — закрыть C4 authoring, placement и navigation. Перенос compiler в Worker, большой performance
рефакторинг или CI не исправят этот пользовательский путь и не являются первыми решениями этих findings.

## Порядок реализации

Каждая волна — отдельный bounded packet с regression до изменения, затем owner tests, app gates и Chrome на новом asset.
Начинать с одного ready packet; новые source/API contracts требуют executable spike и решения владельца, до UI implementation.
Интеграцию и managed state меняет один owner. Без новых workers, commit/push/publish и изменений mobile/a11y scope.

| Волна                          | Что, где и как                                                                                                                                                                                                                                                                                                                                                       | Почему и acceptance                                                                                                                                                                                                                             |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1 Размещение и авторасстановка | App ViewToolbar/runtime: явное «Расставить автоматически» через существующий layout.reset; существующий snapshot/history pipeline. Workspace/manual-layout placement owner: collision-free position около точки вставки, по реальным node bounds; parent/child containment исключён из collision check. Renderer constraint owner используется для геометрии         | C4-02/03. 10 sibling create-at подряд не перекрываются. Обычный drag/reset, Undo/Redo, reload и ZIP сохраняют результат. Авторасстановка не меняет DSL и не забывает locked anchors, когда lock появится                                        |
| 2 Контекст и C4 начало         | empty bootstrap/CanvasCreateMenu/semantic runtime: «Создать C4 модель», C1 root context, System/Actor/Container/Component из корректной specification. createView source edit owner расширяется для root view; отдельный typed compile spike. До создания ясно показывать «снаружи системы» или parent scope                                                         | C4-01/05/08. Новый сервис + покупатель + внешняя платёжная система видны на C1; покупатель не вложен. Дальше создаются API/БД внутри сервиса. Один wizard commit — один Undo; ID collision/stale/rejected candidate не меняет source            |
| 3 Уровни и переходы            | ViewToolbar/selection actions: «Добавить уровень» от selected system/container, согласованный C2/C3 child view; отдельная кнопка «Углубиться», breadcrumbs/назад. Reuse compiler viewOf и renderer navigation, не дублировать semantic model для каждого уровня                                                                                                      | C4-07. C1→C2→C3→назад работает с mouse controls. Переименование остаётся явно доступным. Parent view не показывает внутренности следующего уровня; внешний сосед/связь включается явными view rules                                             |
| 4 Технологии и оформление      | ElementInspector: searchable catalogue с logo preview и своим текстом; typed technology + icon patch в одном EditorWorkspace command. Existing DocumentEditService получает узкий source-preserving icon/style contract, browser renderer — существующий icon provider. Generated packages/icons не редактировать                                                    | C4-04/05. PostgreSQL/React/Node.js/RabbitMQ показывают соответствующий значок и подпись. Свой текст не ломает diagram. Clear/Undo/Redo/reload/ZIP сохраняют согласованные поля, comments и untouched properties                                 |
| 5 Структура и слои             | StructureTree: collapse, reveal selected, поиск, текущий уровень, hide/lock. Semantic nesting меняется через element.move. Visible/locked/selected state derives from workspace/view + renderer actor; layout order остаётся в renderer contract, без app-owned graph. Для portable hide/lock/order сначала определить owner/schema, не добавлять silent persistence | C4-06. Родителя можно выбрать при плотном canvas; locked узел не сдвигается; скрытие не удаляет сущность; children/edges сохраняют корректность. Back/forward/view switch не теряют transient или persisted state вопреки объявленному contract |
| 6 Повседневные действия        | Context menu/selection toolbar: выравнивание/распределение, дублирование, copy/paste выбранных элементов со связями, поиск/показать элемент, экспорт картинки. Использовать typed commands и standard layout owner; не копировать runtime graph                                                                                                                      | Предложения по удобству, отдельные scope/acceptance. Duplicate атомарен, новые FQN уникальны, внешние relation refs не копируются случайно. Распределение respects parent constraints. Image export соответствует текущему виду                 |

Не определять visual overlap между compound и его собственными детьми как дефект. Не исправлять auto/placement
массовым сбросом всех snapshots и не менять semantics ради свободного места. Shape/icon — visual данные,
technology не должна неявно превращать component в database kind в чужой импортированной specification.

## Сценарий приёмки

1. Новый C4 сервис заказов: покупатель и платёжная система снаружи, один сервис в центре; C1 показывает обе связи.
2. «Углубиться»: C2 с Web UI React, API Node.js, PostgreSQL и очередью; пользователь выбирает logos из каталога.
3. «Добавить уровень» у API: C3 с контроллером, доменным сервисом и репозиторием. Все 3 views используют одну модель.
4. Несколько добавлений в одну область, длинные названия и новые технологии не перекрывают sibling карточки/названия;
   авторасстановка даёт понятный результат, полностью видимый после fit.
5. Пользователь сворачивает tree, блокирует/скрывает узел, выбирает parent, выравнивает разрешённые элементы.
6. Каждый semantic/layout commit отменяется и повторяется одним Undo/Redo; rejected/stale actions сохраняют valid state.
7. Reload и настоящий ZIP export/import восстанавливают те же semantics, icons, views и standard geometry.
8. Человек проходит путь без DSL и технических ID; compiler/network failures отображаются в месте действия,
   дают retry/recovery и не показывают успех до подтверждённой записи.

До выполнения этого процесса «готов» означает только прошедшую конкретную волну. Совокупные зелёные owner tests
не заменяют полную C4 user acceptance. Product code этим планом не изменён.
