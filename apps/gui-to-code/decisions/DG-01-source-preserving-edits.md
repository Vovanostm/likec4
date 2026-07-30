# DG-01 — Source-preserving edits

## Decision

Use LikeC4 language-service AST/CST identity and source ranges to produce validated, non-overlapping text edits. The app document layer owns applying those edits and recompiling the candidate revision. Canonical generation is not an edit path.

## Evidence

`src/spikes/source-edits.spec.ts` proves the required mechanics: range edits preserve unrelated text and comments byte-for-byte, typed identifier ranges can be renamed together, insertions do not reformat neighbors, and removal is blocked while dependencies exist.

## Required owning-package follow-up

WP-01 must expose a browser-compatible adapter from `@likec4/language-services` that resolves declarations and typed references to source ranges. The spike deliberately does not infer references using regex; its ranges stand in for language-service output.

## Alternatives

- Full AST regeneration: rejected because LikeC4 generation is lossy for comments, formatting and source positions.
- Extending the prototype brace parser: rejected as an append-only WP-00 implementation detail.
- Direct AST mutation: rejected unless it can emit minimal source edits with the same preservation guarantees.

## Failure behavior

Overlapping or invalid ranges are rejected. Rename applies declaration and all typed reference edits atomically. Remove first returns dependencies; cascade must be an explicit later command.

## Public API impact

No public API changes in this PR. WP-01 may add a narrow browser source-edit adapter after its ranges are proven against real Langium documents.
