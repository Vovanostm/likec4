import type { EditorWorkspaceState } from './contracts'
import type { EditorWorkspace } from './workspace'

export interface AutoLayoutCache {
  owner: EditorWorkspace
  revision: number
  sources: EditorWorkspaceState['committedSources']
  model: EditorWorkspaceState['lastValidModel']
}

/** An asynchronous layout is usable only by the exact workspace revision that requested it. */
export function currentAutoLayout(
  cache: AutoLayoutCache | null,
  owner: EditorWorkspace | null,
  state: EditorWorkspaceState | null,
): EditorWorkspaceState['lastValidModel'] {
  return cache && state && cache.owner === owner && cache.revision === state.revision
      && cache.sources === state.committedSources
    ? cache.model
    : null
}
