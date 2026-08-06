import type * as t from '@likec4/core/types'
import type { DiagramPoint } from './CanvasIntent'

export type CanvasConnectionOutcome = 'connected' | 'empty' | 'cancelled'

export interface CanvasConnectionEnd<A extends t.aux.Any = t.aux.UnknownLayouted> {
  readonly sourceId: t.aux.Fqn<A> | null
  readonly outcome: CanvasConnectionOutcome
  readonly screenPosition: DiagramPoint
}

export type OnCanvasConnectionEnd<A extends t.aux.Any = t.aux.UnknownLayouted> = (
  connection: CanvasConnectionEnd<A>,
) => void

export function resolveCanvasConnectionOutcome(
  connected: boolean,
  droppedOnPane: boolean,
): CanvasConnectionOutcome {
  if (connected) return 'connected'
  return droppedOnPane ? 'empty' : 'cancelled'
}

export function pointerScreenPosition(event: MouseEvent | TouchEvent): DiagramPoint | null {
  if ('changedTouches' in event) {
    const touch = event.changedTouches.item(0)
    return touch ? { x: touch.clientX, y: touch.clientY } : null
  }
  return { x: event.clientX, y: event.clientY }
}
