# WP-16 — Надёжность полного пользовательского пути

## Admitted implementation packet — desktop C4 completion

Status: locally accepted; implementation authorized by the user on 2026-10-05. This packet supersedes the older sequential-only restriction. Integration owner delegates disjoint planner, technology UI, layers, placement and level-navigation slices; shared contracts, App wiring, manifests, changesets and managed status remain integration-owned.

Acceptance: AC-01–AC-10 plus C4 requirements in SPEC: UI-only C1/C2/C3 authoring, editable technology logos, collapsible/hidden/locked layers, collision-free sibling creation, durable automatic layout, consistent history, reload and ZIP round trips. Checks are recorded in tasks/c4-completion/READINESS.md.

Write scope: existing app source/tests, DocumentEditService and tests, existing diagram layout/API owners and tests, desktop e2e, task evidence/docs. Non-goals: mobile, accessibility certification, deployment/publication, backend, collaboration, new geometry format or second semantic graph.

Contracts: optional viewOf means a root context view; icon is a source-preserving element property. Layer visibility/locking are transient presentation controls using native renderer state, not semantic or portable geometry. Auto arrangement removes the standard manual snapshot through existing history. Execute focused contract tests before integration. Escalate architectural ambiguity with an executable probe; continue unaffected work. Stop only when applicable readiness checks pass on the integrated build.

Additive UI preference contract: ZIP v1 accepts optional `activeViewId` metadata, validated and reconciled against compiled
views; old archives remain supported. No schema-version migration or semantic preference-only write is introduced.
Tab-local selection uses sessionStorage. Async automatic-layout cache is keyed by workspace owner, revision and source
identity. Locks guard both subtree edits and incident relationship side effects. These contracts supersede historical
claims below about unchanged metadata and the earlier sequential-only restriction.

Авторизация: пользователь 2026-10-04 поручил повторять исправление, доработку и критическую проверку до удовлетворительного результата. Основание: `ux-audit-2026-10-04/REPORT.md`, findings F01–F18.
Outcome: поддержанный путь создания, редактирования, размещения, сохранения и обмена архитектурой не теряет данные и согласован между source, canvas и inspector.
Acceptance: AC-01–AC-10 из SPEC.md. Авторизация продолжает существующие WP-13–WP-15, их изменения сохраняются; они не объявляются завершёнными этим пакетом.

## Область и порядок

- Integration owner: текущий агент; sequential implementation без новых workers.
- Write scope: `apps/gui-to-code/src/**`, app tests/docs, `e2e/tests/gui-to-code/**`, текущий packet и audit evidence; существующие manual-layout/editor/a11y/localization owners в `packages/core/src/manual-layout`, `packages/diagram/src/**` и связанные tests/style tokens только при доказанной необходимости.
- Shared contracts, changesets и managed state изменяет только integration owner. Public package changes получают patch changeset.
- F01 executable probe показал дополнительную потерю описания в существующем `packages/language-services/src/common/DocumentEditService.ts`: sparse patch переписывает все свойства, а object description отбрасывается. Scope включает этот existing source-edit owner и его tests; public signature остаётся прежней. Нужен source-preserving selective patch, patch changeset и Node/browser reparse proof, без нового API.
- Сначала F01: чтение и проверка MarkdownOrString, sparse properties patch и реальный compiler round trip. Далее F02/F03: executable manual-layout reproduction до изменения drift/autoapply. Затем selection/history, onboarding/view provenance, layout/mobile и a11y/Russian UX по шести пакетам audit plan.
- Каждый цикл фиксирует минимальное воспроизведение, исправление, focused tests, новую сборку и критический browser recheck. Старые результаты не переиспользуются как acceptance новой сборки.

## Контракты и non-goals

EditorWorkspace остаётся единственным semantic/history owner. Изменение проходит compile-before-commit и expectedRevision; источники и комментарии сохраняются. Renderer owns geometry, standard `.likec4/<view>.likec4.snap` остаётся единственным portable layout format. Нет нового persisted graph, dependency, grammar или storage/ZIP migration.

Sparse patch оставляет неизменённые свойства в исходнике; null означает явную очистку. MarkdownOrString читается существующим core helper, semantic verification сравнивает значение текста. Layout changes сохраняют согласованную семантику текущей ревизии и совместимую геометрию; ошибочное обновление возвращает видимую ошибку.

Не включать публикацию, merge или утверждение release readiness. Не строить редактор specification/config или новые DSL features. Неподдержанные controls должны объяснять ограничение либо скрываться.

## Проверки и остановка

Focused regressions → app generate/typecheck/full tests/build → source quality and instruction checks → Chrome DevTools MCP на новом asset. Relevant public-package tests выполняются при изменении их владельцев; core declarations перестраиваются до downstream typecheck.

Browser acceptance: проверенные F01–F18, create/edit/connect/delete/Undo/Redo, manual geometry и reload/ZIP, invalid DSL, CAS conflict, narrow viewport, keyboard/IME, accessible names/roles/contrast. Screen reader/real mobile/CI остаются отдельным evidence; не выдавать автоматизированные проверки за human acceptance.

Stop success: в проверенном supported flow нет открытых P1/P2, все доступные обязательные checks passed, остаточные ограничения и artifact identity записаны. При новом finding цикл повторяется.
Escalate: необходим новый semantic owner/portable schema/dependency/grammar либо неоднозначная policy autoapplying layout, не покрытая существующим контрактом. Сначала executable probe и bounded contract decision; не маскировать проблему сбросом данных.

## Локальное завершение — 2026-10-05

