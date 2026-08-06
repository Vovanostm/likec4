# Состояние исполнения roadmap

Дата актуализации: 6 августа 2026  
Текущая ветка: `feat/gui-to-code-wp09-direct-canvas-authoring`  
WP-08 merge commit: `4e41b09b4a750b20ba3343796599b8a05bd2f8d9`  
WP-09 baseline: `66c7ce7b4ff3aca00637754534d53b89ed5e630f`

Этот файл — изменяемое состояние исполнения. Стабильные outcomes и acceptance criteria находятся в `ROADMAP.md`.

## Managed state

```yaml
# managed-state:v2
revision: 16
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
  - WP-09
ready:
  - WP-10
planned: []
blocked: []
```

## WP-09 — Direct connection foundation complete

### Delivered outcome

- pointer drag existing → existing больше не требует отдельного connection mode;
- static views проходят через существующий typed `relation.create` intent/operation pipeline;
- dynamic views маршрутизируются в `dynamicStep.create`;
- deployment views маршрутизируются в `deploymentRelation.create`;
- semantic family определяется active compiled view, а не visual shape;
- connection gesture фиксирует exact view ID и workspace revision;
- completion fail-closed отклоняется при смене view/revision;
- direct authoring отключается при invalid compilation, busy state и active element-create tool;
- diagram `ReadOnly` синхронизирован с authoring availability;
- existing form/select controls остаются keyboard fallback;
- добавлены focused tests на exact context, view switch, revision change, disabled state и missing gesture start.

### Review findings fixed

- P0 stale gesture: добавлен captured view/revision guard;
- P1 invalid/busy/create-tool states: добавлен explicit authoring gate;
- обнаруженный review-дефект static direct drag: legacy controller теперь синхронно входит в `relation-create` перед завершением через тот же intent path;
- branded `ViewId` используется в tests без ослабления production typing.

### Architecture

`EditorWorkspace` остаётся единственным владельцем committed sources, revision, compilation, history и manual layouts. LikeC4 DSL остаётся semantic SSOT. Не добавлены public package APIs, новая dependency, отдельная canvas model, persistence schema или generic command batch. Changeset не требуется.

### Scope boundary

PR #12 является самостоятельным direct-connection foundation increment. Edge selection/editing, relation patch/remove, flow-coordinate creation, atomic create-and-connect, inline title editing, keyboard parity и canvas-dominant shell перенесены в WP-10, чтобы не смешивать несколько owning-package/API migrations в одном PR.

## WP-10 — Canvas Entity Editing and Atomic Creation ready

AI-ready contract: `apps/gui-to-code/AI-READY.WP-10.md`.

Основные outcomes:

- edge selection и relation patch/remove;
- double-click create с flow coordinates;
- atomic drag existing → empty: element + relation + standard manual layout;
- inline title edit и contextual delete;
- static/dynamic/deployment keyboard parity;
- collapsible panels и canvas-dominant shell.

## WP-08 — MVP release gate complete

- Русская терминология оболочки и состояний долговременного хранения приведена к единому виду.
- Критические элементы управления имеют доступные имена; создание статического вида проверяет keyboard/focus/Escape.
- Release smoke покрывает `390×844`, `1440×900` и `1920×1080`.
- Production artifact сохраняется, запускается через preview и проходит Playwright acceptance.
- README содержит supported-feature matrix, recovery/rollback, persisted schema и ограничения MVP.

Exact-head GitHub CI PR #10:

- `GUI-to-code` run `30933010189` — success;
- `CI (PR & push)` run `30933010265` — success;
- `push` run `30933010284` — success.
