import type { Fqn, ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import { useRef, useState } from 'react'
import type { CanvasClipboard } from './professional-clipboard'
import { captureCanvasClipboard, refreshClipboardRevision } from './professional-clipboard'
import type { MultiNodeLayoutAction } from './professional-layout'
import { snapGridStep, transformSelectedNodes } from './professional-layout'
import type { MultiRemovalInspection } from './professional-removal'
import { workspaceDocumentUri, type useWorkspaceRuntime } from './use-workspace-runtime'

type WorkspaceRuntime = ReturnType<typeof useWorkspaceRuntime>

interface CanvasNode {
  readonly id: string
  readonly selected?: boolean
  readonly data: { readonly id?: string }
}

interface XYFlowPort {
  getNodes(): readonly CanvasNode[]
  setNodes(updater: (nodes: CanvasNode[]) => CanvasNode[]): void
  fitView(options?: { readonly nodes?: readonly CanvasNode[]; readonly padding?: number; readonly duration?: number }): Promise<boolean>
}

export function useProfessionalCanvas(runtime: WorkspaceRuntime) {
  const xyflow = useRef<XYFlowPort | null>(null)
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const sequence = useRef(0)
  const pasteSequence = useRef(0)
  const [clipboard, setClipboard] = useState<CanvasClipboard | null>(null)
  const [removalInspection, setRemovalInspection] = useState<MultiRemovalInspection | null>(null)
  const [gridVisible, setGridVisible] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [gridStep, setGridStepState] = useState(16)

  const attachXYFlow = (instance: unknown): void => {
    xyflow.current = instance as XYFlowPort
  }

  const selectedNodes = (): readonly CanvasNode[] => xyflow.current?.getNodes().filter(node => node.selected) ?? []

  const selectedNodeIds = (): ReadonlySet<string> => new Set(
    selectedNodes().map(node => node.data.id ?? node.id),
  )

  const ensureNodeSelected = (nodeId: string): void => {
    const nodes = xyflow.current?.getNodes() ?? []
    if (nodes.some(node => node.id === nodeId && node.selected)) return
    xyflow.current?.setNodes(current => current.map(node => ({ ...node, selected: node.id === nodeId })))
  }

  const selectAll = (): void => {
    xyflow.current?.setNodes(nodes => nodes.map(node => ({ ...node, selected: true })))
  }

  const clearVisualSelection = (): void => {
    xyflow.current?.setNodes(nodes => nodes.map(node => node.selected ? { ...node, selected: false } : node))
  }

  const fitView = async (): Promise<void> => {
    await xyflow.current?.fitView({ padding: 0.15, duration: 250 })
  }

  const fitSelection = async (): Promise<boolean> => {
    const nodes = selectedNodes()
    if (nodes.length === 0) {
      runtimeRef.current.setFeedback('Сначала выделите элементы на холсте.')
      return false
    }
    await xyflow.current?.fitView({ nodes, padding: 0.25, duration: 250 })
    return true
  }

  const captureSelection = (): CanvasClipboard | null => {
    const activeRuntime = runtimeRef.current
    const current = activeRuntime.workspace.current
    const viewId = activeRuntime.selectedViewId
    if (!current || !viewId || current.state.compilation.status !== 'valid') return null
    return captureCanvasClipboard(current.state, viewId, selectedNodeIds())
  }

  const waitForRuntimeIdle = async (): Promise<boolean> => {
    const deadline = Date.now() + 2_000
    while (runtimeRef.current.busy && Date.now() < deadline) {
      await new Promise<void>(resolve => setTimeout(resolve, 20))
    }
    return !runtimeRef.current.busy
  }

  const copySelection = (): boolean => {
    const captured = captureSelection()
    if (!captured) {
      runtimeRef.current.setFeedback('Сначала выделите логические элементы в статическом виде.')
      return false
    }
    setClipboard(captured)
    pasteSequence.current = 0
    runtimeRef.current.setCommandError(null)
    runtimeRef.current.setFeedback(captured.elements.length === 1
      ? 'Элемент скопирован.'
      : `Скопировано элементов: ${captured.elements.length}.`)
    return true
  }

  const paste = async (captured: CanvasClipboard, feedback: string): Promise<boolean> => {
    const activeRuntime = runtimeRef.current
    const current = activeRuntime.workspace.current
    const viewId = activeRuntime.selectedViewId
    if (!current || !viewId || activeRuntime.busy || current.state.compilation.status !== 'valid') return false

    const pasteIndex = pasteSequence.current + 1
    activeRuntime.setBusy(true)
    activeRuntime.setCommandError(null)
    try {
      const result = await current.pasteSubgraph({
        clipboard: captured,
        viewId,
        documentUri: workspaceDocumentUri,
        offset: { x: 24 * pasteIndex, y: 24 * pasteIndex },
      }, current.state.revision)
      activeRuntime.refresh()
      if (result.status === 'conflict') {
        activeRuntime.setCommandError('Проект изменился. Повторите действие на актуальной версии.')
        return false
      }
      if (result.status === 'rejected') {
        activeRuntime.setCommandError(result.issues[0]?.message ?? 'Не удалось вставить элементы.')
        return false
      }
      setClipboard(refreshClipboardRevision(captured, result.revision))
      pasteSequence.current = pasteIndex
      activeRuntime.setLayoutMode('manual')
      activeRuntime.setFeedback(feedback)
      return true
    } finally {
      activeRuntime.setBusy(false)
    }
  }

  const pasteClipboard = async (): Promise<boolean> => {
    if (!clipboard) {
      runtimeRef.current.setFeedback('Буфер элементов пуст.')
      return false
    }
    return paste(clipboard, clipboard.elements.length === 1
      ? 'Элемент вставлен.'
      : `Вставлено элементов: ${clipboard.elements.length}.`)
  }

  const duplicateSelection = async (): Promise<boolean> => {
    if (!await waitForRuntimeIdle()) {
      runtimeRef.current.setFeedback('Дождитесь завершения текущей операции и повторите дублирование.')
      return false
    }
    const captured = captureSelection()
    if (!captured) {
      runtimeRef.current.setFeedback('Сначала выделите логические элементы в статическом виде.')
      return false
    }
    pasteSequence.current = 0
    return paste(captured, captured.elements.length === 1
      ? 'Элемент продублирован.'
      : `Продублировано элементов: ${captured.elements.length}.`)
  }

  const inspectSelectedRemoval = async (): Promise<boolean> => {
    const current = runtimeRef.current.workspace.current
    const captured = captureSelection()
    if (!current || !captured || captured.elements.length < 2 || runtimeRef.current.busy) {
      runtimeRef.current.setFeedback('Для группового удаления выделите не менее двух логических элементов в статическом виде.')
      return false
    }
    runtimeRef.current.setBusy(true)
    runtimeRef.current.setCommandError(null)
    try {
      const result = await current.inspectSubgraphRemoval(
        captured.elements.map(element => element.id as Fqn),
        current.state.revision,
      )
      if (result.status === 'conflict') {
        runtimeRef.current.setCommandError('Проект изменился. Повторите удаление на актуальной версии.')
        return false
      }
      if (result.status === 'rejected') {
        runtimeRef.current.setCommandError(result.issues[0]?.message ?? 'Не удалось проверить групповое удаление.')
        return false
      }
      setRemovalInspection(result.inspection)
      runtimeRef.current.setFeedback(null)
      return true
    } finally {
      runtimeRef.current.setBusy(false)
    }
  }

  const confirmSelectedRemoval = async (): Promise<boolean> => {
    const current = runtimeRef.current.workspace.current
    if (!current || !removalInspection || runtimeRef.current.busy) return false
    runtimeRef.current.setBusy(true)
    runtimeRef.current.setCommandError(null)
    try {
      const result = await current.removeSubgraph(removalInspection, current.state.revision)
      runtimeRef.current.refresh()
      if (result.status === 'conflict') {
        runtimeRef.current.setCommandError('Проект изменился. Проверьте зависимости и подтвердите удаление снова.')
        setRemovalInspection(null)
        return false
      }
      if (result.status === 'rejected') {
        runtimeRef.current.setCommandError(result.issues[0]?.message ?? 'Не удалось удалить выбранные элементы.')
        return false
      }
      setRemovalInspection(null)
      clearVisualSelection()
      runtimeRef.current.setFeedback(`Удалено элементов: ${result.removedElementIds.length}.`)
      return true
    } finally {
      runtimeRef.current.setBusy(false)
    }
  }

  const closeSelectedRemoval = (): void => setRemovalInspection(null)

  const applyLayout = async (action: MultiNodeLayoutAction): Promise<boolean> => {
    const activeRuntime = runtimeRef.current
    const current = activeRuntime.workspace.current
    const viewId = activeRuntime.selectedViewId
    if (!current || !viewId || activeRuntime.busy || current.state.compilation.status !== 'valid') return false

    const ids = selectedNodeIds()
    const minimum = action.startsWith('distribute-') ? 3 : 2
    if (ids.size < minimum) {
      activeRuntime.setFeedback(minimum === 3
        ? 'Для распределения выделите не менее трёх элементов.'
        : 'Для выравнивания выделите не менее двух элементов.')
      return false
    }

    const layouted = current.state.manualLayouts[viewId]
      ?? current.state.lastValidModel?.findView(viewId as ViewId)?.$layouted
    if (!layouted) {
      activeRuntime.setCommandError('Не удалось получить текущую раскладку вида.')
      return false
    }

    const snapshot = transformSelectedNodes(
      structuredClone(layouted) as ViewManualLayoutSnapshot,
      ids,
      action,
    )

    activeRuntime.setBusy(true)
    activeRuntime.setCommandError(null)
    try {
      const result = await current.dispatch({
        id: Date.now() * 1000 + (++sequence.current % 1000),
        expectedRevision: current.state.revision,
        layout: {
          type: 'layout.save',
          input: { viewId, snapshot },
        },
      })
      activeRuntime.finishResult(result, 'Не удалось изменить раскладку.')
      if (result.status === 'applied') {
        activeRuntime.setLayoutMode('manual')
        activeRuntime.setFeedback('Раскладка выбранных элементов обновлена.')
        return true
      }
      return false
    } finally {
      activeRuntime.setBusy(false)
    }
  }

  const setGridStep = (value: number): void => setGridStepState(snapGridStep(value))

  return {
    attachXYFlow,
    selectedNodeIds,
    ensureNodeSelected,
    selectAll,
    clearVisualSelection,
    fitView,
    fitSelection,
    copySelection,
    pasteClipboard,
    duplicateSelection,
    hasClipboard: clipboard !== null,
    removalInspection,
    inspectSelectedRemoval,
    confirmSelectedRemoval,
    closeSelectedRemoval,
    applyLayout,
    gridVisible,
    snapEnabled,
    gridStep,
    setGridVisible,
    setSnapEnabled,
    setGridStep,
  }
}
