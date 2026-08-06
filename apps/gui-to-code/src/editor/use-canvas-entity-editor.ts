import type { ElementKind, Fqn, RelationId, ViewId } from '@likec4/core/types'
import { useEffect, useMemo, useState } from 'react'
import type { CanvasPosition } from './contracts'
import type { useWorkspaceRuntime } from './use-workspace-runtime'

export type CanvasEntityRef =
  | { readonly family: 'logical-element'; readonly id: Fqn }
  | { readonly family: 'logical-relation'; readonly id: RelationId }
  | { readonly family: 'dynamic-step'; readonly viewId: ViewId; readonly id: string }
  | { readonly family: 'deployment-element'; readonly id: Fqn }
  | { readonly family: 'deployment-relation'; readonly id: RelationId }

interface PendingCanvasCreation {
  readonly viewId: ViewId
  readonly revision: number
  readonly position: CanvasPosition
  readonly screenPosition: CanvasPosition
  readonly sourceId: Fqn | null
}

interface InlineTitleEdit {
  readonly id: Fqn
  readonly screenPosition: CanvasPosition | null
  readonly value: string
}

type Runtime = ReturnType<typeof useWorkspaceRuntime>

export function useCanvasEntityEditor(
  runtime: Runtime,
  onElementSelected: (id: Fqn) => void,
  onElementCreated: (id: Fqn) => void,
) {
  const [selection, setSelection] = useState<CanvasEntityRef | null>(null)
  const [relationAlternatives, setRelationAlternatives] = useState<readonly RelationId[]>([])
  const [pendingCreation, setPendingCreation] = useState<PendingCanvasCreation | null>(null)
  const [inlineTitle, setInlineTitle] = useState<InlineTitleEdit | null>(null)

  useEffect(() => {
    setSelection(null)
    setRelationAlternatives([])
    setPendingCreation(null)
    setInlineTitle(null)
  }, [runtime.selectedViewId])

  useEffect(() => {
    if (!selection || !runtime.state?.lastValidModel) return
    if (selection.family === 'logical-relation'
      && !runtime.state.lastValidModel.$data.relations[selection.id]) {
      setSelection(null)
      setRelationAlternatives([])
    }
    if (selection.family === 'deployment-relation'
      && !runtime.state.lastValidModel.$data.deployments.relations[selection.id]) {
      setSelection(null)
    }
  }, [runtime.state?.revision, selection])

  const selectElement = (id: Fqn): void => {
    setSelection({ family: 'logical-element', id })
    setRelationAlternatives([])
    onElementSelected(id)
  }

  const selectEdge = (edge: unknown): void => {
    const view = runtime.selectedView
    const model = runtime.state?.lastValidModel
    if (!view || !model) return
    const ids = edgeRelationIds(edge)
    if (view._type === 'element') {
      const logical = ids.filter(id => !!model.$data.relations[id as RelationId]) as RelationId[]
      const fallback = edgeId(edge)
      if (logical.length === 0 && fallback && model.$data.relations[fallback as RelationId]) {
        logical.push(fallback as RelationId)
      }
      if (logical.length === 0) {
        runtime.setCommandError('Не удалось определить исходную logical relation для выбранной связи.')
        return
      }
      setSelection({ family: 'logical-relation', id: logical[0]! })
      setRelationAlternatives(logical)
      return
    }
    if (view._type === 'deployment') {
      const deployment = ids.find(id => !!model.$data.deployments.relations[id as RelationId]) ?? edgeId(edge)
      if (!deployment || !model.$data.deployments.relations[deployment as RelationId]) {
        runtime.setCommandError('Не удалось определить deployment relation для выбранной связи.')
        return
      }
      setSelection({ family: 'deployment-relation', id: deployment as RelationId })
      setRelationAlternatives([])
      return
    }
    const id = edgeId(edge)
    if (!id) {
      runtime.setCommandError('Не удалось определить dynamic step для выбранной связи.')
      return
    }
    setSelection({ family: 'dynamic-step', viewId: view.id, id })
    setRelationAlternatives([])
  }

  const selectRelationAlternative = (id: RelationId): void => {
    if (!relationAlternatives.includes(id)) return
    setSelection({ family: 'logical-relation', id })
  }

  const selectedLogicalRelation = useMemo(() => {
    if (selection?.family !== 'logical-relation') return null
    const relation = runtime.state?.lastValidModel?.$data.relations[selection.id]
    if (!relation) return null
    return {
      id: selection.id,
      title: relation.title ?? '',
      sourceId: localEndpoint(relation.source),
      targetId: localEndpoint(relation.target),
    }
  }, [runtime.state?.revision, selection])

  const patchSelectedRelation = async (title: string): Promise<boolean> => {
    if (selection?.family !== 'logical-relation') return false
    const result = await runtime.dispatchSemantic({
      type: 'relation.patch',
      input: { id: selection.id, patch: { title } },
    }, 'Не удалось изменить связь.')
    if (result?.status === 'applied' && result.command === 'relation.patch') {
      setSelection({ family: 'logical-relation', id: result.updatedRelationId })
      setRelationAlternatives(current => current.map(id => id === selection.id ? result.updatedRelationId : id))
      runtime.setFeedback('Название связи обновлено.')
      return true
    }
    return false
  }

  const removeSelectedRelation = async (): Promise<boolean> => {
    if (selection?.family !== 'logical-relation') return false
    const result = await runtime.dispatchSemantic({
      type: 'relation.remove',
      input: { id: selection.id },
    }, 'Не удалось удалить связь.')
    if (result?.status === 'applied' && result.command === 'relation.remove') {
      setSelection(null)
      setRelationAlternatives([])
      runtime.setFeedback('Связь удалена.')
      return true
    }
    return false
  }

  const requestCreation = (
    position: CanvasPosition,
    screenPosition: CanvasPosition,
    sourceId: Fqn | null = null,
  ): void => {
    const state = runtime.state
    const view = runtime.selectedView
    if (!state || !view || view._type !== 'element' || state.compilation.status !== 'valid' || runtime.busy) {
      runtime.setCommandError('Создание элемента сейчас недоступно.')
      return
    }
    setPendingCreation({
      viewId: view.id,
      revision: state.revision,
      position,
      screenPosition,
      sourceId,
    })
  }

  const createPendingElement = async (kind: ElementKind): Promise<boolean> => {
    const pending = pendingCreation
    const state = runtime.state
    if (!pending || !state) return false
    if (state.revision !== pending.revision || runtime.selectedViewId !== pending.viewId) {
      setPendingCreation(null)
      runtime.setCommandError('Рабочее пространство или текущий вид изменились. Повторите создание.')
      return false
    }
    const result = await runtime.dispatchSemantic(pending.sourceId
      ? {
        type: 'element.createConnected',
        input: {
          sourceId: pending.sourceId,
          kind,
          viewId: pending.viewId,
          position: pending.position,
        },
      }
      : {
        type: 'element.createAt',
        input: {
          kind,
          viewId: pending.viewId,
          position: pending.position,
        },
      }, pending.sourceId ? 'Не удалось создать элемент со связью.' : 'Не удалось создать элемент на холсте.')
    if (result?.status === 'applied'
      && (result.command === 'element.createAt' || result.command === 'element.createConnected')) {
      setPendingCreation(null)
      runtime.setLayoutMode('manual')
      onElementCreated(result.createdElementId)
      const element = runtime.workspace.current?.state.lastValidModel?.$data.elements[result.createdElementId]
      setInlineTitle({
        id: result.createdElementId,
        value: element?.title ?? result.createdElementId,
        screenPosition: pending.screenPosition,
      })
      runtime.setFeedback(pending.sourceId
        ? 'Элемент, связь и позиция созданы одной операцией.'
        : 'Элемент создан в выбранной позиции.')
      return true
    }
    return false
  }

  const startInlineTitle = (id: Fqn, screenPosition: CanvasPosition | null = null): void => {
    const element = runtime.state?.lastValidModel?.$data.elements[id]
    if (!element) return
    selectElement(id)
    setInlineTitle({ id, value: element.title, screenPosition })
  }

  const updateInlineTitle = (value: string): void => {
    setInlineTitle(current => current ? { ...current, value } : null)
  }

  const saveInlineTitle = async (): Promise<boolean> => {
    const edit = inlineTitle
    if (!edit) return false
    const result = await runtime.dispatchSemantic({
      type: 'element.patch',
      input: { id: edit.id, patch: { title: edit.value } },
    }, 'Не удалось изменить название элемента.')
    if (result?.status === 'applied' && result.command === 'element.patch') {
      setInlineTitle(null)
      runtime.setFeedback('Название элемента обновлено.')
      return true
    }
    return false
  }

  const cancelInlineTitle = (): void => setInlineTitle(null)
  const cancelCreation = (): void => setPendingCreation(null)
  const clearSelection = (): void => {
    setSelection(null)
    setRelationAlternatives([])
  }

  return {
    selection,
    relationAlternatives,
    selectedLogicalRelation,
    pendingCreation,
    inlineTitle,
    selectElement,
    selectEdge,
    selectRelationAlternative,
    patchSelectedRelation,
    removeSelectedRelation,
    requestCreation,
    createPendingElement,
    cancelCreation,
    startInlineTitle,
    updateInlineTitle,
    saveInlineTitle,
    cancelInlineTitle,
    clearSelection,
  }
}

function edgeRelationIds(edge: unknown): string[] {
  if (!edge || typeof edge !== 'object' || !('relations' in edge)) return []
  const relations = (edge as { readonly relations?: unknown }).relations
  return Array.isArray(relations) ? relations.filter((id): id is string => typeof id === 'string') : []
}

function edgeId(edge: unknown): string | null {
  if (!edge || typeof edge !== 'object' || !('id' in edge)) return null
  const id = (edge as { readonly id?: unknown }).id
  return typeof id === 'string' ? id : null
}

function localEndpoint(reference: { readonly model: string; readonly project?: string }): Fqn {
  return (reference.project ? `@${reference.project}.${reference.model}` : reference.model) as Fqn
}
