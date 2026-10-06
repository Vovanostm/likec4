# ast-grep checks

The repository-level configuration in [`../sgconfig.yml`](../sgconfig.yml) keeps
the editor's structural SSOT checks close to the code they protect.

Run the pinned CLI without adding a runtime dependency:

```bash
pnpm lint:ast-grep
```

The project wrapper promotes all configured rules to `error` for this command,
so a matched SSOT violation exits nonzero. The YAML files keep `warning`
severity for editor/reporting ergonomics when a rule is run directly.

The current rules are deliberately narrow:

- direct `localStorage` source/layout reads and writes in `apps/gui-to-code`;
- wiring the legacy brace-based `src/document.ts` command owner into runtime
  TypeScript or TSX source;
- rebuilding a draft from one `model.c4` source in the multi-file workspace
  runtime;
- hardcoding `model.c4` in runtime command paths instead of resolving the
  workspace entry document;
- inferring the entry document from the first source in persisted-workspace
  serialization.

Warnings are migration findings, not an instruction to flag transient React
state or every browser storage adapter. Update a rule only together with the
corresponding SSOT decision and a focused regression check.

References:

- <https://ast-grep.github.io/reference/sgconfig.html>
- <https://ast-grep.github.io/reference/yaml.html>
- <https://ast-grep.github.io/guide/project/severity.html>

## Fixture tests

The repository currently has no established `ast-grep test` fixture directory
or snapshot convention. Do not add ad-hoc fixtures until the integration owner
chooses and documents that convention. The scan rules above are intentionally
validated by the project scan command for now; adding positive/negative
fixtures remains a follow-up TODO.
