# Tag creation and relationship properties — local desktop verification

User authorization: “Implement fixes” after the deep-nesting audit. Bounded scope:
[WP-16-properties](WP-16-properties.md). Previous nesting/routing results remain historical evidence.

## Implemented

- Create a tag from element or logical relationship properties, including a fresh project with no declared tags.
  Invalid names and duplicate definitions are rejected. Enter creates a tag without submitting the surrounding form.
- Assign/remove declared tags on logical relationships; edit their title, multiline description and technology.
  Metadata can be edited on an untitled relationship without inventing a title.
- Keep unsaved element/relationship fields when creating a tag. Definition creation and property assignment have
  separate atomic history entries. Existing dirty navigation and in-flight save protection apply to metadata.
- Use the accepted AST/CST document planner for additive `planAddTag` and `planPatchRelation` metadata support.
  Preserve unrelated source, comments, quote styles and duplicate relationship declarations. No DSL regeneration,
  grammar/dependency/storage changes or second mutable model. EditorWorkspace compiles before committing.
- Keep description compact and use existing desktop form typography. Add a patch changeset for language-services:
  [edit-relation-metadata-and-declare-tags](../../../../.changeset/edit-relation-metadata-and-declare-tags.md).

## Browser evidence

Final production asset: `index-BvuFrzjW.js`, own preview origin `http://127.0.0.1:4187` and isolated
`properties-audit` browser session. User storage on other origins was preserved.

Native UI checks on the prior eight-level, 13-element, two-relation fixture passed:

- Invalid/duplicate tag controls, Enter creation, retained unsaved description, deep element assignment.
- Exact source Undo/Redo for declaration and assignment separately.
- Relationship description/technology/tags, retained draft and selection during tag creation, exact source history.
- Clearing metadata and restoring it; editing an untitled edge through a visible point on its native SVG path.
- Creation and assignment from a fresh project with zero tags.
- Native .c4/ZIP export, actual project replacement, ZIP import, reload, exact source, native node positions and SVG paths.
- Compact description field; final screenshot visually inspected. Browser console had no errors.

Artifacts: [main UI proof](../../../../output/playwright/properties-20261006/browser-properties-final4.log),
[exchange proof](../../../../output/playwright/properties-20261006/browser-exchange-final3.log),
[screenshot](../../../../output/playwright/properties-20261006/final.png),
[portable ZIP](../../../../output/playwright/properties-20261006/properties-final.zip).
Served JS/CSS hashes match dist; source hashes match the verified candidate.

## Checks

Planner tests: 48/48 in three affected owner files. Final focused app tests: 10/10.
App generate/build/typecheck, language-services typecheck, focused lint/format and instruction checks passed.
Final full app: **455/455**, 49 files, one worker, unchanged timeouts.
Existing production browser regressions: **16/16** across inspector, draft, dynamic/deployment edge and save-status
suites, zero retries/skips/flaky/unexpected, no runner errors. These supplement the two native GUI scripts above;
the earlier 67-scenario nesting matrix is historical and was not counted as rerun here.
Source and dist hashes were checked again after all runs; no candidate changes occurred.

Local closeout: **done**, managed revision 47. Evidence covers the admitted desktop feature scope.
WP-13–WP-15 retain their existing states; shared dirty checkout and user data were preserved.

Run history is retained in `output/playwright/properties-20261006`: the first planner candidate changed double quotes;
its preservation regression caught it and the planner was repaired. Exploratory browser scripts initially waited for
“saved” while an inspector draft was intentionally dirty, then used an SVG bounding-box click and ambiguous path/text
selectors. Final scripts check actual draft state and operate the exposed native curve or its visible label.
These failed attempts are not counted as passes; assertions and timeouts were not weakened.

## Remaining boundaries

Tag definition rename/removal/color editing, relationship styles and full specification/view-rule authoring remain
outside this packet. Dynamic/deployment metadata still supports title only. Local Chromium desktop evidence covers
finite fixtures; arbitrary complexity, other browsers and CI/release are not claimed. No commit, push or deployment.
