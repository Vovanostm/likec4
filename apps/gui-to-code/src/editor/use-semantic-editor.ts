import type { ElementKind, Fqn, RelationId, ViewId } from '@likec4/core/types'
import { flattenMarkdownOrString } from '@likec4/core/types'
import { createCanvasIntentController } from '@likec4/diagram'
import type {
  CanvasIntent,
  CanvasIntentController,
  DiagramApi,
} from '@likec4/diagram'
import type {
  Dispatch,
  MutableRefObject,
  SetStateAction,
} from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { completeRelationConnection } from './canvas-relation-intents'
import type { RemovalDependencyReport } from './contracts'
import { patchFromForm } from './ui/element-form'
import type { ElementFormValues } from './ui/element-form'
import {
  buildStructureTree,
  parentOptions,
  reconcileSelection,
  selectionAfterResult,
} from './ui/selection'
import type { EditorSelection, StructureNode } from './ui/selection'
import type { useWorkspaceRuntime } from './use-workspace-runtime'
import type { EditorWorkspace } from './workspace'

type WorkspaceRuntime = ReturnType<typeof useWorkspaceRuntime>

export interface FirstDiagramCreation {
  readonly id: Fqn
  readonly viewId: ViewId
  readonly workspace: EditorWorkspace
  readonly revision: number
}

export interface SemanticElementSelection {
  readonly id: Fqn
  readonly title: string
  readonly description: string | null
  readonly technology: string | null
  readonly icon: string | null
  readonly tags: readonly string[]
}

export interface SemanticEditorRuntime {
  readonly diagramApi: MutableRefObject<DiagramApi | null>
  readonly controller: MutableRefObject<CanvasIntentController | null>
  readonly selection: EditorSelection
  readonly activeKind: ElementKind | null
  readonly relationActive: boolean
  readonly relationSource: string
  readonly relationTarget: string
  readonly inspectorError: string | null
  readonly removalReport: RemovalDependencyReport | null
  readonly availableKinds: ReadonlySet<string>
  readonly kindTitles: ReadonlyMap<string, string>
  readonly availableTags: readonly string[]
  readonly elements: readonly { readonly id: Fqn; readonly title: string }[]
  readonly selectedElement: SemanticElementSelection | null
  readonly structure: readonly StructureNode[]
  readonly parents: readonly { readonly id: Fqn; readonly title: string }[]
  readonly canvasDisabled: boolean
  readonly setRelationSource: Dispatch<SetStateAction<string>>
  readonly setRelationTarget: Dispatch<SetStateAction<string>>
  readonly createElement: (kind: ElementKind) => Promise<void>
  readonly createChildElement: (parentId: Fqn, kind: ElementKind) => Promise<Fqn | null>
  readonly createFirstDiagram: (kind: ElementKind) => Promise<FirstDiagramCreation | null>
  readonly patchElement: (values: ElementFormValues) => Promise<boolean>
  readonly renameElement: (newId: string) => Promise<boolean>
  readonly moveElement: (parentId: Fqn | null) => Promise<boolean>
  readonly inspectRemoval: () => Promise<void>
  readonly closeRemoval: () => void
  readonly confirmRemoval: () => Promise<boolean>
  readonly activateCreateTool: (kind: ElementKind) => void
  readonly activateRelationTool: () => void
  readonly completeRelation: (sourceId: string, targetId: string) => void
  readonly selectElement: (id: Fqn | null, focusDiagram?: boolean) => void
  readonly updateDraftSource: (content: string) => void
  readonly undo: () => Promise<void>
  readonly redo: () => Promise<void>
  readonly goToHistory: (index: number, expectedRevision: number) => Promise<void>
  readonly cancelTools: () => void
}

