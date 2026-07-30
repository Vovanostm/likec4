import type { CanvasIntent } from '@likec4/diagram'
import {
  applyDocumentTextEdits,
  type SourceEditPlan,
} from '@likec4/language-services'

export type EditorCommandCandidate =
  | {
    readonly type: 'element.create'
    readonly elementKind: string
    readonly parentId?: string
    readonly point: { readonly x: number; readonly y: number }
  }
  | {
    readonly type: 'relation.create'
    readonly sourceId: string
    readonly targetId: string
  }
  | {
    readonly type: 'selection.change'
    readonly elementIds: readonly string[]
  }
  | {
    readonly type: 'interaction.cancel'
    readonly interaction: string
    readonly reason: string
  }

/**
 * WP-01 compile proof only. Product command validation and execution belong to WP-02.
 */
export function canvasIntentToCommandCandidate(intent: CanvasIntent): EditorCommandCandidate {
  switch (intent.type) {
    case 'element.create.requested':
      return {
        type: 'element.create',
        elementKind: intent.elementKind,
        ...(intent.parentId ? { parentId: intent.parentId } : {}),
        point: intent.point,
      }
    case 'relation.create.requested':
      return {
        type: 'relation.create',
        sourceId: intent.sourceId,
        targetId: intent.targetId,
      }
    case 'selection.changed':
      return {
        type: 'selection.change',
        elementIds: intent.elementIds,
      }
    case 'interaction.cancelled':
      return {
        type: 'interaction.cancel',
        interaction: intent.interaction,
        reason: intent.reason,
      }
  }
}

/** Apply one document from a revision-bound plan to an in-memory candidate source. */
export function applyPlanToCandidate(source: string, documentUri: string, plan: SourceEditPlan): string {
  const expectedRevision = plan.baseRevisions[documentUri]
  if (!expectedRevision) {
    throw new Error(`Edit plan does not contain document ${documentUri}`)
  }
  return applyDocumentTextEdits(
    source,
    plan.edits.filter(edit => edit.uri === documentUri),
    expectedRevision,
  )
}
