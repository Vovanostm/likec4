# Independent desktop review

Three independent source review rounds checked layers, technology/source planning, C4 view navigation, placement,
history, replacement races and renderer ownership. The parent owned integration and current-candidate browser acceptance.

| Finding                                                                  | Correction                                                                                         | Verification                                                  |
| ------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| Implicit scoped creation bypassed a parent layer lock                    | Guard derives scope from the current compiled view                                                 | Complex layers journey and source review                      |
| Locked relation labels remained draggable                                | Native incident relationships receive presentation lock; drag handlers disabled                    | Trusted pointer regression                                    |
| Clearing an inherited icon restored its kind default                     | Emit `icon none`; normalize sentinel in selection and semantic verification                        | CST/compiler source-owner regressions                         |
| Automatic layout label disagreed with restored snapshot                  | Derive mode from the selected view's persisted standard snapshot                                   | Undo/Redo/reload/ZIP journey                                  |
| Reload selected the first view                                           | Tab-local preference and validated optional ZIP metadata; reconcile against current compiled views | C1/C2/C3 and scale reload, ZIP tests                          |
| Cached auto layout could show a replaced workspace                       | Cache bound to owner, revision and committed-source identity                                       | Regression unit and final reviewer                            |
| Deleting an unlocked source cascaded into a locked incident relationship | Guard incident endpoints for subtree remove/rename/move using canonical typed FqnRef               | Compiler-backed unit and UI locked-target deletion regression |
| Layer projection could erase native selection or gesture geometry        | Project from current native nodes/edges through the existing diagram actor                         | Focused keyboard/button/layers tests and full desktop run     |
| First keyboard save remounted the renderer and lost selection            | Restore host element selection on renderer initialization, without focus mode or viewport mutation | Previously failing movement-button scenario now passes        |

Final reviewer conclusion: no outstanding reviewed P1/P2 in the supported desktop C4 scope. The reviewer performed
read-only source review and diff checks; the reviewer did not run browser/build checks. Parent verification:
59/59 production desktop scenarios, 422/422 app tests, 42/42 source-owner tests and 23/23 diagram-owner tests.

The first integrated final run exposed two failures. The collapsed File menu assertion was corrected to inspect the
actual hidden control's disabled state; all history/source assertions remain. The movement-button failure was a real
selection mismatch and was fixed in production code. Focused checks passed before the complete suite was rerun.
An earlier runner-owned preview shutdown caused connection refusals; final acceptance used a parent-owned preview
and no builds ran while its tests were active.

Existing dirty worktree changes and WP-13–WP-15 delivery states remain intact. No commits, staging, resets, pushes or
publication were performed. Source review plus local tests is not external CI, release, or universal standards certification.
