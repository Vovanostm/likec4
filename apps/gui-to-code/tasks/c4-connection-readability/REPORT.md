# Desktop connection readability correction

The 2026-10-05 user rejection invalidated the previous visual readiness conclusion. Functional consistency and
node-placement assertions did not test whether the rendered connections were readable.

## Reproduction

The actual in-app workspace at `http://127.0.0.1:4174/` was inspected through its visible code panel and rendered DOM.
Its source is retained in [user-model-before.c4](user-model-before.c4). No hidden application state was injected or
read. The ZIP export reported success in the UI, but the browser download API did not return a file; a captured
original ZIP is therefore NOT_CONFIRMED.

Visible absolute node positions before correction: Online shop `(97,-129)`, size `1147×782`; Customer `(48,392)`;
actor `(730,431)`; system `(253,224)`; Web application `(139,-69)`; component `(882,-30)`. Leaves were `320×180`.
Customer overlapped system. Several connection curves retained earlier coordinates, and `shows orders` covered
system. Isolated native-UI reproductions also failed:
[connected creation](evidence/before-connected-lines.png), [opposite links](evidence/before-opposite-lines.png).

## Cause and correction

Creation moved nodes before manual-layout merging, then collision-free placement moved them and resized compounds
again. Edge curves, control points and labels did not receive a corresponding final-geometry correction. Existing
manual merging retained stale paths; native movement reattached endpoints but did not avoid unrelated nodes.

The correction belongs to the existing renderer/manual-layout owner. The app calls it after final placement,
snapshot saves, manual merging and saved-workspace restoration. Snapshot repair updates geometry while retaining
saved semantic fields. Geometry operations retain source bytes, standard snapshot persistence, and workspace history.

Independent review additionally required correct endpoint entry, distinct reverse/parallel routes, label collision
checks, and bounds containing repaired detours. The renderer now validates the actual cubic path, repairs tangential
attachments, reserves peer routes/ports and gives tiny connections a useful selectable detour. Safe Graphviz curves,
custom controls and nearby existing labels remain unchanged. New automatic labels stay near their own path; a short
gap without space for a wide/tall label receives a detour instead of a detached perimeter label.

Browser findings also corrected: routing handles appear only for the selected connection; snapshots preserve exact
coordinates/dimensions and the rendered curve rather than synthesizing different control points; focused inner node
surfaces use the same constrained movement/save lifecycle as the wrapper. Hydration and “Load latest” persist repaired
geometry at the existing semantic revision through token-aware replacement before installing it. Conflicts retain
local work and successful superseded writes still publish their new storage token.

The full run exposed a test-coordinate race: fit-to-view changed the SVG screen matrix between path sampling and
clicking. Trace inspection confirmed the moving transform and wrong compound selection. Acceptance now waits for a
stable native path/matrix, resamples, clicks once and still requires the exact intended relation selection. Geometry
attachments are captured only after the fresh native checks pass. No force click, selection injection or weaker
geometry assertion is used.

## Actual user workspace

The repaired saved workspace retained revision 26 and exact source bytes. Customer overlapped system; it was moved
left through normal keyboard/button controls from `(48,392)` to `(-272,392)`. All other node positions stayed exact.
One final movement was undone/redone and reload restored revision 44, corrected routes and saved status.
[Actual pane capture](evidence/user-corrected.jpg) is an overview at 496×853; its fit-all labels are too small for
editing. Desktop route legibility is judged separately at 1600×1100. No whole-layout reset or source replacement was
performed in the user workspace.

Chrome DevTools independently selected `shop.system → shop.web`, moved Web application by 20 units through its native
focused node, then confirmed identical node coordinates and SVG curves after reload on `index-BfR6ikty.js`. Chrome
used an isolated diagnostic copy of the captured source, rather than the user's IndexedDB workspace.

## Further review corrections

During verification, another active user chat changed the inspector/forms and relation source-edit adapter. Those
changes were preserved and reviewed. Confirmed relation-title discard now clears the local draft even when the
selected ID/title stays unchanged after an unrelated Undo or rejected action.

The parser-owned relation planner exposed a native authoring regression: adding a first title to an untitled,
fully qualified target such as `system.database` failed with a missing target source range. Generic grammar-property
lookup does not reliably locate the full qualified reference. The planner now uses the target AST's CST range;
the existing UI authoring/lock/history/ZIP scenario passes again. A browser-services regression also checks that
another source document remains byte-identical. This was a range lookup failure, not a relation-ID mismatch.

Two acceptance corrections are explicit: synchronous DOM captures avoid mixing animation frames; export checks now
use the actual Russian button label `Экспортировать .c4`. Geometry/selection assertions and timeouts were retained.
A resource-contended app run timed out one preexisting 5-second bootstrap case. The final serial run passed all
441 tests without increasing that timeout.

Production assets are copied to an immutable local preview for browser acceptance, so a concurrent chat's rebuild
cannot change the candidate mid-run. The final scrollbar-padding change is included in `index-D4ia-oHx.js` and its
CSS; it does not alter the normalized JavaScript payload. Source/asset identity is recorded in the manifest.

## Current acceptance

PASS on the final current candidate `index-D4ia-oHx.js`: 65/65 desktop browser scenarios (no retries/skips),
441/441 app tests (47 files), 44/44 diagram owner tests and 35/35 source owner tests. App/diagram/language-service
types, generation/build, focused lint, 10/10 instruction validation and diff checks passed. The independent critic
reviewed the final route captures and the actual saved user diagram at 1600×1100, with no confirmed P1/P2 remaining.

Thirteen synchronous native-geometry records contain nonempty nodes/routes and no readability failures. Chrome
DevTools confirmed exact node transforms and SVG curves across reload. All served assets on port 4174 match the
final manifest hashes. The actual user source stays byte-identical at revision 44, with Customer separated and all
other manual positions preserved. [Final actual desktop capture](evidence/user-desktop-final10.jpg),
[native records](evidence/native-geometry-results.json), [Chrome readback](evidence/chrome-final10-readback.json),
[full browser log](evidence/likec4-routing-final10-browser.log), and [source/asset manifest](evidence/manifest.json).

The updated [readiness checklist](../c4-completion/READINESS.md) has 15/15 local desktop gates passing. This supersedes
the withdrawn connection-readability verdict; earlier assets and failed runs remain historical evidence. Crossings
can still occur, parallel declarations may aggregate as `[…]`, and scoped C2 projects four of the starter's five
source relations. The narrow pane is an overview; editing-scale readability was reviewed at desktop size.
WP-13–WP-15 retain their separate active delivery states. No commit, push or publication was performed.

Desktop only. Mobile, accessibility certification, external CI and publication are outside this local acceptance.
