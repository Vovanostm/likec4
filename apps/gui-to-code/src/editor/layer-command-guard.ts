import type { Fqn } from '@likec4/core/types'
import { FqnRef } from '@likec4/core/types'
import type { EditorCommand, EditorWorkspaceState } from './contracts'

/** Protect direct edits, subtree changes, and their incident relationship side effects. */
export function layerCommandDisabledReason(
  command: EditorCommand,
  model: EditorWorkspaceState['lastValidModel'],
  lockedIds: ReadonlySet<Fqn>,
): string | null {
  if (command.type === 'view.create') return null
  const ids = Object.entries(command.input).filter(([key]) => ['id', 'sourceId', 'targetId', 'parentId'].includes(key))
    .map(([, value]) => value)
  if (command.type === 'element.createAt' || command.type === 'element.createConnected') {
    const view = model?.$data.views[command.input.viewId]
    if (view?._type === 'element' && view.viewOf) ids.push(view.viewOf)
  }
  const changesSubtree = ['element.remove', 'element.rename', 'element.move'].includes(command.type)
  if ('id' in command.input && typeof command.input.id === 'string') {
    const id = command.input.id
    const inSubtree = (endpoint: string): boolean => endpoint === id || endpoint.startsWith(`${id}.`)
    for (const relation of Object.values(model?.$data.relations ?? {})) {
      const source = FqnRef.isElementRef(relation.source) ? relation.source.model : null
      const target = FqnRef.isElementRef(relation.target) ? relation.target.model : null
      if (relation.id === id || (changesSubtree && ((source && inSubtree(source)) || (target && inSubtree(target))))) {
        ids.push(source, target)
      }
    }
  }
  return ids.some(id =>
      typeof id === 'string'
      && [...lockedIds].some(locked => locked === id || (changesSubtree && locked.startsWith(`${id}.`)))
    )
    ? 'Элемент заблокирован в слоях. Разблокируйте его перед редактированием.'
    : null
}
