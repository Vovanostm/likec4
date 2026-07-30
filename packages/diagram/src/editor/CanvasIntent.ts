import type { ElementKind, Fqn } from '@likec4/core/types'

/** A point in diagram-local coordinates. */
export interface DiagramPoint {
  readonly x: number
  readonly y: number
}

export type CanvasInteraction = 'element-create' | 'relation-create'

export type CanvasIntent =
  | {
    readonly type: 'element.create.requested'
    readonly elementKind: ElementKind
    readonly parentId?: Fqn
    readonly point: DiagramPoint
  }
  | {
    readonly type: 'relation.create.requested'
    readonly sourceId: Fqn
    readonly targetId: Fqn
  }
  | {
    readonly type: 'selection.changed'
    readonly elementIds: readonly Fqn[]
  }
  | {
    readonly type: 'interaction.cancelled'
    readonly interaction: CanvasInteraction
    readonly reason: CanvasCancellationReason
  }

export type CanvasCancellationReason =
  | 'escape'
  | 'pointer-cancel'
  | 'tool-change'
  | 'source-unavailable'

export type CanvasIntentHandler = (intent: CanvasIntent) => void

export type CanvasIntentControllerSnapshot =
  | { readonly interaction: 'idle' }
  | { readonly interaction: 'element-create'; readonly elementKind: ElementKind; readonly parentId?: Fqn }
  | { readonly interaction: 'relation-create'; readonly sourceId?: Fqn }

/**
 * Deterministic package-owned interaction controller.
 *
 * It owns transient gesture lifecycle only. It never validates domain semantics,
 * allocates identifiers, edits LikeC4 source, or records history.
 */
export interface CanvasIntentController {
  readonly snapshot: CanvasIntentControllerSnapshot
  startElementCreation(elementKind: ElementKind, parentId?: Fqn): void
  requestElementCreation(point: DiagramPoint): boolean
  startRelationCreation(): void
  selectRelationSource(sourceId: Fqn): void
  requestRelationCreation(targetId: Fqn): boolean
  selectionChanged(elementIds: readonly Fqn[]): void
  cancel(reason: CanvasCancellationReason): boolean
  handleKeyDown(key: string): boolean
  reset(): void
}

export function createCanvasIntentController(onCanvasIntent?: CanvasIntentHandler): CanvasIntentController {
  let snapshot: CanvasIntentControllerSnapshot = { interaction: 'idle' }
  let lastSelection: readonly Fqn[] = []

  const emit = (intent: CanvasIntent) => {
    onCanvasIntent?.(intent)
  }

  const controller: CanvasIntentController = {
    get snapshot() {
      return snapshot
    },

    startElementCreation(elementKind, parentId) {
      if (snapshot.interaction !== 'idle') {
        controller.cancel('tool-change')
      }
      snapshot = {
        interaction: 'element-create',
        elementKind,
        ...(parentId ? { parentId } : {}),
      }
    },

    requestElementCreation(point) {
      if (snapshot.interaction !== 'element-create') {
        return false
      }
      const { elementKind, parentId } = snapshot
      snapshot = { interaction: 'idle' }
      emit({
        type: 'element.create.requested',
        elementKind,
        ...(parentId ? { parentId } : {}),
        point,
      })
      return true
    },

    startRelationCreation() {
      if (snapshot.interaction !== 'idle') {
        controller.cancel('tool-change')
      }
      snapshot = { interaction: 'relation-create' }
    },

    selectRelationSource(sourceId) {
      if (snapshot.interaction !== 'relation-create') {
        return
      }
      snapshot = { interaction: 'relation-create', sourceId }
    },

    requestRelationCreation(targetId) {
      if (snapshot.interaction !== 'relation-create' || !snapshot.sourceId) {
        return false
      }
      const sourceId = snapshot.sourceId
      snapshot = { interaction: 'idle' }
      if (sourceId === targetId) {
        return false
      }
      emit({
        type: 'relation.create.requested',
        sourceId,
        targetId,
      })
      return true
    },

    selectionChanged(elementIds) {
      if (
        elementIds.length === lastSelection.length
        && elementIds.every((elementId, index) => elementId === lastSelection[index])
      ) {
        return
      }
      lastSelection = [...elementIds]
      emit({
        type: 'selection.changed',
        elementIds: lastSelection,
      })
    },

    cancel(reason) {
      if (snapshot.interaction === 'idle') {
        return false
      }
      const interaction = snapshot.interaction
      snapshot = { interaction: 'idle' }
      emit({
        type: 'interaction.cancelled',
        interaction,
        reason,
      })
      return true
    },

    handleKeyDown(key) {
      return key === 'Escape' ? controller.cancel('escape') : false
    },

    reset() {
      snapshot = { interaction: 'idle' }
    },
  }

  return controller
}
