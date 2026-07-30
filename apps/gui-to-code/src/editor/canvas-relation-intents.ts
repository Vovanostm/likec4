import type { Fqn } from '@likec4/core/types'
import type { CanvasIntentController } from '@likec4/diagram'

export function completeRelationConnection(
  controller: CanvasIntentController,
  sourceId: Fqn,
  targetId: Fqn,
): boolean {
  if (controller.snapshot.interaction !== 'relation-create') {
    return false
  }
  controller.selectRelationSource(sourceId)
  return controller.requestRelationCreation(targetId)
}
