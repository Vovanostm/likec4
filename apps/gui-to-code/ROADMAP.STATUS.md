# Состояние исполнения roadmap

Дата актуализации: 30 июля 2026
Ветка: `feat/gui-to-code-wp00-wp01-prep`
PR: #1 — Complete gui-to-code WP-00 and prepare WP-01 decisions
Проверенный HEAD: `c3e23326c2b517debb52d9462cfe8496e0a78c05`

Этот файл — изменяемая часть плана. Стабильные outcomes, acceptance criteria и границы work packages находятся в `ROADMAP.md`. Следующий агент обязан прочитать оба файла до выбора `WP-*`.

## Managed state

```yaml
# managed-state:v2
revision: 3
contract_review: complete
active: []
done:
  - WP-00
ready:
  - WP-01
planned:
  - WP-02
  - WP-03
  - WP-04
  - WP-05
  - WP-06
  - WP-07
  - WP-08
blocked: []
```

## WP-00 — done

Реализовано:

- весь пользовательский интерфейс и accessibility labels переведены на русский;
- invalid source draft сохраняет diagnostics и последнюю валидную диаграмму;
- form-команды компилируются до commit и отклоняются атомарно;
- stale async compilation results игнорируются sequence guard;
- устранена повторная компиляция уже проверенной form-команды;
- import обрабатывает пустой файл и ошибки чтения, input сбрасывается после попытки;
- export сохраняет точный текущий `model.c4`;
- добавлены focused tests для draft state, rejected command и stale compilation;
- добавлен production-build startup smoke;
- README приведён к фактическому состоянию;
- добавлен отдельный CI workflow `GUI-to-code` с явным ordered bootstrap generated dependencies;
- исправлен Vite resolution: удалён ошибочный app-local override `@likec4/styles`, используется canonical workspace package;
- общий Turborepo task graph исправлен package-specific overrides для `@likec4/generators`: test-only обратная devDependency больше не создаёт циклы `generate`, `sources`, `typecheck` и `build`;
- общий monorepo quality gate и отдельный GUI-to-code workflow проходят на одном HEAD.

Основные пути:

- `src/App.tsx`
- `src/editor-state.ts`
- `src/editor-state.spec.ts`
- `src/user-messages.ts`
- `scripts/smoke-start.mjs`
- `vite.config.ts`
- `README.md`
- `.github/workflows/gui-to-code.yml`
- `turbo.json`

Verification gate:

```bash
pnpm --filter @likec4/style-preset sources
pnpm --filter @likec4/styles sources
pnpm --filter @likec4/styles emit-pkg
pnpm --filter @likec4/language-server generate
pnpm --filter @likec4/layouts generate
pnpm --filter @likec4/gui-to-code generate
pnpm --filter @likec4/gui-to-code typecheck
pnpm --filter @likec4/gui-to-code test
pnpm --filter @likec4/gui-to-code build
pnpm --filter @likec4/gui-to-code smoke:start
pnpm check:agent-instructions
git diff --check
```

Фактические CI-доказательства на проверенном HEAD:

- dedicated `GUI-to-code`: generation, typecheck, tests, build, startup smoke, instructions и diff check — PASS;
- general quality gate: Linux и Windows generation/tests, repository typecheck/type tests, package build/lint/pack smoke, docs, playground, GUI-to-code, E2E types и Playwright E2E — PASS;
- `checks / 🚦 quality gate` — PASS.

## WP-01 — ready, partially prepared

Подготовлено, но не считать production implementation:

- `decisions/DG-01-source-preserving-edits.md`;
- `src/spikes/source-edits.ts` и tests: range edits, preservation, dependency-aware remove proof;
- `decisions/DG-02-canvas-intents.md`;
- `src/spikes/canvas-intents.ts` и tests: directed connect lifecycle, cancellation, duplicate suppression;
- spikes не импортируются production UI.

Оставшийся обязательный scope WP-01:

1. Доказать DG-01 на реальном browser-compatible AST/CST API в owning package `@likec4/language-services`, а не на переданных вручную ranges.
2. Доказать DG-02 в owning package `@likec4/diagram` через narrow optional public callback и package tests.
3. Провести public API review обоих контрактов.
4. Добавить patch changeset, если меняются публичные exports.
5. Обновить `SPEC.md` только после подтверждения фактических контрактов.
6. Не начинать `EditorWorkspace`, production canvas CRUD или drag-to-connect до полного закрытия WP-01.

## Известные решения и ограничения

- `src/document.ts` остаётся append-only prototype и не должен расширяться regex/brace parsing для rename/remove.
- Source-preserving edits должны исходить из typed language-service ranges.
- `@likec4/diagram` не должен импортировать app contracts или эмитить `EditorCommand`.
- Canvas semantic intents нельзя добавлять в `ViewChange`; layout и semantic editing остаются разными контрактами.
- App-local `styled-system` не является заменой canonical `@likec4/styles` package для bundling.
- Package-specific Turbo overrides для `@likec4/generators` должны сохраняться, пока обратная dependency на language-services остаётся test-only; не возвращать для этого пакета `^generate`, `^sources`, `^typecheck` или `^build` без устранения package graph cycle.
- Один task выполняет ровно один `WP-*`; следующий допустимый пакет — WP-01.

## Handoff следующему агенту

Начать с:

1. Проверить, что PR #1, общий quality gate и `GUI-to-code` workflow зелёные на текущем head.
2. Прочитать `AGENTS.md`, `README.md`, `SPEC.md`, `ROADMAP.md`, этот файл и обе DG ADR.
3. Взять только WP-01.
4. Сначала исследовать фактические Langium/diagram owning APIs; не переносить app spikes напрямую в public API.
5. После выполнения обновить этот managed state: WP-01 → `done`, WP-02 → `ready`.
