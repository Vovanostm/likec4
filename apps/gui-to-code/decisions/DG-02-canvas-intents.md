# DG-02 — Canvas intents

## Decision

`@likec4/diagram` should expose a narrow optional intent callback backed by a discriminated `CanvasIntent` union. Diagram code owns gesture lifecycle only; the application converts intents into document operations and owns semantic validation, history and errors.

## Evidence

`src/spikes/canvas-intents.spec.ts` proves the connection lifecycle independently from React: one directed intent per completed connection, deterministic self-connection rejection, cancellation without mutation, and duplicate suppression after completion.

## Contract

Initial intent families are element creation, directed relation creation and selection change. Payloads use canonical diagram/model identifiers and diagram coordinates from owning packages; the app contract is never imported by `@likec4/diagram`.

## Alternatives

- Emitting `EditorCommand`: rejected because it couples the renderer to application document semantics.
- Extending `ViewChange`: rejected because that contract owns view/manual-layout changes.
- Event emitter/controller: deferred because one optional consumer does not justify subscription lifecycle complexity.

## Accessibility and cancellation

Pointer and keyboard paths must invoke the same intent factory. Escape cancels pending create/connect state. A cancelled or invalid gesture emits no semantic intent.

## Public API impact

No public diagram API is changed in this PR. WP-01 may introduce a backward-compatible optional callback with package tests and a patch changeset after integration proof.
