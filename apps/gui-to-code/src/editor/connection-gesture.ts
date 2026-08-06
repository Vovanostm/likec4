import type { ViewId } from '@likec4/core/types'

export interface ConnectionGestureSnapshot {
  readonly revision: number
  readonly viewId: ViewId
}

export interface ConnectionGestureContext extends ConnectionGestureSnapshot {
  readonly enabled: boolean
}

export function captureConnectionGesture(context: ConnectionGestureContext): ConnectionGestureSnapshot | null {
  if (!context.enabled) return null
  return { revision: context.revision, viewId: context.viewId }
}

export function canCompleteConnectionGesture(
  started: ConnectionGestureSnapshot | null,
  current: ConnectionGestureContext,
): boolean {
  return started !== null
    && current.enabled
    && current.revision === started.revision
    && current.viewId === started.viewId
}
