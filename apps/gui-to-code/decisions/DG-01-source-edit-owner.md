# DG-01: владелец source-preserving semantic edits

Статус: accepted

## Проверка

`@likec4/language-services/browser` теперь экспортирует типизированную source-edit границу:

- `createDocumentEditService` / `DocumentEditService` для add, patch, move, rename и removal с dependency report;
- `createElementViewDocumentEditService` для element-view edits;
- `createDynamicDeploymentDocumentEditService` для dynamic/deployment add, patch и remove;
- `SourceEditPlan`, `DocumentTextEdit`, `applyDocumentTextEdits`, `sourceRevision` и typed errors.

`apps/gui-to-code/src/editor/language-services-adapter.ts` является app-local integration owner (`languageServicesDocumentPort`):
он создаёт browser language-services из текущих source files, делегирует semantic planning публичным сервисам, применяет
план по URI и base revision и передаёт candidate на последующую компиляцию `EditorWorkspace`. Он не выполняет
canonical DSL regeneration и не поддерживает отдельный mutable semantic graph.

Единственное намеренно app-local source-edit исключение — exact occurrence patch/remove для logical relations в
`src/editor/relation-source-edits.ts`. Оно ограничено title/remove, разрешает lexical scope и occurrence, fail-closed
отклоняет missing occurrence и не переписывает комментарии или соседние relation declarations.

Старый `src/document.ts` остаётся starter/prototype API и не является владельцем semantic CRUD.

## Решение

Gate закрыт. Принимается следующая owner-схема:

1. `@likec4/language-services/browser` владеет AST/CST-aware source-edit planning и source-preservation contract.
2. `languageServicesDocumentPort` владеет только app-local orchestration: преобразованием `EditorDocumentPort` в
   публичные planner calls, применением text edits к candidate sources и переводом ошибок в app contract.
3. `EditorWorkspace` остаётся владельцем candidate compile, commit, revision и history.
4. Logical relation title/remove остаётся узким app-local adapter до появления эквивалентного public planner; этот
   exception не может расширяться до общего regex/brace parser или второго semantic owner.

## Исполняемое доказательство

Команды запускались из корня репозитория `/Users/vovanostm/learn/likec4`:

```text
pnpm --filter @likec4/gui-to-code test -- --run src/editor/relation-source-edits.test.ts src/editor/workspace-wp06.spec.ts src/editor/workspace-wp11.spec.ts
```

Результат: `17` test files passed, `82` tests passed. В текущей конфигурации Vitest эта команда разрешила полный
app suite; в него вошли focused tests relation-source-edits, WP-06 adapter integration и WP-11 adapter integration.

```text
pnpm --filter @likec4/language-services test -- src/common/DocumentEditService.spec.ts src/common/DynamicDeploymentDocumentEditService.spec.ts src/common/DynamicDeploymentDocumentEditService.wp11.spec.ts
```

Результат: `6` test files passed, `46` tests passed. Planner tests подтверждают add, patch, rename, move, dependency-bound
remove, stale-source rejection, exact duplicate dynamic/deployment edits и сохранение соседних комментариев.

```text
pnpm --filter @likec4/gui-to-code typecheck
```

Результат: `tsc --build` завершён успешно; app project up to date.

Основные доказательные файлы:

- `packages/language-services/src/browser/index.ts` — public browser exports;
- `packages/language-services/src/common/DocumentEditService.spec.ts` — element add/rename/remove и comment preservation;
- `packages/language-services/src/common/DynamicDeploymentDocumentEditService.spec.ts` и
  `DynamicDeploymentDocumentEditService.wp11.spec.ts` — dynamic/deployment preservation и duplicate identity;
- `apps/gui-to-code/src/editor/relation-source-edits.test.ts` — exact logical relation occurrence и comment preservation;
- `apps/gui-to-code/src/editor/wp06-workspace.spec.ts` и `workspace-wp11.spec.ts` — app adapter through workspace.

## Объём доказательства

Доказан source-preserving planning path для поддержанных editor operations, включая URI-bound plans, revision-checked
application, typed planner errors, candidate integration и сохранение проверенных соседних source bytes. Доказательство
не означает, что приложение поддерживает полный LikeC4 DSL или что каждый возможный source construct имеет editor flow.

## Ограничения

- Logical relation patch/remove не делегируются language-services planner: app-local code поддерживает только title и
  exact selected occurrence. Relation metadata и структурное переписывание не входят в этот gate.
- Удаление dynamic `StepSeries` segment, когда требуется переписать соседнюю цепочку, остаётся fail-closed.
- Проверки выше — Vitest/typecheck и adapter/workspace integration; они не заменяют production build, browser UI/e2e,
  reload, multi-tab conflict/recovery или formal release proof.
- `LikeC4.toDSL()` и `writeDSL()` остаются намеренно lossy canonical export и не могут использоваться как incremental
  edit path.

## Последствие

`WP-02` и последующие semantic CRUD work packages могут использовать принятую owner-схему в пределах перечисленных
ограничений. Любое расширение app-local relation editor, появление второго mutable semantic owner или изменение
public planner contract требует отдельного review/decision.
