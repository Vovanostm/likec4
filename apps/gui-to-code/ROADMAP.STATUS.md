# Состояние исполнения roadmap

Дата актуализации: 4 августа 2026  
Текущая ветка: `feat/gui-to-code-wp08-mvp-release-gate`  
WP-08 PR: #10 — open; merge запрещён без отдельной команды пользователя.

Этот файл — изменяемое состояние исполнения. Стабильные outcomes и acceptance criteria находятся в `ROADMAP.md`.

## Managed state

```yaml
# managed-state:v2
revision: 12
contract_review: complete
active: []
done:
  - WP-00
  - WP-01
  - WP-02
  - WP-03
  - WP-04
  - WP-05
  - WP-06
  - WP-07
  - WP-08
ready: []
planned: []
blocked: []
```

## WP-08 — MVP release gate complete

### Результат

- Русская терминология оболочки и состояний долговременного хранения приведена к единому виду.
- Критические элементы управления имеют доступные имена; создание статического вида проверяет открытие с клавиатуры, начальный focus, Escape и возврат focus.
- Release smoke покрывает размеры `390×844`, `1440×900` и `1920×1080`.
- Production `dist` сохраняется как exact-SHA artifact с retention семь дней, запускается через preview и проходит Playwright acceptance.
- README содержит supported-feature matrix, recovery/rollback, persisted schema, lossy behaviour и ограничения MVP.

`EditorWorkspace` остаётся единственным владельцем committed semantic state. LikeC4 DSL и стандартные manual-layout snapshots остаются persisted canonical data. Persistence schema, public package API, DSL grammar и package boundaries не изменены. Новая dependency и changeset не требуются.

Первый полный release cycle на implementation head `ff3cf7907a485e4805ebdbf976adc113fe826280`:

- `GUI-to-code` run `30931657058` — success;
- `CI (PR & push)` run `30931658768` — success;
- `push` run `30931657379` — success.

Заключительный exact head и terminal workflow run IDs фиксируются в PR #10, поскольку commit не может содержать собственный SHA.

Выполнены два отдельных review-прохода: correctness/reliability и product/accessibility/release. Residual limitations перечислены в README и PR body.
