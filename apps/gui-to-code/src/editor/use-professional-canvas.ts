import type { ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import { useRef, useState } from 'react'
import type { MultiNodeLayoutAction } from './professional-layout'
import { snapGridStep, transformSelectedNodes } from './professional-layout'
import type { useWorkspaceRuntime } from './use-workspace-runtime'

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
  const [gridVisible, setGridVisible] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [gridStep, setGridStepState] = useState(16)

  const attachXYFlow = (instance: XYFlowPort): void => {
    xyflow.current = instance
  }

  const selectedNodes = (): readonly CanvasNode[] => xyflow.current?.getNodes().filter(node => node.selected) ?? []

  const selectedNodeIds = (): ReadonlySet<string> => new Set(
    selectedNodes().map(node => node.data.id ?? node.id),
  )

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
    selectAll,
    clearVisualSelection,
    fitView,
    fitSelection,
    applyLayout,
    gridVisible,
    snapEnabled,
    gridStep,
    setGridVisible,
    setSnapEnabled,
    setGridStep,
  }
}
