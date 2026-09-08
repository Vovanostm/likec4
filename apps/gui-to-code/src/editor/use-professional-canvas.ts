import type { ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import { useRef, useState } from 'react'
import type { CanvasClipboard } from './professional-clipboard'
import { captureCanvasClipboard, refreshClipboardRevision } from './professional-clipboard'
import type { MultiNodeLayoutAction } from './professional-layout'
import { snapGridStep, transformSelectedNodes } from './professional-layout'
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
  const sequence = useRef(0)
  const pasteSequence = useRef(0)
  const [clipboard, setClipboard] = useState<CanvasClipboard | null>(null)
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
      runtime.setFeedback('Сначала выделите элементы на холсте.')
      return false
    }
    await xyflow.current?.fitView({ nodes, padding: 0.25, duration: 250 })
    return true
  }

  const captureSelection = (): CanvasClipboard | null => {
    const current = runtime.workspace.current
    const viewId = runtime.selectedViewId
    if (!current || !viewId || current.state.compilation.status !== 'valid') return null
    return captureCanvasClipboard(current.state, viewId, selectedNodeIds())
  }

  const copySelection = (): boolean => {
    const captured = captureSelection()
    if (!captured) {
      runtime.setFeedback('Сначала выделите логические элементы в статическом виде.')
      return false
    }
    setClipboard(captured)
    pasteSequence.current = 0
    runtime.setCommandError(null)
    runtime.setFeedback(captured.elements.length === 1
      ? 'Элемент скопирован.'
      : `Скопировано элементов: ${captured.elements.length}.`)
    return true
  }

  const paste = async (captured: CanvasClipboard, feedback: string): Promise<boolean> => {
    const current = runtime.workspace.current
    const viewId = runtime.selectedViewId
    if (!current || !viewId || runtime.busy || current.state.compilation.status !== 'valid') return false

    const pasteIndex = pasteSequence.current + 1
    runtime.setBusy(true)
    runtime.setCommandError(null)
    try {
      const result = await current.pasteSubgraph({
        clipboard: captured,
        viewId,
        documentUri: workspaceDocumentUri,
        offset: { x: 24 * pasteIndex, y: 24 * pasteIndex },
      }, current.state.revision)
      runtime.refresh()
      if (result.status === 'conflict') {
        runtime.setCommandError('Проект изменился. Повторите действие на актуальной версии.')
        return false
      }
      if (result.status === 'rejected') {
        runtime.setCommandError(result.issues[0]?.message ?? 'Не удалось вставить элементы.')
        return false
      }
      setClipboard(refreshClipboardRevision(captured, result.revision))
      pasteSequence.current = pasteIndex
      runtime.setLayoutMode('manual')
      runtime.setFeedback(feedback)
      return true
    } finally {
      runtime.setBusy(false)
    }
  }

  const pasteClipboard = async (): Promise<boolean> => {
    if (!clipboard) {
      runtime.setFeedback('Буфер элементов пуст.')
      return false
    }
    return paste(clipboard, clipboard.elements.length === 1
      ? 'Элемент вставлен.'
      : `Вставлено элементов: ${clipboard.elements.length}.`)
  }

  const duplicateSelection = async (): Promise<boolean> => {
    const captured = captureSelection()
    if (!captured) {
      runtime.setFeedback('Сначала выделите логические элементы в статическом виде.')
      return false
    }
    pasteSequence.current = 0
    return paste(captured, captured.elements.length === 1
      ? 'Элемент продублирован.'
      : `Продублировано элементов: ${captured.elements.length}.`)
  }

  const applyLayout = async (action: MultiNodeLayoutAction): Promise<boolean> => {
    const current = runtime.workspace.current
    const viewId = runtime.selectedViewId
    if (!current || !viewId || runtime.busy || current.state.compilation.status !== 'valid') return false

    const ids = selectedNodeIds()
    const minimum = action.startsWith('distribute-') ? 3 : 2
    if (ids.size < minimum) {
      runtime.setFeedback(minimum === 3
        ? 'Для распределения выделите не менее трёх элементов.'
        : 'Для выравнивания выделите не менее двух элементов.')
      return false
    }

    const layouted = current.state.manualLayouts[viewId]
      ?? current.state.lastValidModel?.findView(viewId as ViewId)?.$layouted
    if (!layouted) {
      runtime.setCommandError('Не удалось получить текущую раскладку вида.')
      return false
    }

    const snapshot = transformSelectedNodes(
      structuredClone(layouted) as ViewManualLayoutSnapshot,
      ids,
      action,
    )

    runtime.setBusy(true)
    runtime.setCommandError(null)
    try {
      const result = await current.dispatch({
        id: Date.now() * 1000 + (++sequence.current % 1000),
        expectedRevision: current.state.revision,
        layout: {
          type: 'layout.save',
          input: { viewId, snapshot },
        },
      })
      runtime.finishResult(result, 'Не удалось изменить раскладку.')
      if (result.status === 'applied') {
        runtime.setLayoutMode('manual')
        runtime.setFeedback('Раскладка выбранных элементов обновлена.')
        return true
      }
      return false
    } finally {
      runtime.setBusy(false)
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
    applyLayout,
    gridVisible,
    snapEnabled,
    gridStep,
    setGridVisible,
    setSnapEnabled,
    setGridStep,
  }
}