Status: done в пределах авторизованного локального цикла. F01–F18 и дополнительные browser findings исправлены; открытых подтверждённых P1/P2 в проверенном supported flow нет. Полный финальный browser suite: 51/51. App suite: 355/355; последующие изменения только visible messages и CSS footer, browser suite повторён после них. Public owner tests, build/typecheck/source quality и closeout evidence: [CORRECTIONS.md](ux-audit-2026-10-04/CORRECTIONS.md).

Финальные JS/CSS SHA-256 сверены в Chrome, preview оставлен открытым. Managed transition revision 32 изменяет только WP-16; WP-13–WP-15 остаются active. CI/release/реальный mobile/screen reader/performance/человеческий onboarding — NOT_RUN. Нет commit/push/publish; dirty worktree сохранён.

## Расширение проверки — 2026-10-05

Пользователь поручил продолжить и подготовить заполненный standards checklist. [STANDARDS-CHECKLIST.md](ux-audit-2026-10-04/STANDARDS-CHECKLIST.md) фиксирует 83 результата и четыре незакрытых пункта ST01–ST04. Расширенная проверка возвращает WP-16 в active, revision 33; предыдущий done относится к прежней локальной browser matrix. Текущий проход — evidence/docs only, product code не менялся. Дополнительные owner tests: 27 Markdown и 15 workspace/ZIP passed.

Дальнейшие исправления сохраняют прежние owner boundaries. Keyboard/placement используют renderer constraints и standard snapshot; text resize остаётся в app shell CSS. Для Worker/существенного изменения compile bridge сначала нужен typed contract/spike и revision-safety proof; checklist содержит план, не утверждает, что этот механизм реализован. Conformance claim не допускается до фактического закрытия применимых criteria и полных процессов.

## Актуальная область — desktop only, 2026-10-05

Прямая инструкция пользователя: «Сосредоточься только на desktop версии — mobile, доступность и пр — не важно. Это только desktop сервис для создания диаграмм». Эта инструкция заменяет прежние mobile/WCAG gates текущего пакета; root AGENTS.md содержит каноническую policy.

Продолжаем функциональный desktop цикл: создание/редактирование/связи, constraints-aware layout, source preservation, durable snapshot, Undo/Redo, reload, ZIP и desktop performance. ST01 остаётся подтверждённым desktop дефектом. ST02 (text-size accessibility stress), ST03 (обязательная WCAG single-pointer альтернатива) и ST04 (cold mobile budget) исключены из обязательной приёмки. Уже начатые кнопки положения проверяются как desktop convenience; изменение app-owned geometry недопустимо. Новые mobile/text-resize changes не включаем. Исторические результаты сохраняются как evidence прежней матрицы, без утверждения о текущем полном conformity.

Stop success в актуальном scope: нет открытых подтверждённых P1/P2 в поддержанном desktop пути, доступные обязательные owner/app/desktop browser checks passed, checklist отражает scope и реальные ограничения.

## Desktop local closeout — 2026-10-05

Status: done в текущем desktop scope. ST01 и новые findings keyboard/drag flush, pending ZIP race и tree selection
исправлены существующими owners. Constraints-aware DiagramApi и keyboard lifecycle сохраняют standard snapshots;
EditorWorkspace остаётся единственным semantic/history owner. Public @likec4/diagram получает patch changeset.

Финальный frozen candidate: index-CSKAq45U.js. App 355/355, diagram owners 23/23, desktop browser 54/54, types/build
и focused quality checks passed. Chrome DevTools подтвердил actual native arrow и tree/button/Undo/reload, source bytes
не менялись. В проверенном supported flow открытых подтверждённых P1/P2 нет.

[Заполненная desktop matrix](ux-audit-2026-10-04/DESKTOP-CHECKLIST.md) и
[current manifest](ux-audit-2026-10-04/evidence/desktop/manifest-current.json) определяют границу результата.
Managed revision 35 меняет только WP-16. WP-13–WP-15 active; CI/release/human/multi-browser/large-model — NOT_RUN.
Старые mobile/WCAG критерии сохраняются только как историческая матрица, текущую приёмку не блокируют.

## C4 user journey reopen 2026-10-05

Revision 36: active. Пользователь пересмотрел прежнюю оценку готовности и поручил пройти реальный C4 service authoring.
[Отчёт](c4-service-audit-2026-10-05/REPORT.md) воспроизвёл новые P2 placement/persistence дефекты и выявил C4 capability gaps.
[План](c4-service-audit-2026-10-05/PLAN.md) разделяет confirmed failures, missing features и proposed convenience actions.
Product code в этом проходе не менялся. Из прежних результатов нельзя вывести готовность полного C4 editor.
Stop success теперь требует UI-only C1/C2/C3 acceptance, non-overlap, durable auto arrangement, technology/logo и layer actions
в границах отдельно admitted typed packets. Owner/source/schema изменения требуют spike/contract прежде реализации.
WP-13–WP-15 и dirty worktree сохранены; mobile/a11y остаются вне scope.

## C4 desktop closeout — 2026-10-05

Managed revision 37: WP-16 locally done, WP-13–WP-15 unchanged. Frozen candidate `index-CZeOH7MY.js`:
59/59 production desktop browser cases, 422/422 app tests, source owners 42/42, diagram owners 23/23,
app/diagram types, generate/build, focused lint/format, architectural and instruction checks passed.
[Readiness](c4-completion/READINESS.md), [independent review](c4-completion/REVIEW.md) and
[manifest](c4-completion/evidence/manifest.json) supersede the previous C4 gap assessment for this local candidate.
No open reviewed P1/P2 in the supported desktop C4 scope. UI-only proof covers 57 elements across eight C3 views.
External CI/release/human/multi-browser and larger sustained-load evidence remain NOT_RUN; mobile/a11y excluded.
