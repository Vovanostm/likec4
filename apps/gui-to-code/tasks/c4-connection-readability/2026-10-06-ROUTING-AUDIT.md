# Line routing and visual editing audit — 2026-10-06

Current candidate: `index-BK3aO3U0.js`, immutable local production preview at
<http://127.0.0.1:4185/>. Complete final browser acceptance passed 67/67, with no
retries, skipped, unexpected or flaky results and no runner errors.
App 443/443, geometry owners 55/55, app/diagram types and focused formatting/lint passed.

## Corrections

- Connection ports were ranked globally by relation ID, including connections on unrelated sides.
  Repaired automatic routes now allocate each side independently: one connection uses its midpoint;
  fan-out follows neighboring geometry. IDs break parallel ties only. Safe untouched Graphviz paths
  and deliberate manual curves retain their geometry.
- Moving a node synthesized control points and made an automatic route appear manually customized.
  Automatic routes now remain automatic. New relations in manual views reconcile against the real
  automatic baseline and final node geometry.
- Manual relationship label intent was lost on semantic recompilation. Standard snapshots now retain
  `isLabelCustomized`; changing an element's title preserves safe manual labels and curves.
- Label/control-point pointer release could commit the previous animation frame. Both gestures flush
  their final pending pointer position. The trailing-click suppression also expires when pointerup
  lands on another element, so the next independent selection is not swallowed.
- Clear-selection and Escape cleared the host inspector but retained native selected nodes. The host
  now sends the existing `xyflow.resetSelection` event. Two browser regressions failed on the prior
  frozen candidate with one selected node remaining; the final native check clears selection and
  verifies that keyboard movement does not move a deselected node.
- Geometry-only saves/reset/history compiled unchanged source and reran automatic layout. They reuse
  the validated model; every byte-different source history entry still compiles. Snapshots retain
  validation, revision checks, canonical automatic baselines and the single workspace/history owner.
- Reconciliation no longer repeats when materializing already validated snapshots. Curve intersection
  checks reject distant obstacle boxes using cached convex-hull bounds before exact subdivision.

The renderer is the repository's `@likec4/diagram`, with native XYFlow gestures, SVG paths and standard
`.likec4/*.likec4.snap` files. No parallel geometry graph or browser-state injection was introduced.

## Evidence

All files below are under [the audit output](../../../../output/playwright/c4-routing-audit-20261006).

| Check                                | Result / evidence                                                                                                                                                         |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| App regression                       | 47 files, 443/443; `app-tests-final3.log`, one worker                                                                                                                     |
| Geometry regression                  | 4 files, 55/55; `geometry-tests-final2.log`; routing owner unchanged since this run                                                                                       |
| Final full desktop browser matrix    | PASS: `browser-report-final3.json`, 67/67, no retries/skips/flaky/unexpected results; 398.5 seconds                                                                       |
| Prior frozen full matrix             | 65/65 on both `index-BDHc--Gr.js` and `index-C2r_R0KB.js`; zero skipped/unexpected/flaky                                                                                  |
| Source/assets                        | `source-provenance.json`, `asset-provenance.json`; SHA-256 matches both local preview servers                                                                             |
| 200-node / 370-edge native rendering | `stress-native-final3.json`: no node overlaps or paths through leaf bodies, SVG samples every 4 graph units                                                               |
| Large geometry history               | Exact 20-unit native movement; Undo/Redo and reload restore positions and paths; source unchanged                                                                         |
| Manual semantic editing              | `manual-native-final3.json`: title edit, exact safe curves/labels, Undo and reload                                                                                        |
| Portable projects                    | Actual UI exports: `stress-200-final.zip`, `customized-banking.zip`, `banking-clean-final.zip`; bank source bytes match                                                   |
| Visual inspection                    | `banking-clean-final3.png`, `manual-customization.png`, `stress-focus-editing-final.png`; title/body hierarchy and route geometry inspected                               |
| Typography                           | `typography-final3.json`: all eight leaf titles have identical font size, line height, family and centered alignment; descriptions/technologies also use consistent roles |

The 200-node fixture was generated and imported through the real file UI; it was not authored through
canvas controls. The complete browser matrix separately exercises UI-authored C1/C2/C3 diagrams,
57 elements across levels, nesting, logical/dynamic/deployment editing, technologies, layers,
import/export, invalid drafts, persistence, history and native connection geometry.

Three final 200-node movement-to-save measurements were 1618, 1626 and 1616 ms. They include the
existing intentional 1000 ms edit debounce. A separate final DOM observer recorded the first visible
node displacement at 253 ms and saved status at 1792 ms. The observer starts before the native gesture;
timings are host-dependent, not a controlled benchmark. Earlier 128 ms data did not actually move a
selected node and is excluded. `stress-200.json` is retained only as historical evidence.

The banking custom ZIP deliberately retains four legacy/control-point curves and one displaced manual
label. It proves preservation, not automatic midpoint normalization. The clean banking example was
reset through the visible control, then five containers were moved through native gestures; its C2
snapshot contains no manual control points. Both versions retain exactly the same source bytes.
The routing correction also works without reset, as covered by connected route/history regressions.

## Review limits and run history

One concurrent full app run timed out in three compiler-heavy tests; a second limited run was stopped
after another timeout. Processes showed substantial CPU/memory pressure from concurrent desktop work.
The final full app run used one worker, unmodified test timeouts, and passed 443/443. These failed/aborted
logs remain in the output directory; they are not counted as passing evidence.

This is finite local Chromium desktop coverage, not a guarantee for arbitrary graph size. Fit-all is
an overview; zoom and focused views are needed for text editing. User-authored overlaps, explicit
curves, line-line crossings and graph-dependent routing costs remain possible. The build's large main
chunk warning and existing compiler/listener warnings remain. No universal zero-warning or
zero-crossing claim is made. External CI/release and other browser engines were not run.

The original project/storage on port 4174 and the prior banking preview on 4184 were not replaced.
Only the task's isolated 4185/62004 previews were rebuilt. No commit, push or deployment was performed.
