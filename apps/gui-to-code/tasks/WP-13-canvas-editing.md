# WP-13 — Удобное редактирование на холсте

```yaml
work_package: WP-13
outcome: компактные инструменты и быстрые действия canvas с безопасными shortcuts
acceptance: [AC-01, AC-02, AC-03, AC-05, AC-08, AC-10]
depends_on: [WP-12]
decision_gates: []
write_scope:
  - apps/gui-to-code/src/App.tsx
  - apps/gui-to-code/src/editor/use-semantic-editor.ts
  - apps/gui-to-code/src/editor/use-wp06-runtime.ts
  - apps/gui-to-code/src/editor/editor-shortcuts.ts
  - apps/gui-to-code/src/editor/editor-shortcuts.spec.ts
  - apps/gui-to-code/src/editor/ui/CanvasToolbar.tsx
  - apps/gui-to-code/src/style.css
  - apps/gui-to-code/README.md
  - apps/gui-to-code/ROADMAP.md
  - apps/gui-to-code/ROADMAP.STATUS.md
do_not_edit: [packages/**, package.json, pnpm-lock.yaml, persisted schemas, workspace semantic commands]
interfaces: [existing EditorWorkspace dispatch, canvas intents, inspector actions, standard manual layout]
invariants: [one semantic owner, Russian UX, source preservation, exact history, text input owns native Undo]
non_goals: [collaboration, arbitrary shapes, new persistence, new dependency, full Miro parity]
focused_checks: [shortcut routing tests, existing canvas/workspace tests]
integration_checks: [
  app generate,
  app typecheck,
  app tests,
  app build,
  check:agent-instructions,
  dprint,
  git diff --check,
]
stop_when: controls integrated and relevant local checks pass; browser evidence explicitly marked unverified
escalate_when: a public API, semantic owner, data format or dependency must change
```

Canvas toolbar worker владеет только `src/editor/ui/CanvasToolbar.tsx`.
Integration owner владеет остальными изменениями и проверками. Browser automation отклонена политикой инструмента;
использовать обход через другой browser/CLI нельзя. Проверки выполняются без чтения или изменения пользовательской вкладки.
