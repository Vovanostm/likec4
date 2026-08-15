import type { ElementKind, Fqn, RelationId, ViewId } from '@likec4/core/types'
import { useEffect, useMemo, useRef, useState } from 'react'
import type { CanvasPosition } from './contracts'
import type { useWorkspaceRuntime } from './use-workspace-runtime'

export type CanvasEntityRef =
  | { readonly family: 'logical-element'; readonly id: Fqn }
  | { readonly family: 'logical-relation'; readonly viewId: ViewId; readonly revision: number; readonly id: RelationId }
  | { readonly family: 'dynamic-step'; readonly viewId: ViewId; readonly revision: number; readonly id: string }
  | { readonly family: 'deployment-element'; readonly id: Fqn }
  | { readonly family: 'deployment-relation'; readonly viewId: ViewId; readonly revision: number; readonly id: RelationId }

export interface EditableEdgeDetails {
  readonly id: string
  readonly title: string
  readonly sourceId: string
  readonly targetId: string
}

export interface CanvasCreationRequest {
  readonly kind: ElementKind
  readonly title?: string
}

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
type EdgeSelection = Extract<CanvasEntityRef, {
  family: 'logical-relation' | 'dynamic-step' | 'deployment-relation'
}>

export function useCanvasEntityEditor(
  runtime: Runtime,
  onElementSelected: (id: Fqn | null) => void,
  onElementCreated: (id: Fqn) => void,
) {
  const [selection, setSelection] = useState<CanvasEntityRef | null>(null)
  const [relationAlternatives, setRelationAlternatives] = useState<readonly RelationId[]>([])
  const [pendingCreation, setPendingCreation] = useState<PendingCanvasCreation | null>(null)
  const [inlineTitle, setInlineTitle] = useState<InlineTitleEdit | null>(null)
  const onElementSelectedRef = useRef(onElementSelected)
  onElementSelectedRef.current = onElementSelected

  useEffect(() => {
    setSelection(null)
    setRelationAlternatives([])
    setPendingCreation(null)
    setInlineTitle(null)
    onElementSelectedRef.current(null)
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
    if (selection.family === 'dynamic-step' && !findDynamicEdge(runtime.state.lastValidModel.$data.views[selection.viewId], selection.id)) {
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
    const state = runtime.state
    const model = state?.lastValidModel
    if (!view || !state || !model) return
    const ids = edgeRelationIds(edge)
    if (view._type === 'element') {
      const logical = ids.filter(id => !!model.$data.relations[id as RelationId]) as RelationId[]
      const fallback = edgeId(edge)
      if (logical.length === 0 && fallback && model.$data.relations[fallback as RelationId]) {
        logical.push(fallback as RelationId)
      }
      if (logical.length === 0) {
        runtime.setCommandError('Не удалось определить исходную логическую связь для выбранной связи.')
        return
      }
      onElementSelected(null)
      setSelection({
        family: 'logical-relation',
        viewId: view.id,
        revision: state.revision,
        id: logical[0]!,
      })
      setRelationAlternatives(logical)
      return
    }
    if (view._type === 'deployment') {
      const deployment = ids.find(id => !!model.$data.deployments.relations[id as RelationId]) ?? edgeId(edge)
      if (!deployment || !model.$data.deployments.relations[deployment as RelationId]) {
        runtime.setCommandError('Не удалось определить связь развёртывания для выбранной связи.')
        return
      }
      onElementSelected(null)
      setSelection({
        family: 'deployment-relation',
        viewId: view.id,
        revision: state.revision,
        id: deployment as RelationId,
      })
      setRelationAlternatives([])
      return
    }
    const id = edgeId(edge)
    if (!id) {
      runtime.setCommandError('Не удалось определить направленный шаг для выбранной связи.')
      return
    }
    onElementSelected(null)
    setSelection({ family: 'dynamic-step', viewId: view.id, revision: state.revision, id })
    setRelationAlternatives([])
  }

  const selectRelationAlternative = (id: RelationId): void => {
    const captured = selection
    if (captured?.family !== 'logical-relation' || !relationAlternatives.includes(id)) return
    setSelection({ ...captured, id })
  }

  const selectedLogicalRelation = useMemo((): EditableEdgeDetails | null => {
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

  const selectedDynamicStep = useMemo((): EditableEdgeDetails | null => {
    if (selection?.family !== 'dynamic-step') return null
    const view = runtime.state?.lastValidModel?.$data.views[selection.viewId]
    const edge = findDynamicEdge(view, selection.id)
    if (!edge) return null
    return {
      id: selection.id,
      title: typeof edge['label'] === 'string' ? edge['label'] : '',
      sourceId: dynamicEndpoint(view, edge['source']),
      targetId: dynamicEndpoint(view, edge['target']),
    }
  }, [runtime.state?.revision, selection])

  const selectedDeploymentRelation = useMemo((): EditableEdgeDetails | null => {
    if (selection?.family !== 'deployment-relation') return null
    const relation = runtime.state?.lastValidModel?.$data.deployments.relations[selection.id]
    if (!relation) return null
    return {
      id: selection.id,
      title: relation.title ?? '',
      sourceId: deploymentEndpoint(relation.source),
      targetId: deploymentEndpoint(relation.target),
    }
  }, [runtime.state?.revision, selection])

  const patchSelectedRelation = async (title: string): Promise<boolean> => {
    const captured = selection
    if (captured?.family !== 'logical-relation') return false
    if (!edgeCaptureIsCurrent(runtime, captured)) return staleEdgeAction(runtime)
    const result = await runtime.dispatchSemantic({
      type: 'relation.patch',
      input: { id: captured.id, patch: { title } },
    }, 'Не удалось изменить связь.')
    if (result?.status === 'applied' && result.command === 'relation.patch') {
      const revision = runtime.workspace.current?.state.revision ?? result.revision
      setSelection({
        family: 'logical-relation',
        viewId: captured.viewId,
        revision,
        id: result.updatedRelationId,
      })
      setRelationAlternatives(current => current.map(id => id === captured.id ? result.updatedRelationId : id))
      runtime.setFeedback('Название связи обновлено.')
      return true
    }
    return false
  }

  const removeSelectedRelation = async (): Promise<boolean> => {
    const captured = selection
    if (captured?.family !== 'logical-relation') return false
    if (!edgeCaptureIsCurrent(runtime, captured)) return staleEdgeAction(runtime)
    const result = await runtime.dispatchSemantic({
      type: 'relation.remove',
      input: { id: captured.id },
    }, 'Не удалось удалить связь.')
    if (result?.status === 'applied' && result.command === 'relation.remove') {
      setSelection(null)
      setRelationAlternatives([])
      runtime.setFeedback('Связь удалена.')
      return true
    }
    return false
  }

  const patchSelectedDynamicStep = async (title: string): Promise<boolean> => {
    const captured = selection
    if (captured?.family !== 'dynamic-step') return false
    if (!edgeCaptureIsCurrent(runtime, captured)) return staleEdgeAction(runtime)
    const result = await runtime.dispatchSemantic({
      type: 'dynamicStep.patch',
      input: { viewId: captured.viewId, id: captured.id, patch: { title } },
    }, 'Не удалось изменить направленный шаг.')
    if (result?.status === 'applied' && result.command === 'dynamicStep.patch') {
      const revision = runtime.workspace.current?.state.revision ?? result.revision
      setSelection({
        family: 'dynamic-step',
        viewId: result.viewId,
        revision,
        id: result.updatedStepId,
      })
      runtime.setFeedback('Название направленного шага обновлено.')
      return true
    }
    return false
  }

  const removeSelectedDynamicStep = async (): Promise<boolean> => {
    const captured = selection
    if (captured?.family !== 'dynamic-step') return false
    if (!edgeCaptureIsCurrent(runtime, captured)) return staleEdgeAction(runtime)
    const result = await runtime.dispatchSemantic({
      type: 'dynamicStep.remove',
      input: { viewId: captured.viewId, id: captured.id },
    }, 'Не удалось удалить направленный шаг.')
    if (result?.status === 'applied' && result.command === 'dynamicStep.remove') {
      clearSelection()
      runtime.setFeedback('Направленный шаг удалён.')
      return true
    }
    return false
  }

  const patchSelectedDeploymentRelation = async (title: string): Promise<boolean> => {
    const captured = selection
    if (captured?.family !== 'deployment-relation') return false
    if (!edgeCaptureIsCurrent(runtime, captured)) return staleEdgeAction(runtime)
    const result = await runtime.dispatchSemantic({
      type: 'deploymentRelation.patch',
      input: { id: captured.id, patch: { title } },
    }, 'Не удалось изменить связь развёртывания.')
    if (result?.status === 'applied' && result.command === 'deploymentRelation.patch') {
      const revision = runtime.workspace.current?.state.revision ?? result.revision
      setSelection({
        family: 'deployment-relation',
        viewId: captured.viewId,
        revision,
        id: result.updatedRelationId,
      })
      runtime.setFeedback('Название связи развёртывания обновлено.')
      return true
    }
    return false
  }

  const removeSelectedDeploymentRelation = async (): Promise<boolean> => {
    const captured = selection
    if (captured?.family !== 'deployment-relation') return false
    if (!edgeCaptureIsCurrent(runtime, captured)) return staleEdgeAction(runtime)
    const result = await runtime.dispatchSemantic({
      type: 'deploymentRelation.remove',
      input: { id: captured.id },
    }, 'Не удалось удалить связь развёртывания.')
    if (result?.status === 'applied' && result.command === 'deploymentRelation.remove') {
      clearSelection()
      runtime.setFeedback('Связь развёртывания удалена.')
      return true
    }
    return false
  }

  const captureCreation = (
    position: CanvasPosition,
    screenPosition: CanvasPosition,
    sourceId: Fqn | null = null,
  ): PendingCanvasCreation | null => {
    const state = runtime.state
    const view = runtime.selectedView
    if (!state || !view || view._type !== 'element' || state.compilation.status !== 'valid' || runtime.busy) {
      runtime.setCommandError('Создание элемента сейчас недоступно.')
      return null
    }
    return {
      viewId: view.id,
      revision: state.revision,
      position,
      screenPosition,
      sourceId,
    }
  }

  const requestCreation = (
    position: CanvasPosition,
    screenPosition: CanvasPosition,
    sourceId: Fqn | null = null,
  ): void => {
    const captured = captureCreation(position, screenPosition, sourceId)
    if (captured) setPendingCreation(captured)
  }

  const executeCreation = async (
    pending: PendingCanvasCreation,
    request: CanvasCreationRequest,
  ): Promise<boolean> => {
    const state = runtime.state
    if (!state) return false
    if (state.revision !== pending.revision || runtime.selectedViewId !== pending.viewId) {
      setPendingCreation(null)
      runtime.setCommandError('Рабочее пространство или текущий вид изменились. Повторите создание.')
      return false
    }
    const title = request.title?.trim()
    if (pending.sourceId && !title) {
      runtime.setCommandError('Введите название нового элемента.')
      return false
    }
    const result = await runtime.dispatchSemantic(pending.sourceId
      ? {
        type: 'element.createConnected',
        input: {
          sourceId: pending.sourceId,
          kind: request.kind,
          ...(title ? { title } : {}),
          viewId: pending.viewId,
          position: pending.position,
        },
      }
      : {
        type: 'element.createAt',
        input: {
          kind: request.kind,
          viewId: pending.viewId,
          position: pending.position,
        },
      }, pending.sourceId ? 'Не удалось создать элемент со связью.' : 'Не удалось создать элемент на холсте.')
    if (result?.status === 'applied'
      && (result.command === 'element.createAt' || result.command === 'element.createConnected')) {
      setPendingCreation(null)
      runtime.setLayoutMode('manual')
      onElementCreated(result.createdElementId)
      if (pending.sourceId) {
        setInlineTitle(null)
        runtime.setFeedback('Элемент, название, связь и позиция созданы одной операцией.')
      } else {
        const element = runtime.workspace.current?.state.lastValidModel?.$data.elements[result.createdElementId]
        setInlineTitle({
          id: result.createdElementId,
          value: element?.title ?? result.createdElementId,
          screenPosition: pending.screenPosition,
        })
        runtime.setFeedback('Элемент создан в выбранной позиции.')
      }
      return true
    }
    return false
  }

  const createPendingElement = async (request: CanvasCreationRequest): Promise<boolean> => {
    return pendingCreation ? executeCreation(pendingCreation, request) : false
  }

  const createElementAt = async (
    kind: ElementKind,
    position: CanvasPosition,
    screenPosition: CanvasPosition,
  ): Promise<boolean> => {
    const pending = captureCreation(position, screenPosition)
    return pending ? executeCreation(pending, { kind }) : false
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
    onElementSelected(null)
  }

  return {
    selection,
    relationAlternatives,
    selectedLogicalRelation,
    selectedDynamicStep,
    selectedDeploymentRelation,
    pendingCreation,
    inlineTitle,
    selectElement,
    selectEdge,
    selectRelationAlternative,
    patchSelectedRelation,
    removeSelectedRelation,
    patchSelectedDynamicStep,
    removeSelectedDynamicStep,
    patchSelectedDeploymentRelation,
    removeSelectedDeploymentRelation,
    requestCreation,
    createPendingElement,
    createElementAt,
    cancelCreation,
    startInlineTitle,
    updateInlineTitle,
    saveInlineTitle,
    cancelInlineTitle,
    clearSelection,
  }
}

export function edgeSelectionContextIsCurrent(
  selection: { readonly revision: number; readonly viewId: ViewId },
  revision: number,
  viewId: ViewId | null,
): boolean {
  return selection.revision === revision && selection.viewId === viewId
}

function edgeCaptureIsCurrent(runtime: Runtime, selection: EdgeSelection): boolean {
  const current = runtime.workspace.current?.state
  return !!current && edgeSelectionContextIsCurrent(selection, current.revision, runtime.selectedViewId)
}

function staleEdgeAction(runtime: Runtime): false {
  runtime.setCommandError('Рабочее пространство или текущий вид изменились. Выберите связь заново.')
  return false
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

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' ? value as Record<string, unknown> : null
}

function findDynamicEdge(view: unknown, id: string): Record<string, unknown> | null {
  const candidate = record(view)
  const edges = candidate?.['edges']
  if (!Array.isArray(edges)) return null
  return edges.map(record).find(edge => edge?.['id'] === id) ?? null
}

function dynamicEndpoint(view: unknown, nodeId: unknown): string {
  if (typeof nodeId !== 'string') return 'Неизвестная сущность'
  const candidate = record(view)
  const nodes = candidate?.['nodes']
  if (!Array.isArray(nodes)) return nodeId
  const node = nodes.map(record).find(item => item?.['id'] === nodeId)
  return typeof node?.['modelRef'] === 'string'
    ? node['modelRef']
    : typeof node?.['title'] === 'string'
    ? node['title']
    : nodeId
}

function deploymentEndpoint(reference: unknown): string {
  if (typeof reference === 'string') return reference
  const candidate = record(reference)
  return typeof candidate?.['deployment'] === 'string' ? candidate['deployment'] : 'Неизвестная сущность'
}

function localEndpoint(reference: { readonly model: string; readonly project?: string }): Fqn {
  return (reference.project ? `@${reference.project}.${reference.model}` : reference.model) as Fqn
}
