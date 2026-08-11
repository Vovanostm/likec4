# WP-11 Dynamic & Deployment Edge CRUD — discovery

Date: 8 August 2026
Baseline: `main` @ `69e7d0b55df300fc1a149eeb3b1fe0aaf2e2cc23`
Previous delivery: PR #15 (`feat(gui-to-code): add canvas entity editing and atomic creation`)

## Scope decision

WP-11 closes the source-preserving patch/remove gap for canvas-selected dynamic steps and deployment relations. `EditorWorkspace` remains the semantic/history/layout transaction owner; `@likec4/diagram` remains a renderer/gesture boundary.

No renderer API, persistence schema, dependency, grammar, core model or manual-layout format change is required.

## Dynamic step identity

The parser already provides an exact identity stronger than endpoint occurrence:

- parsed dynamic steps carry `astPath` (`Step.astPath`);
- the path is relative to the owning `DynamicViewBody` and is produced by `pathInsideDynamicView`;
- computed/layouted dynamic edges retain `astPath` as an internal identity field;
- canvas edge selection already supplies the compiled edge id, so the workspace can resolve that id inside the active dynamic view and obtain `astPath` without making React responsible for source ranges.

The document layer therefore accepts the semantic locator `viewId + astPath`, resolves the unique owning parsed view/document, then resolves the exact Langium AST node through `AstNodeLocator` and edits its `$cstNode`.

Duplicate directed endpoints are safe because two declarations have different AST paths even when source and target are identical. Endpoint/ordinal matching is not required.

### Complex dynamic flow structures

The grammar supports standalone `Step`, nested flow blocks and `StepSeries` chains. Title patching can target the exact `AbstractStep` property through its AST path. Exact removal is safe for standalone `Step` declarations. Removing one segment from a `StepSeries` can otherwise change the source of a neighboring segment or require structural splitting; such a case must fail closed with `invalid-operation` rather than rewrite unrelated flow semantics. The workspace verifier additionally rejects any candidate whose semantic delta is not exactly one selected step.

## Deployment relation identity

`ParsedLikeC4LangiumDocument.c4DeploymentRelations` already contains for every declaration:

- stable compiled `RelationId`;
- exact document-relative `astPath`;
- resolved deployment source/target references.

`DeploymentModelParser` derives `RelationId` from the document URI, AST path and endpoints. The document layer can therefore resolve `RelationId -> unique parsed document descriptor -> astPath -> exact DeploymentRelation AST/CST` directly.

Duplicate endpoint relations are safe without ordinal guessing. Multi-file ownership is exact because the relation descriptor lives on one parsed document. Zero matches return `not-found`; multiple matches return `ambiguous-reference`.

## CST ranges and source preservation

Both operations use Langium AST/CST only:

- existing inline `title` is replaced through the CST node for the `title` property;
- an absent title is inserted immediately after the exact `target` property;
- single quotes and backslashes are escaped using the existing single-quoted title convention;
- removal uses the selected declaration CST range plus only its own indentation/trailing newline when safe;
- neighboring comments and unrelated whitespace are not normalized;
- no regex or brace parser is used as a semantic locator.

## Workspace mapping

Dynamic:

`CanvasEntityRef(dynamic-step id)` -> active layouted dynamic view edge -> `edge.astPath` -> language-services locator.

Deployment:

`CanvasEntityRef(deployment-relation RelationId)` -> compiled deployment relation -> language-services `RelationId` locator.

React stores only transient selection plus the captured view/revision needed for stale-action protection. Source ranges and occurrence resolution stay outside React.

## Public API decision

`DynamicDeploymentDocumentEditService` is the existing public source-preserving owner for dynamic/deployment creation and is the correct owner for WP-11 patch/remove planning. It will gain public locator/patch input types and four methods:

- `planPatchDynamicStep`
- `planRemoveDynamicStep`
- `planPatchDeploymentRelation`
- `planRemoveDeploymentRelation`

Browser and Node entrypoints must re-export the same types. This is a public additive package change, so a patch changeset for `@likec4/language-services` is required.

## Rejected alternatives

- React string/regex search for `source -> target`: rejects source ownership and duplicate safety.
- using XYFlow edge id directly as a source path: renderer id is not the persisted source contract.
- endpoint-only deletion: unsafe for duplicates.
- ordinal occurrence as the primary identity: unnecessary because `astPath` / `RelationId` already exist.
- canonical DSL regeneration: lossy for comments and formatting.
- a second canvas semantic graph: violates `EditorWorkspace` SSOT.
- extending `packages/diagram/**`: existing compiled edge identity is sufficient.
