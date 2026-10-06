# DG-FIX-EMPTY-BOOTSTRAP — accepted

2026-10-03. Проверка: `src/editor/workspace-ux.spec.ts`.
Specification + пустые model/views принимаются compiler. Existing `element.create` создаёт root,
existing `view.create` с `viewOf` этого root и `include *` действительно показывает его в nodes.
Новые public API, генерация DSL в React и generic command batch не нужны.

Решение: два явных шага «Добавить первый элемент» → «Создать вид»; название меняется обычным inspector patch.
Каждый шаг имеет собственную history entry. Нет kinds — предложить import/code вместо выдуманного типа.
