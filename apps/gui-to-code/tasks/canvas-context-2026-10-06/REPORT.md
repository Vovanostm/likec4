# Контекстные действия без сдвига холста

Запрос 6 октября, завершение проверки 7 октября 2026. Локальный desktop follow-up WP-16 по прямому запросу пользователя.

## Решение

Удалена вся добавляемая при выборе строка действий, включая раскрывающийся блок «Положение» и четыре кнопки
перемещения. ЛКМ выделяет карточку/связь; инспектор связи больше не открывается автоматически. ПКМ выбирает объект
под указателем через прежний dirty-selection guard и открывает меню поверх холста. Shift+F10 вызывает то же меню,
учитывая цель клавиатурного события внутри shadow root. Escape возвращает фокус карточке.

Название, свойства, связь, удаление и снятие выделения используют прежние canvas/workspace handlers. Drag и
Arrow/Shift+Arrow остаются renderer-owned. Меню не меняет источники, историю и layout snapshots. Оно ограничено
живыми границами самой диаграммы через ResizeObserver; при нехватке высоты прокручивается внутри меню, закрывается при outside click, Tab/Escape, zoom/wheel, blur и
смене workspace identity/revision/view/selection. Одновременно видно одно canvas menu.

## Проверки

- Production build PASS; изолированные assets: `index-BiHevCyn.js`, `index-I0XOEEcF.css`.
- Chromium acceptance: **28/28 PASS**, без retries/skips. Отдельные порт 63679 и outputDir исключили коллизии
  артефактов с другими проверками этой рабочей копии.
- Геометрия canvas и inline transforms всех карточек совпадают до/после selection и открытия меню.
- Node/edge menus, точная цель ПКМ, название и exact Undo/Redo, свойства, снятие выделения, Shift+F10,
  keyboard navigation, Tab/Escape, IME guards, invalid draft mutation guards проверены.
- Drag, Arrow/Shift+Arrow, движение compound с дочерними узлами, focus-loss commit, history, reload и ZIP PASS.
- Дополнительный native UI проход в in-app browser: ЛКМ/ПКМ, Shift+F10, выбор другой карточки,
  возврат фокуса; canvas bounds до/после совпали.
- Профильные unit tests финального меню/shortcuts/layout adapter: **65/65 PASS** в четырёх файлах.
- App typecheck промежуточной рабочей копии PASS. Последний typecheck после внешнего слияния FAIL:
  неиспользуемый текущим App `use-professional-canvas.ts` ссылается на отсутствующие методы
  `EditorWorkspace.pasteSubgraph`, `inspectSubgraphRemoval`, `removeSubgraph`.
- Formatter, oxlint, agent instructions (10/10) и diff check PASS для проверенного среза.

## Границы

Рабочая копия содержит большой исходный dirty change set и параллельные изменения настроек элементов,
истории и режима просмотра. Они сохранены; этот follow-up не является приёмкой их новых возможностей.

Полный app run на промежуточной рабочей копии: 453/465 PASS, 12 timeout failures. Повтор с одним worker:
457/465 PASS, 7 timeout failures и 1 assertion failure в semantic-removal (ожидание setBusy(false)).
Во время прогона менялись runtime guard и другие файлы. Эти результаты не объявляются зелёной проверкой
всего текущего приложения. Дополнительный промежуточный focused run: 69/73 PASS, четыре timeout failures в workspace-placement
(по десять повторных компиляций/созданий). Финальные 65 unit tests исключают этот неизменённый stress owner;
реальная геометрия, drag, история, reload и ZIP подтверждены browser acceptance.

Первый browser run на общем outputDir: 24/28 PASS; старый selector удалённой кнопки обновлён,
startup/compound timeout и пропавшая trace при browserContext.close перепроверены в изолированном прогоне:
28/28 PASS. Assertions и timeout budgets не ослаблялись.

CI/release, Safari/Firefox и human acceptance — NOT_RUN. Commit/push/deploy не выполнялись.

## Внешнее слияние во время проверки

Другой процесс изменил HEAD с `7cedbbe18` на `491947f47` и восстановил stash. В App, editor.css,
use-semantic-editor и workspace временно возникли конфликты; они сняты внешним процессом. Проверенное
context-menu решение сохранилось. Эта задача не сбрасывала/не отменяла чужие изменения и не выполняла Git mutations.

Последняя acceptance выполнена на отдельной production-сборке в `/tmp/likec4-context-dist-final`.
Исходники и независимые результаты сохранены в `/tmp/likec4-context-source-snapshot` и в этом каталоге.
Общая интеграционная готовность рабочей копии остаётся PARTIAL из-за перечисленных type/unit gaps.
