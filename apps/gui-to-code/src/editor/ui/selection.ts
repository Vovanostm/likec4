import type { Fqn } from '@likec4/core/types'
import type { CommandResult, EditorWorkspaceState } from '../contracts'

export type EditorSelection = { readonly type: 'element'; readonly id: Fqn } | null

export interface StructureNode {
  readonly id: Fqn
  readonly title: string
  readonly children: readonly StructureNode[]
}

export function buildStructureTree(state: EditorWorkspaceState): readonly StructureNode[] {
  const elements = Object.values(state.lastValidModel?.$data.elements ?? {})
  const byParent = new Map<string | null, typeof elements>()
  for (const element of elements) {
    const id = element.id as Fqn
    const index = id.lastIndexOf('.')
    const parent = index < 0 ? null : id.slice(0, index)
    const children = byParent.get(parent) ?? []
    children.push(element)
    byParent.set(parent, children)
  }
  const visit = (parent: string | null): StructureNode[] => {
    return (byParent.get(parent) ?? [])
      .sort((left, right) => left.id.localeCompare(right.id))
      .map(element => ({
        id: element.id as Fqn,
        title: element.title,
        children: visit(element.id),
      }))
  }
  return visit(null)
}

export function parentOptions(state: EditorWorkspaceState, target: Fqn): readonly { readonly id: Fqn; readonly title: string }[] {
  return Object.values(state.lastValidModel?.$data.elements ?? {})
    .filter(element => element.id !== target && !element.id.startsWith(`${target}.`))
    .map(element => ({ id: element.id as Fqn, title: element.title }))
    .sort((left, right) => left.id.localeCompare(right.id))
}

export function reconcileSelection(selection: EditorSelection, state: EditorWorkspaceState): EditorSelection {
  if (!selection) return null
  return state.lastValidModel?.$data.elements[selection.id] ? selection : null
}

export function selectionAfterResult(
  selection: EditorSelection,
  result: CommandResult,
  state: EditorWorkspaceState,
): EditorSelection {
  if (result.status !== 'applied') return reconcileSelection(selection, state)
  switch (result.command) {
    case 'element.rename':
    case 'element.move':
    case 'element.patch':
      return { type: 'element', id: result.updatedElementId }
    case 'element.createAt':
    case 'element.createConnected':
      return { type: 'element', id: result.createdElementId }
    case 'element.remove':
      return null
    case 'element.create':
    case 'relation.create':
    case 'relation.patch':
    case 'relation.remove':
    case 'view.create':
    case 'dynamicView.create':
    case 'dynamicStep.create':
    case 'dynamicStep.patch':
    case 'dynamicStep.remove':
    case 'deploymentView.create':
    case 'deploymentElement.create':
    case 'deploymentRelation.create':
    case 'deploymentRelation.patch':
    case 'deploymentRelation.remove':
    case 'layout.save':
    case 'layout.reset':
    case 'history.undo':
    case 'history.redo':
      return reconcileSelection(selection, state)
  }
}

export function localId(id: Fqn): string {
  return id.slice(id.lastIndexOf('.') + 1)
}

export function currentParent(id: Fqn): Fqn | null {
  const index = id.lastIndexOf('.')
  return index < 0 ? null : id.slice(0, index) as Fqn
}
