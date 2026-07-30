# DG-02 — Canvas intents

## Status

Accepted and implemented by WP-01.

## Decision

`@likec4/diagram` owns a narrow interaction-intent boundary:

- `CanvasIntent` discriminated union;
- `CanvasIntentHandler`;
- `createCanvasIntentController`;
- optional `LikeC4EditorCallbacks.onCanvasIntent`.

Diagram code owns transient gesture lifecycle only. It does not edit LikeC4 DSL, allocate semantic identifiers, validate domain relations, persist state, or own history.

## Public contract

Initial intent families:

- `element.create.requested`;
- `relation.create.requested`;
- `selection.changed`;
- `interaction.cancelled`.

Payloads use LikeC4 `Fqn` and `ElementKind` types and diagram-local `{ x, y }` coordinates. No app, language-service, source-range, persistence, or `EditorOperation` type is imported into `@likec4/diagram`.

The callback is optional. Existing consumers behave unchanged when it is absent.

## Relation state machine

```text
idle
→ relation-create
→ source selected
→ relation.create.requested
→ idle
```

The controller returns to `idle` before emitting completion, so repeated completion events and rerenders cannot duplicate the intent.

Self-connect is rejected deterministically and emits no relation intent. Relation legality and duplicate-relation policy remain application/domain responsibilities.

## Element creation

```text
idle
→ element-create(kind, optional parent)
→ element.create.requested(point)
→ idle
```

The intent contains requested kind, optional parent, and diagram-local point. Final semantic ID/FQN allocation belongs to the app/document layer.

## Cancellation

Explicit cancellation emits exactly one `interaction.cancelled` intent and no create/connect intent.

Supported reasons:

- Escape;
- pointer cancel;
- tool change;
- source unavailable.

Tool changes cancel the previous active interaction before entering the next mode. Internal `reset` performs teardown without public emission.

## Keyboard path

`handleKeyDown('Escape')` uses the same cancellation transition as pointer/tool cancellation. Product toolbar/focus UX remains outside WP-01; later consumers should invoke the same controller methods from pointer and keyboard handlers.

## Selection

Selection changes are emitted separately from semantic document mutation. Identical ordered selections are suppressed. Selection is not added to `ViewChange` and does not trigger source edits inside the diagram package.

## Compatibility

- `onCanvasIntent` is optional;
- `ViewChange` is unchanged;
- no app or language-service dependency is added to diagram;
- existing editor callbacks remain required/unchanged;
- the capability is covered by a patch changeset.

## Executable evidence

- `packages/diagram/src/editor/CanvasIntent.spec.ts`;
- diagram public export/typecheck/build;
- GUI-to-code compile mapping proof.

## Rejected alternatives

- emitting app `EditorCommand`/`EditorOperation`: couples renderer to document semantics;
- extending `ViewChange`: mixes manual layout with semantic editing;
- global event bus: unnecessary subscription/lifecycle complexity;
- implementing product canvas CRUD in WP-01: belongs to WP-02 and later.

## Known limitations

WP-01 exposes and tests the package-owned interaction controller and callback boundary. It does not add a production toolbar, inspector, drag-to-connect product UX, history, or persistence.
