# WP-19 — Просмотр готовой схемы

Дата: 7 октября 2026. Статус: реализовано и проверено локально; общий integration gate не пройден.
Packet: [WP-19-diagram-preview.md](WP-19-diagram-preview.md).

Кнопка «Просмотр» открывает отдельный полноэкранный read-only `ReactLikeC4` без editor provider,
semantic callbacks или layout save observation. Данные берутся из существующего last-valid compiler model;
показанная ручная раскладка разрешается стандартным model/view API. Выбор вида, тема, zoom и сравнение
раскладки локальны просмотру. Редактор остаётся смонтированным, поэтому его panels/drafts/viewport сохраняются.
При неприменённом inspector draft или ошибке DSL появляется предупреждение о последней корректной версии.
Временные hidden/locked layers в просмотр не переносятся.

Браузерная проверка обнаружила захват Cmd/Ctrl+Z глобальным body capture handler фонового editor.
App отключает authoring на время просмотра; отдельный window capture guard изолирует Undo/Redo и arrows
раньше body handlers; стрелки в select явно переключают выбранный вид/тему. Escape обрабатывается dialog до body
handlers. После закрытия listener удаляется, focus возвращается на кнопку. Shared renderer не изменялся.

## Проверки

- PASS: browser acceptance — 25/25 на production artifact `index-PbGYo1EI.js`, CSS `index-CAR0Spdm.css`.
  Проверены manual node transforms,
  source bytes, workspace revision, static/detail/dynamic/deployment views, technology icon,
  read-only drag, Delete/F2/Undo/Redo/arrows, theme/view selection стрелками, scale, editor view/focus/geometry после возврата,
  hidden layers, invalid draft/last-valid warning и Escape. Intentional invalid DSL дал ожидаемую compiler error.
- PASS: focused ViewToolbar, WorkspacePanel, editor-shortcuts — 89/89.
- PASS: app generate/build, focused formatting/oxlint; agent-instructions — 10/10; diff check.
- FAIL: полный app suite — 439 passed / 38 failed, 53 files. Повтор с одним worker не устранил owner
  test timeouts. Assertions/timeouts не изменялись. Этот suite не импортирует новый preview UI.
- FAIL: app typecheck текущего рабочего дерева: `use-professional-canvas.ts` ссылается на ещё отсутствующие
  `pasteSubgraph`, `inspectSubgraphRemoval`, `removeSubgraph`. Ошибок preview в финальном readback нет.
- NOT_RUN: CI/release, публикация сайта, Safari/Firefox.

Артефакты: `output/playwright/diagram-preview-20261006/` — executable browser check,
browser log, light/dark screenshots, build/types/focused/full-test logs.
Сборка обслуживается с отдельного локального origin `127.0.0.1:62019`; данные пользователя на существующих
origins не заменялись. Новый dependency, schema migration, public API или changeset не требовались:
app private. Commit/push/deploy не выполнялись.

Write set этого пакета: App integration, DiagramPreview.tsx/css, README/SPEC/ROADMAP/STATUS,
packet/report и browser verification artifact. Прочие изменения рабочего дерева сохранены.