export function useSemanticEditor(runtime: WorkspaceRuntime): SemanticEditorRuntime {
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

  const resetTools = useCallback((): void => {
    setActiveKind(null)
    setRelationActive(false)
    setRelationSource('')
    setRelationTarget('')
  }, [])

  const cancelTools = useCallback((): void => {
    controller.current?.cancel('tool-change')
    resetTools()
  }, [resetTools])

  useEffect(() => {
    cancelTools()
  }, [runtime.selectedViewId, cancelTools])

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
    const documentUri = runtime.state?.entryDocumentUri
    const result = await runtime.dispatchSemantic({
      type: 'element.create',
      input: { kind, ...(documentUri ? { documentUri } : {}) },
    }, 'Не удалось создать элемент.')
    resetTools()
    if (result?.status === 'applied' && result.command === 'element.create') {
      setSelection({ type: 'element', id: result.createdElementId })
      runtime.setFeedback(`Создан элемент ${result.createdElementId}.`)
    }
  }

  const createFirstDiagram = async (kind: ElementKind): Promise<FirstDiagramCreation | null> => {
    const current = runtime.workspace.current
    if (!current) return null
    const result = await runtime.dispatchSemantic({
      type: 'diagram.create',
      input: { kind, title: 'Новый элемент' },
    }, 'Не удалось начать диаграмму. Повторите попытку.')
    if (result?.status !== 'applied' || result.command !== 'diagram.create') return null
    if (runtime.workspace.current !== current || current.state.revision !== result.revision) return null
    resetTools()
    setSelection({ type: 'element', id: result.createdElementId })
    runtime.selectView(result.createdViewId)
    runtime.setFeedback('Диаграмма создана. Задайте название первого элемента.')
    return { id: result.createdElementId, viewId: result.createdViewId, workspace: current, revision: result.revision }
  }

  const createChildElement = async (parentId: Fqn, kind: ElementKind): Promise<Fqn | null> => {
    const current = runtime.workspace.current
    if (!current) return null
    const result = await runtime.dispatchSemantic({
      type: 'element.create',
      input: { kind, parentId, title: 'Новый элемент' },
    }, 'Не удалось создать дочерний элемент.')
    if (result?.status !== 'applied' || result.command !== 'element.create') return null
    if (runtime.workspace.current !== current || current.state.revision !== result.revision) return null
    resetTools()
    setSelection({ type: 'element', id: result.createdElementId })
    runtime.setFeedback('Дочерний элемент создан. Задайте название в свойствах.')
    return result.createdElementId
  }

  const createRelation = async (sourceId: Fqn, targetId: Fqn): Promise<void> => {
    const documentUri = runtime.state?.entryDocumentUri
    const result = await runtime.dispatchSemantic({
      type: 'relation.create',
      input: { sourceId, targetId, ...(documentUri ? { documentUri } : {}) },
    }, 'Не удалось создать связь.')
    resetTools()
    if (result?.status === 'applied' && result.command === 'relation.create') {
      runtime.setFeedback(relationFeedback(runtime, result.createdRelationId))
    }
  }

  const patchElement = async (values: ElementFormValues): Promise<boolean> => {
    if (!selection) return false
    const current = runtime.state?.lastValidModel?.$data.elements[selection.id]
    if (!current) return false
    const base: ElementFormValues = {
      title: current.title,
      description: flattenMarkdownOrString(current.description) ?? '',
      technology: current.technology ?? '',
      icon: current.style.icon === 'none' ? null : current.style.icon ?? null,
      tags: current.tags ?? [],
    }
    const result = await runtime.dispatchSemantic({
      type: 'element.patch',
      input: { id: selection.id, patch: patchFromForm(values, base) },
    }, 'Не удалось сохранить свойства.')
    resultError(result, 'Не удалось сохранить свойства.')
    if (result?.status === 'applied') runtime.setFeedback('Свойства элемента сохранены.')
    return result?.status === 'applied'
  }

  const renameElement = async (newId: string): Promise<boolean> => {
    if (!selection) return false
    const result = await runtime.dispatchSemantic({
      type: 'element.rename',
      input: { id: selection.id, newId: newId.trim() },
    }, 'Не удалось переименовать элемент.')
    resultError(result, 'Не удалось переименовать элемент.')
    if (result?.status === 'applied' && result.command === 'element.rename') {
      setSelection({ type: 'element', id: result.updatedElementId })
      runtime.setFeedback(`Элемент переименован: ${result.updatedElementId}.`)
    }
    return result?.status === 'applied'
  }

  const moveElement = async (parentId: Fqn | null): Promise<boolean> => {
    if (!selection) return false
    const result = await runtime.dispatchSemantic({
      type: 'element.move',
      input: { id: selection.id, parentId },
    }, 'Не удалось переместить элемент.')
    resultError(result, 'Не удалось переместить элемент.')
    if (result?.status === 'applied' && result.command === 'element.move') {
      setSelection({ type: 'element', id: result.updatedElementId })
      runtime.setFeedback(`Элемент перемещён: ${result.updatedElementId}.`)
    }
    return result?.status === 'applied'
  }

  const inspectRemoval = async (): Promise<void> => {
    const current = runtime.workspace.current
    if (!current || !selection || !runtime.assertMutationAvailable()) return
    removeInitiator.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    runtime.setBusy(true)
    setInspectorError(null)
    runtime.setCommandError(null)
    setRemovalReport(null)
    try {
      const result = await current.inspectElementRemoval(selection.id, current.state.revision)
      runtime.refresh()
      if (result.status === 'ready') {
        setRemovalReport(result.report)
      } else if (result.status === 'conflict') {
        const message = 'Проект изменился. Проверьте удаление ещё раз.'
        setInspectorError(message)
        runtime.setCommandError(message)
      } else {
        const message = result.issues[0]?.message ?? 'Не удалось проверить зависимости. Повторите проверку.'
        setInspectorError(message)
        runtime.setCommandError(message)
      }
    } catch {
      const message = 'Не удалось проверить зависимости. Повторите проверку на актуальной версии.'
      setInspectorError(message)
      runtime.setCommandError(message)
    } finally {
      runtime.setBusy(false)
    }
  }

  const closeRemoval = (): void => {
    setRemovalReport(null)
    queueMicrotask(() => removeInitiator.current?.focus())
  }

  const confirmRemoval = async (): Promise<boolean> => {
    const report = removalReport
    if (!report) return false
    setInspectorError(null)
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
        document.querySelector<HTMLElement>('.diagram-panel')?.focus()
      })
      return true
    }
    return false
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
    if (!runtime.assertMutationAvailable()) return
    controller.current?.startElementCreation(kind)
    setActiveKind(kind)
    setRelationActive(false)
    runtime.setFeedback(null)
    runtime.setCommandError(null)
  }

  const activateRelationTool = (): void => {
    if (!runtime.assertMutationAvailable()) return
    controller.current?.startRelationCreation()
    setActiveKind(null)
    setRelationActive(true)
    setRelationSource('')
    setRelationTarget('')
    runtime.setFeedback('Потяните точку связи к другому элементу или выберите пару в списках ниже.')
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

  const selectElement = (id: Fqn | null, focusDiagram = true): void => {
    setSelection(id ? { type: 'element', id } : null)
    setInspectorError(null)
    if (id && focusDiagram) diagramApi.current?.focusOnElement(id)
  }

  const updateDraftSource = (content: string): void => {
    runtime.updateDraftSource(content, next => {
      setSelection(previous => reconcileSelection(previous, next))
    })
  }

  const undo = async (): Promise<void> => {
    const result = await runtime.undo()
    resetTools()
    const next = runtime.workspace.current?.state
    if (next && result) {
      setSelection(previous => selectionAfterResult(previous, result, next))
    }
  }

  const redo = async (): Promise<void> => {
    const result = await runtime.redo()
    resetTools()
    const next = runtime.workspace.current?.state
    if (next && result) {
      setSelection(previous => selectionAfterResult(previous, result, next))
    }
  }

  const goToHistory = async (index: number, expectedRevision: number): Promise<void> => {
    const result = await runtime.goToHistory(index, expectedRevision)
    if (result?.status !== 'applied') return
    resetTools()
    const next = runtime.workspace.current?.state
    if (next) setSelection(previous => selectionAfterResult(previous, result, next))
  }

  const state = runtime.state
  const availableKinds = new Set(Object.keys(state?.lastValidModel?.$data.specification.elements ?? {}))
  const kindTitles = new Map(
    Object.entries(state?.lastValidModel?.$data.specification.elements ?? {})
      .flatMap(([kind, specification]) => specification.title ? [[kind, specification.title] as const] : []),
  )
  const availableTags = Object.keys(state?.lastValidModel?.$data.specification.tags ?? {}).sort()
  const elements = Object.values(state?.lastValidModel?.$data.elements ?? {})
    .map(element => ({ id: element.id as Fqn, title: element.title }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const selectedModelElement = selection ? state?.lastValidModel?.$data.elements[selection.id] : undefined
  const selectedElement: SemanticElementSelection | null = selectedModelElement
    ? {
      id: selectedModelElement.id as Fqn,
      title: selectedModelElement.title,
      description: flattenMarkdownOrString(selectedModelElement.description),
      technology: selectedModelElement.technology ?? null,
      icon: selectedModelElement.style.icon === 'none' ? null : selectedModelElement.style.icon ?? null,
      tags: selectedModelElement.tags ? [...selectedModelElement.tags] : [],
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
    kindTitles,
    availableTags,
    elements,
    selectedElement,
    structure: state ? buildStructureTree(state) : [],
    parents: state && selection ? parentOptions(state, selection.id) : [],
    canvasDisabled: !state || state.compilation.status !== 'valid' || runtime.busy || runtime.readOnly,
    setRelationSource,
    setRelationTarget,
    createElement,
    createChildElement,
    createFirstDiagram,
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
    goToHistory,
    cancelTools,
  }
}

function relationFeedback(runtime: WorkspaceRuntime, relationId: RelationId): string {
  const state = runtime.workspace.current?.state ?? runtime.state
  const views = Object.values(state?.lastValidModel?.$data.views ?? {})
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
