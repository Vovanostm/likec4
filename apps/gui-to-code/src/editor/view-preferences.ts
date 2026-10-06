import type { ViewId } from '@likec4/core/types'

/** Tab-local navigation preference. Semantic persistence and CAS remain workspace-owned. */
export function readPreferredView(projectId: string): ViewId | null {
  try {
    return sessionStorage.getItem(`likec4.gui.view.${projectId}`) as ViewId | null
  } catch {
    return null
  }
}

export function rememberView(projectId: string, viewId: ViewId): void {
  try {
    sessionStorage.setItem(`likec4.gui.view.${projectId}`, viewId)
  } catch { /* Optional navigation preference. */ }
}
