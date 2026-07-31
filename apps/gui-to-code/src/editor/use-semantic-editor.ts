import type { ElementKind, Fqn, RelationId } from '@likec4/core/types'
import { createCanvasIntentController } from '@likec4/diagram'
import type {
  CanvasIntent,
  CanvasIntentController,
  DiagramApi,
} from '@likec4/diagram'
import type { KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { completeRelationConnection } from './canvas-relation-intents'
import type { RemovalDependencyReport } from './contracts'
import type { ElementFormValues } from './ui/element-form'
import {
  buildStructureTree,
  parentOptions,
  reconcileSelection,
  selectionAfterResult,
} from './ui/selection'
import type { EditorSelection } from './ui/selection'
import type { useWorkspaceRuntime } from './use-workspace-runtime'
import { workspaceDocumentUri } from './use-workspace-runtime'

export function useSemanticEditor(runtime: ReturnType<typeof useWorkspaceRuntime>) {
  const diagramApi = useRef<DiagramApi | null>(null)
  const removeInitiator = useRef<HTMLElement | null>(null)
  const [selection, setSelection] = useState<EditorSelection>(null)
  const [activeKind, setActiveKind] = useState<ElementKind | null>(null)
  const [relationActive, setRelationActive] = useState(false)
  const [relationSource, setRelationSource] = useState('')
  const [relationTarget, setRelationTarget] = useState('')
  const [inspectorError, setInspectorError] = useState<string | null>(null)
  const [removalReport, setRemovalReport] = useState<RemovalDependencyReport | null>(null)
  const intentHandler = useRef<(intent: CanvasIntent) => void>(() => undefined)
  const controller = useRef<CanvasIntentController | null>(null)

  if (!controller.current) {
    controller.current = createCanvasIntentController(intent => intentHandler.current(intent))
  }

  useEffect(() => {
    if (!runtime.state) return
    setSelection(previous => reconcileSelection(previous, runtime.state!))
  }, [runtime.state])

  const resetTools = (): void => {
    setActiveKind(null)
    setRelationActive(false)
    setRelationSource('')
    setRelationTarget('')
  }

  const resultError = (result: Awaited<ReturnType<typeof runtime.dispatchSemantic>>, fallback: string): void => {
    if (result?.status === 'conflict') {
      setInspectorError('Проект изменился. Повторите действие на актуальной версии.')
    } else if (result?.status === 'rejected') {
      setInspectorError(result.issues[0]?.message ?? fallback)
    } else {
      setInspectorError(null)
    }
  }

  const createElement = async (kind: ElementKind): Promise<void> => {
    const result = await runtime.dispatchSemantic({
      type: 'element.create',
      input: { kind, documentUri: workspaceDocumentUri },
    }, 'Не удалось создать элемент.')
    resetTools()
    if (result?.status === 'applied' && result.command === 'element.create') {
      setSelection({ type: 'element', id: result.createdElementId })
      runtime.setFeedback(`Создан элемент ${result.createdElementId}.`)
    }
  }

  const createRelation = async (sourceId: Fqn, targetId: Fqn): Promise<void> => {
    const result = await runtime.dispatchSemantic({
      type: 'relation.create',
      input: { sourceId, targetId, documentUri: workspaceDocumentUri },
    }, 'Не удалось создать связь.')
    resetTools()
    if (result?.status === 'applied' && result.command === 'relation.create') {
      runtime.setFeedback(relationFeedback(runtime, result.createdRelationId))
    }
  }

  const patchElement = async (values: ElementFormValues): Promise<void> => {
    if (!selection) return
    const result = await runtime.dispatchSemantic({
      type: 'element.patch',
      input: {
        id: selection.id,
        patch: {
          title: values.title,
          description: values.description,
          technology: values.technology,
          tags: values.tags,
        },
      },
    }, 'Не удалось сохранить свойства.')
    resultError(result, 'Не удалось сохранить свойства.')
    if (result?.status === 'applied') runtime.setFeedback('Свойства элемента сохранены.')
  }

  const renameElement = async (newId: string): Promise<void> => {
    if (!selection) return
    const result = await runtime.dispatchSemantic({
      type: 'element.rename',
      input: { id: selection.id, newId },
    }, 'Не удалось переименовать элемент.')
    resultError(result, 'Не удалось переименовать элемент.')
    if (result?.status === 'applied' && result.command === 'element.rename') {
      runtime.setFeedback(`Элемент переименован: ${result.updatedElementId}.`)
    }
  }

  const moveElement = async (parentId: Fqn | null): Promise<void> => {
    if (!selection) return
    const result = await runtime.dispatchSemantic({
      type: 'element.move',
      input: { id: selection.id, parentId },
    }, 'Не удалось переместить элемент.')
    resultError(result, 'Не удалось переместить элемент.')
    if (result?.status === 'applied' && result.command === 'element.move') {
      runtime.setFeedback(`Элемент перемещён: ${result.updatedElementId}.`)
    }
  }

  const inspectRemoval = async (): Promise<void> => {
    const current = runtime.workspace.current
    if (!current || !selection) return
    removeInitiator.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setInspectorError(null)
    const result = await current.inspectElementRemoval(selection.id, current.state.revision)
    runtime.refresh()
    if (result.status === 'ready') {
      setRemovalReport(result.report)
    } else if (result.status === 'conflict') {
      setInspectorError('Проект изменился. Проверьте удаление ещё раз.')
    } else {
      setInspectorError(result.issues[0]?.message ?? 'Не удалось проверить зависимости.')
    }
  }

  const closeRemoval = (): void => {
    setRemovalReport(null)
    queueMicrotask(() => removeInitiator.current?.focus())
  }

  const confirmRemoval = async (): Promise<void> => {
    const report = removalReport
    if (!report) return
    const result = await runtime.dispatchSemantic({
      type: 'element.remove',
      input: {
        id: report.target,
        dependencyRevision: report.revision,
        approvedDependencyIds: report.dependencies.map(dependency => dependency.id),
      },
    }, 'Не удалось удалить элемент.')
    resultError(result, 'Не удалось удалить элемент.')
    if (result?.status === 'applied') {
      setRemovalReport(null)
      runtime.setFeedback('Элемент и подтверждённые зависимости удалены.')
      queueMicrotask(() => {
        document.querySelector<HTMLElement>('.structure-item, .diagram-panel')?.focus()
      })
    }
  }

  intentHandler.current = intent => {
    switch (intent.type) {
      case 'element.create.requested':
        void createElement(intent.elementKind)
        return
      case 'relation.create.requested':
        void createRelation(intent.sourceId, intent.targetId)
        return
      case 'interaction.cancelled':
        resetTools()
        runtime.setFeedback(intent.interaction === 'relation-create' ? 'Создание связи отменено.' : null)
        return
      case 'selection.changed':
        return
    }
  }

  const activateCreateTool = (kind: ElementKind): void => {
    controller.current?.startElementCreation(kind)
    setActiveKind(kind)
    setRelationActive(false)
    runtime.setFeedback(null)
    runtime.setCommandError(null)
  }

  const activateRelationTool = (): void => {
    controller.current?.startRelationCreation()
    setActiveKind(null)
    setRelationActive(true)
    setRelationSource('')
    setRelationTarget('')
    runtime.setFeedback('Выберите исходный элемент.')
    runtime.setCommandError(null)
  }

  const completeRelation = (sourceId: string, targetId: string): void => {
    if (!controller.current || !sourceId) {
      runtime.setCommandError('Выберите исходный элемент.')
      return
    }
    if (!targetId) {
      runtime.setCommandError('Выберите целевой элемент.')
      return
    }
    const completed = completeRelationConnection(controller.current, sourceId as Fqn, targetId as Fqn)
    if (!completed && sourceId === targetId) runtime.setCommandError('Нельзя связать элемент с самим собой.')
  }

  const selectElement = (id: Fqn, focusDiagram = true): void => {
    setSelection({ type: 'element', id })
    setInspectorError(null)
    if (focusDiagram) diagramApi.current?.focusOnElement(id)
  }

  const updateDraftSource = (content: string): void => {
    runtime.updateDraftSource(content, next => {
      setSelection(previous => reconcileSelection(previous, next))
    })
  }

  const undo = async (): Promise<void> => {
    const result = await runtime.undo()
    resetTools()
    if (runtime.state && result) {
      setSelection(previous => selectionAfterResult(previous, result, runtime.state!))
    }
  }

  const redo = async (): Promise<void> => {
    const result = await runtime.redo()
    resetTools()
    if (runtime.state && result) {
      setSelection(previous => selectionAfterResult(previous, result, runtime.state!))
    }
  }

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      void (event.shiftKey ? redo() : undo())
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (removalReport) closeRemoval()
      else if (!controller.current?.handleKeyDown(event.key)) setSelection(null)
      return
    }
    if ((event.key === 'Delete' || event.key === 'Backspace') && selection && !isEditableTarget(event.target)) {
      event.preventDefault()
      void inspectRemoval()
      return
    }
    if (event.key === 'Enter' && selection && event.target instanceof HTMLElement) {
      const fromSelectedTreeItem = event.target.getAttribute('aria-current') === 'true'
      const fromCanvas = !!event.target.closest('.diagram-panel')
      if (fromSelectedTreeItem || fromCanvas) {
        event.preventDefault()
        document.getElementById('element-title')?.focus()
        return
      }
    }
    if ((event.key === 'Enter' || event.key === ' ') && activeKind && !isEditableTarget(event.target)) {
      event.preventDefault()
      controller.current?.requestElementCreation({ x: 0.5, y: 0.5 })
    }
  }

  const state = runtime.state
  const availableKinds = new Set(Object.keys(state?.lastValidModel?.$data.specification.elements ?? {}))
  const availableTags = Object.keys(state?.lastValidModel?.$data.specification.tags ?? {}).sort()
  const elements = Object.values(state?.lastValidModel?.$data.elements ?? {})
    .map(element => ({ id: element.id as Fqn, title: element.title }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const selectedModelElement = selection ? state?.lastValidModel?.$data.elements[selection.id] : undefined
  const selectedElement = selectedModelElement
    ? {
      id: selectedModelElement.id as Fqn,
      title: selectedModelElement.title,
      description: typeof selectedModelElement.description === 'string' ? selectedModelElement.description : null,
      technology: selectedModelElement.technology ?? null,
      tags: selectedModelElement.tags ?? [],
    }
    : null

  return {
    diagramApi,
    controller,
    selection,
    activeKind,
    relationActive,
    relationSource,
    relationTarget,
    inspectorError,
    removalReport,
    availableKinds,
    availableTags,
    elements,
    selectedElement,
    structure: state ? buildStructureTree(state) : [],
    parents: state && selection ? parentOptions(state, selection.id) : [],
    canvasDisabled: !state || state.compilation.status !== 'valid' || runtime.busy,
    setRelationSource,
    setRelationTarget,
    createElement,
    patchElement,
    renameElement,
    moveElement,
    inspectRemoval,
    closeRemoval,
    confirmRemoval,
    activateCreateTool,
    activateRelationTool,
    completeRelation,
    selectElement,
    updateDraftSource,
    undo,
    redo,
    handleEditorKeyDown,
  }
}

function relationFeedback(runtime: ReturnType<typeof useWorkspaceRuntime>, relationId: RelationId): string {
  const views = Object.values(runtime.state?.lastValidModel?.$data.views ?? {})
  if (views.length === 0) {
    return 'Связь создана в модели, но в проекте нет подходящего вида для отображения.'
  }
  const selectedView = views.find(view => view.id === runtime.selectedViewId)
    ?? views.find(view => view.id === 'index')
    ?? views[0]!
  return selectedView.edges.some(edge => edge.relations.includes(relationId))
    ? 'Связь создана.'
    : 'Связь создана в модели, но текущий вид её не отображает.'
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && target.matches('input, textarea, select, [contenteditable="true"]')
}
