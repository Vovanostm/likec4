# DG-15 — accepted: атомарный первый холст

2026-10-04. Existing executable probe: `workspace-ux.spec.ts`, first root visibility через source-preserving
`createElement` и `createView` planners. Compiler принимает custom kinds, scoped view показывает первый root.
Это достаточный owner contract; новый package API не требуется.

Решение: отдельный app-local `diagram.create` для пустых elements/views; два planner edits формируют isolated
candidate, не два committed commands. `EditorWorkspace` проверяет root/view и commits один history entry.
Не использовать generic batch, UI DSL concatenation, runtime auto-create effect или hidden two-step history.
Regression: `workspace-bootstrap.spec.ts` — visible root, exact Undo/Redo, invalid/failed second edit rollback,
stale revision и непустой проект. Недоказанный candidate запрещает commit.

Исполняемый proof 2026-10-04: 19/19 bootstrap tests passed. Compiler создаёт synthetic `index` даже при пустом
views; он исключается из authored views только при отсутствии source provenance. Явный authored `index` блокирует
bootstrap. ID `view` — ключевое слово и компилируется анонимно: automatic allocator использует `view1`, `view2`, ….

Альтернативы: прежние два явных действия безопасны, но усложняют onboarding; автоматическое исполнение двух
committed commands даёт partial failure и неожиданную историю. ADR DG-FIX-EMPTY-BOOTSTRAP остаётся историческим
описанием WP-14, а не перезаписывается.
