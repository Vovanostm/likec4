export type CanvasIntent =
  | { type: 'element.create.requested'; kind: string; x: number; y: number }
  | { type: 'relation.create.requested'; sourceId: string; targetId: string }
  | { type: 'selection.changed'; ids: string[] }

export type ConnectionState = { sourceId: string | null }

export function beginConnection(sourceId: string): ConnectionState {
  return { sourceId }
}

export function cancelConnection(): ConnectionState {
  return { sourceId: null }
}

export function completeConnection(
  state: ConnectionState,
  targetId: string,
): { state: ConnectionState; intent: CanvasIntent | null } {
  if (!state.sourceId || state.sourceId === targetId) return { state: cancelConnection(), intent: null }
  return {
    state: cancelConnection(),
    intent: { type: 'relation.create.requested', sourceId: state.sourceId, targetId },
  }
}
