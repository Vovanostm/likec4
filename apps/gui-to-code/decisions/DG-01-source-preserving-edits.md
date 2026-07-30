# DG-01 — Source-preserving edits

## Status

Accepted and implemented by WP-01.

## Decision

`@likec4/language-services` owns the production source-edit planning boundary through:

- `createDocumentEditService(likec4)`;
- `DocumentEditService`;
- `SourceEditPlan` and `DocumentTextEdit`;
- `RemovalDependencyReport`;
- `applyDocumentTextEdits` and `sourceRevision`.

The service uses linked Langium documents, the LikeC4 model locator, AST node locator, CST ranges, the language-service name provider, and resolved Langium references. The application owns applying a plan to candidate source and recompiling before commit.

Canonical DSL generation is not an edit path.

## Browser boundary

The contract is exported from `@likec4/language-services/browser` and from the conditional root export. It uses in-memory Langium documents and contains no filesystem, process, or child-process dependency.

Every edit identifies its document by URI. A plan records a source revision for each affected document.

## Source-preservation guarantees

- add inserts at the CST-backed closing boundary of a model block;
- rename changes the declaration name node and resolved typed references only;
- remove uses declaration/dependency CST ranges;
- edits are deterministic and checked for overlap;
- comments, titles, free strings, and unrelated source are not searched or rewritten;
- full AST serialization and canonical generation are not used.

Positions use the LSP/JavaScript UTF-16 coordinate model exposed by Langium text documents.

## Rename behavior

Rename validates the new local identifier, resolves the target declaration, checks the resulting FQN for collision, and creates one atomic workspace plan for the declaration and all resolved references.

A collision, invalid identifier, missing declaration/range, ambiguous overlapping edits, or stale source fails closed and produces no applied mutation.

## Removal protocol

Removal is two-phase:

1. `inspectRemoveElement` returns a language-neutral dependency report with stable IDs, kinds, URI/range, and removal capability.
2. `planRemoveElement` requires the exact dependency-report revision and explicit approval of every current dependency ID.

Dependencies are classified as child element, incoming/outgoing relation, scoped view, view reference, or other semantic reference. Dependencies contained by the target declaration require approval but no duplicate edit. Separately removable relations/views/rules produce CST-backed edits. Unsupported cascades fail closed.

The planner collapses contained removal ranges and rejects overlapping final edits. The candidate must still be compiled by the caller before commit.

## Multi-document model

Plans contain `affectedDocuments`, document URIs, and per-document base revisions. Rename may return edits for more than one linked document. GUI-to-code remains single-file in WP-01, but the public shape does not impose that limitation.

## Executable evidence

- `packages/language-services/src/common/DocumentEditService.spec.ts`;
- package browser build/typecheck;
- GUI-to-code compile integration.

## Rejected alternatives

- full AST regeneration: lossy for comments, formatting, and source positions;
- regex/global string replacement: not semantic and may rewrite comments or unrelated strings;
- extending the app-local brace parser: wrong owner and incomplete language semantics;
- direct AST mutation without minimal text edits: cannot provide source-preservation guarantees;
- applying edits inside the service: would bypass application compile-before-commit.

## Known limitations

- WP-01 implements element add/rename/remove primitives only;
- cascade is intentionally fail-closed for semantic references without a proven removable AST owner;
- product confirmation UI, command history, and multi-file UX belong to later work packages.
