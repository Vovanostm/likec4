# Состояние исполнения roadmap

Дата актуализации: 5 августа 2026  
Текущая ветка: `feat/gui-to-code-wp09-direct-canvas-authoring`  
WP-08 PR: #10 — merged.  
WP-08 merge commit: `4e41b09b4a750b20ba3343796599b8a05bd2f8d9`
WP-09 baseline: `66c7ce7b4ff3aca00637754534d53b89ed5e630f`

Этот файл — изменяемое состояние исполнения. Стабильные outcomes и acceptance criteria находятся в `ROADMAP.md`.

## Managed state

```yaml
# managed-state:v2
revision: 14
contract_review: complete
active:
  - WP-09
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

## WP-09 — Direct Canvas Authoring active

### Цель

Сделать canvas основным местом создания и редактирования LikeC4-модели без введения второго semantic owner:

- выбор и редактирование relation непосредственно на diagram edge;
- direct drag existing → existing;
- atomic drag existing → empty с созданием element + relation + standard manual layout;
- double-click create и inline title edit;
- contextual delete и keyboard parity;
- collapsible tree, inspector и DSL при canvas-dominant shell;
- dynamic/deployment parity через discriminated view context.

### Baseline и discovery

- `main`: `66c7ce7b4ff3aca00637754534d53b89ed5e630f`;
- WP-08 и post-merge cleanup подтверждены;
- discovery: `decisions/WP-09-DIRECT-CANVAS-AUTHORING-DISCOVERY.md`;
- существующие `ReactLikeC4` integration callbacks уже покрывают node click, connection и canvas click;
- доказанные gaps: edge selection, flow-coordinate contract, empty-drop lifecycle, relation patch/remove, dedicated create-connected transaction и canvas-dominant shell.

### Architecture contract

`EditorWorkspace` остаётся единственным владельцем source, revision, compilation, history и manual-layout snapshots. Diagram package сообщает typed intents и positions, но не создаёт IDs, DSL или semantic commands. Compound create реализуется dedicated domain command, а не generic command batch. Любой semantic/layout result коммитится только после isolated candidate compile и exact verification.

### Текущий этап

Wave 0 завершён: baseline и initial discovery зафиксированы. Следующий этап — Wave 1: edge selection, relation inspector, source-preserving relation patch/remove и one-entry Undo/Redo.

## WP-08 — MVP release gate complete

### Результат

- Русская терминология оболочки и состояний долговременного хранения приведена к единому виду.
- Критические элементы управления имеют доступные имена; создание статического вида проверяет открытие с клавиатуры, начальный focus, Escape и возврат focus.
- Release smoke покрывает размеры `390×844`, `1440×900` и `1920×1080`.
- Production `dist` сохраняется как exact-SHA artifact с retention семь дней, запускается через preview и проходит Playwright acceptance.
- README содержит supported-feature matrix, recovery/rollback, persisted schema, lossy behaviour и ограничения MVP.

`EditorWorkspace` остаётся единственным владельцем committed semantic state. LikeC4 DSL и стандартные manual-layout snapshots остаются persisted canonical data. Persistence schema, public package API, DSL grammar и package boundaries не изменены. Новая dependency и changeset не требуются.

Заключительный exact head PR #10: `7688f315f5253bed25c8db1d2c773472d4dd6546`.

Exact-head GitHub CI:

- `GUI-to-code` run `30933010189` — success;
- `CI (PR & push)` run `30933010265` — success;
- `push` run `30933010284` — success.

PR #10 merged через squash в `main` коммитом `4e41b09b4a750b20ba3343796599b8a05bd2f8d9`.

Выполнены два отдельных review-прохода: correctness/reliability и product/accessibility/release. Unresolved review threads: `0`. Residual limitations перечислены в README и PR body.
