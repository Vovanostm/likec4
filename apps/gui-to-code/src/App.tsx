import type { Fqn } from '@likec4/core/types'
import { LikeC4EditorProvider, LikeC4ModelProvider, ReactLikeC4 } from '@likec4/diagram'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { starterSource } from './document'
import {
  canCompleteConnectionGesture,
  captureConnectionGesture,
} from './editor/connection-gesture'
import type { ConnectionGestureSnapshot } from './editor/connection-gesture'
import { resolveEditorShortcut, shortcutTargetContext } from './editor/editor-shortcuts'
import { downloadSource } from './editor/file-downloads'
import { layerCommandDisabledReason } from './editor/layer-command-guard'
import { sourcePositionOffset } from './editor/source-documents'
import { availableCanvasElementKinds } from './editor/ui/canvas-element-kinds'
import { CanvasCreateMenu } from './editor/ui/CanvasCreateMenu'
import { CanvasQuickCreateMenu } from './editor/ui/CanvasQuickCreateMenu'
import { CanvasSelectionMenu } from './editor/ui/CanvasSelectionMenu'
import { CanvasToolbar } from './editor/ui/CanvasToolbar'
import { DiagramPreview } from './editor/ui/DiagramPreview'
import { elementColorOptions } from './editor/ui/element-settings'
import { ElementInspector } from './editor/ui/ElementInspector'
import type { InspectorSelectionGuard } from './editor/ui/ElementInspector'
import { HistoryPanel } from './editor/ui/HistoryPanel'
import { InlineTitleEditor } from './editor/ui/InlineTitleEditor'
import { deriveLayerPresentation } from './editor/ui/layer-presentation'
import { RelationControls } from './editor/ui/RelationControls'
import { RelationInspector } from './editor/ui/RelationInspector'
import { RemoveElementConfirmation } from './editor/ui/RemoveElementConfirmation'
import { RemoveSelectionConfirmation } from './editor/ui/RemoveSelectionConfirmation'
import { SourceFileBrowser } from './editor/ui/SourceFileBrowser'
import { StructureTree } from './editor/ui/StructureTree'
import { renderTechnologyIcon } from './editor/ui/technology-icon'
import { ViewToolbar } from './editor/ui/ViewToolbar'
import { WorkspacePanel } from './editor/ui/WorkspacePanel'
import { Wp06Controls } from './editor/ui/Wp06Controls'
import { useCanvasEntityEditor } from './editor/use-canvas-entity-editor'
import { useDurableWorkspace } from './editor/use-durable-workspace'
import { useProfessionalCanvas } from './editor/use-professional-canvas'
import { useSemanticEditor } from './editor/use-semantic-editor'
import type { FirstDiagramCreation } from './editor/use-semantic-editor'
import { useWorkspaceRuntime } from './editor/use-workspace-runtime'
import { useWp06Runtime } from './editor/use-wp06-runtime'
import './editor.css'

export { downloadSource }

interface Point {
  readonly x: number
  readonly y: number
}

interface CanvasQuickMenuState {
  readonly workspace: object | null
  readonly viewId: string
  readonly revision: number
  readonly position: Point
  readonly screenPosition: Point
}

interface CanvasSelectionMenuState {
  readonly returnFocusTo: HTMLElement | null
  readonly workspace: object | null
  readonly viewId: string
  readonly revision: number
  readonly target: string
  readonly screenPosition: Point
}

export function App() {
  const runtime = useWorkspaceRuntime()
  const contextSettingsView = useRef(runtime.selectedViewId)
  contextSettingsView.current = runtime.selectedViewId
  const durable = useDurableWorkspace(runtime)
  const semantic = useSemanticEditor(runtime)
  const professional = useProfessionalCanvas(runtime)
  const semanticRef = useRef(semantic)
  semanticRef.current = semantic
  const [hiddenLayers, setHiddenLayers] = useState<ReadonlySet<Fqn>>(new Set())
  const [lockedLayers, setLockedLayers] = useState<ReadonlySet<Fqn>>(new Set())
  const layerPresentation = useMemo(() => deriveLayerPresentation(semantic.structure, hiddenLayers, lockedLayers), [
    semantic.structure,
    hiddenLayers,
    lockedLayers,
  ])
  const layerRef = useRef(layerPresentation)
  layerRef.current = layerPresentation
  const applyLayers = useRef<(() => void) | null>(null)
  const layerWorkspace = useRef(runtime.workspace.current)
  useEffect(() => {
    if (layerWorkspace.current === runtime.workspace.current) return
    layerWorkspace.current = runtime.workspace.current
    setHiddenLayers(new Set())
    setLockedLayers(new Set())
  }, [runtime.state, runtime.workspace])
  const selectionLocked = !!semantic.selection && layerPresentation.lockedIds.has(semantic.selection.id)
  runtime.semanticGuard.current = command =>
    layerCommandDisabledReason(
      command,
      runtime.workspace.current?.state.lastValidModel ?? null,
      layerRef.current.lockedIds,
    )
  useEffect(() => {
    const frame = requestAnimationFrame(() => applyLayers.current?.())
    return () => cancelAnimationFrame(frame)
  }, [layerPresentation, runtime.renderModel, runtime.selectedViewId])
  const wp06 = useWp06Runtime(runtime)
  const state = runtime.state
  useEffect(() => {
    const closeMenus = (event: PointerEvent): void => {
      for (const menu of document.querySelectorAll<HTMLDetailsElement>('details.toolbar-menu[open]')) {
        if (event.target instanceof Node && !menu.contains(event.target)) menu.open = false
      }
    }
    document.addEventListener('pointerdown', closeMenus)
    return () => document.removeEventListener('pointerdown', closeMenus)
  }, [])
  const connectionGesture = useRef<ConnectionGestureSnapshot | null>(null)
  const diagramPanel = useRef<HTMLElement | null>(null)
  const sourceEditor = useRef<HTMLTextAreaElement | null>(null)
  const screenToFlowPosition = useRef<((position: Point) => Point) | null>(null)
  const restoreCanvasSelection = useRef<((selectedId?: Fqn | null) => void) | null>(null)
  const viewportActions = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null)
  const [inspectorDirty, setInspectorDirty] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  useEffect(() => {
    if (!inspectorDirty) return
    const warnBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnBeforeUnload)
    return () => window.removeEventListener('beforeunload', warnBeforeUnload)
  }, [inspectorDirty])
  const [canvasSelectionMenu, setCanvasSelectionMenu] = useState<CanvasSelectionMenuState | null>(null)
  const [canvasQuickMenu, setCanvasQuickMenu] = useState<CanvasQuickMenuState | null>(null)
  const [openPanel, setOpenPanel] = useState<'structure' | 'inspector' | 'code' | 'history' | null>(null)
  const [firstDiagramTitle, setFirstDiagramTitle] = useState<FirstDiagramCreation | null>(null)
  const structureOpen = openPanel === 'structure'
  const inspectorOpen = openPanel === 'inspector'
  const codeOpen = openPanel === 'code'
  const setInspectorOpen = (open: boolean): void =>
    setOpenPanel(current => open ? 'inspector' : current === 'inspector' ? null : current)
  const setCodeOpen = (open: boolean): void =>
    setOpenPanel(current => open ? 'code' : current === 'code' ? null : current)
  useEffect(() => {
    const location = runtime.sourceReveal
    const editor = sourceEditor.current
    if (!codeOpen || !location || !editor || location.uri !== runtime.activeDocumentUri) return
    editor.focus()
    editor.setSelectionRange(
      sourcePositionOffset(editor.value, location.range.start),
      sourcePositionOffset(editor.value, location.range.end),
    )
    editor.scrollTop = Math.max(0, (location.range.start.line - 3) * parseFloat(getComputedStyle(editor).lineHeight))
  }, [codeOpen, runtime.sourceReveal, runtime.activeDocumentUri])
  const openSelectedElementSource = async (): Promise<void> => {
    const selected = semantic.selectedElement
    if (!selected) return
    if (await runtime.openElementSource(selected.id, () => semanticRef.current.selectedElement?.id === selected.id)) {
      setCodeOpen(true)
    }
  }
  const inspectorSelectionGuard = useRef<InspectorSelectionGuard | null>(null)
  const registerInspectorSelectionGuard = useCallback((guard: InspectorSelectionGuard | null) => {
    inspectorSelectionGuard.current = guard
  }, [])
  const canvas = useCanvasEntityEditor(
    runtime,
    id => semantic.selectElement(id, false),
    id => semantic.selectElement(id, false),
    () => semantic.diagramApi.current?.send({ type: 'xyflow.resetSelection' }),
  )
  const canvasSelectionRef = useRef(canvas.selection)
  canvasSelectionRef.current = canvas.selection
  const canvasContextMenuEnabled = !!state && !runtime.mutationDisabledReason && durable.status !== 'loading'
  const canvasAuthoringEnabled = canvasContextMenuEnabled && !semantic.activeKind && !previewOpen
  const canvasQuickMenuIsCurrent = canvasContextMenuEnabled
    && canvasQuickMenu?.workspace === runtime.workspace.current
    && canvasQuickMenu?.revision === state?.revision
    && canvasQuickMenu?.viewId === runtime.selectedViewId
  const selectionMenuTarget = canvas.selection
    ? `${canvas.selection.family}:${canvas.selection.id}`
    : semantic.selection
    ? `logical-element:${semantic.selection.id}`
    : null
  const canvasSelectionMenuIsCurrent = canvasSelectionMenu?.workspace === runtime.workspace.current
    && canvasSelectionMenu?.revision === state?.revision
    && canvasSelectionMenu?.viewId === runtime.selectedViewId
    && (canvasSelectionMenu?.target === selectionMenuTarget
      || (canvasSelectionMenu?.target.startsWith('edge:') && canvas.selection && 'viewId' in canvas.selection
        && runtime.selectedView?.edges.some(edge =>
          `edge:${edge.id}` === canvasSelectionMenu.target && (
            canvas.selection?.family === 'dynamic-step'
              ? edge.id === canvas.selection.id
              : edge.relations.some(id => id === canvas.selection?.id)
          )
        )))
  // The compiler supplies a synthetic index even when the user has authored no views.
  const hasAuthoredView = runtime.views.some(view => view.id !== 'index' || view.sourcePath !== undefined)

  // Focus the newly rendered diagram, not the pre-command render captured by the click handler.
  useEffect(() => {
    if (!firstDiagramTitle) return
    const current = runtime.workspace.current
    if (current !== firstDiagramTitle.workspace || current.state.revision !== firstDiagramTitle.revision) {
      setFirstDiagramTitle(null)
      return
    }
    if (state !== current.state || runtime.selectedViewId !== firstDiagramTitle.viewId) return
    canvas.startInlineTitle(firstDiagramTitle.id)
    setFirstDiagramTitle(null)
  }, [firstDiagramTitle, state, runtime.workspace, runtime.selectedViewId, canvas])

  const requestInspectorNavigation = (nextId: Fqn | null, proceed: () => void): void => {
    const guard = inspectorSelectionGuard.current
    if (guard) {
      let proceeded = false
      guard(nextId, () => {
        proceeded = true
        proceed()
      })
      if (!proceeded) {
        requestAnimationFrame(() => restoreCanvasSelection.current?.())
        setInspectorOpen(true)
      }
    } else proceed()
  }

  const requestInspectorMutation = (action: () => Promise<boolean>): Promise<boolean> => {
    return new Promise((resolve, reject) => {
      const proceed = () => {
        void action().then(resolve, reject)
      }
      if (inspectorSelectionGuard.current) {
        let proceeded = false
        inspectorSelectionGuard.current(null, () => {
          proceeded = true
          proceed()
        }, () => resolve(false))
        if (!proceeded) setInspectorOpen(true)
      } else proceed()
    })
  }

  useEffect(() => {
    semantic.diagramApi.current?.toggleFeature('ReadOnly', !canvasAuthoringEnabled)
    if (!canvasAuthoringEnabled) connectionGesture.current = null
  }, [canvasAuthoringEnabled, semantic.diagramApi])

  const inspectCanvasRemoval = (): void => {
    void requestInspectorMutation(async () => {
      // Save-and-continue can rename/move the selection before this callback runs.
      await semanticRef.current.inspectRemoval()
      return true
    })
  }

  useEffect(() => {
    if (!canvasQuickMenu && !canvasSelectionMenu) return
    const dismiss = (event: PointerEvent): void => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-canvas-quick-menu]')) return
      setCanvasQuickMenu(null)
      setCanvasSelectionMenu(null)
    }
    const dismissOnViewportChange = (event: Event): void => {
      if (event.target instanceof Element && event.target.closest('[data-canvas-quick-menu]')) return
      setCanvasQuickMenu(null)
      setCanvasSelectionMenu(null)
    }
    document.addEventListener('wheel', dismissOnViewportChange, true)
    window.addEventListener('blur', dismissOnViewportChange)
    document.addEventListener('pointerdown', dismiss)
    return () => {
      document.removeEventListener('pointerdown', dismiss)
      document.removeEventListener('wheel', dismissOnViewportChange, true)
      window.removeEventListener('blur', dismissOnViewportChange)
    }
  }, [canvasQuickMenu, canvasSelectionMenu])

  useEffect(() => {
    if (canvasQuickMenu && !canvasQuickMenuIsCurrent) setCanvasQuickMenu(null)
  }, [canvasQuickMenu, canvasQuickMenuIsCurrent])

  useEffect(() => {
    if (canvasSelectionMenu && !canvasSelectionMenuIsCurrent) setCanvasSelectionMenu(null)
  }, [canvasSelectionMenu, canvasSelectionMenuIsCurrent])

  if (!state || durable.status === 'loading') {
    return (
      <main className="editor-shell" aria-busy="true">
        <p role="status">Восстановление рабочего пространства…</p>
      </main>
    )
  }

  const undoDisabled = state.history.past.length === 0 || state.compilation.status !== 'valid' || runtime.busy
    || runtime.readOnly || durable.status === 'conflict' || runtime.layoutPending
  const redoDisabled = state.history.future.length === 0 || state.compilation.status !== 'valid' || runtime.busy
    || runtime.readOnly || durable.status === 'conflict' || runtime.layoutPending

  const connectionContext = runtime.selectedView
    ? {
      enabled: canvasAuthoringEnabled,
      revision: state.revision,
      viewId: runtime.selectedView.id,
    }
    : null

  const beginConnectionGesture = (): void => {
    connectionGesture.current = connectionContext
      ? captureConnectionGesture(connectionContext)
      : null
  }

  const completeDirectConnection = (sourceId: string, targetId: string): void => {
    const started = connectionGesture.current
    connectionGesture.current = null
    if (!connectionContext || !canCompleteConnectionGesture(started, connectionContext)) {
      runtime.setCommandError('Рабочее пространство или текущий вид изменились. Повторите действие.')
      return
    }
    if (runtime.selectedView?._type === 'dynamic' || runtime.selectedView?._type === 'deployment') {
      void wp06.completeCanvasConnection(sourceId, targetId)
      return
    }
    semantic.activateRelationTool()
    semantic.completeRelation(sourceId, targetId)
  }

  const connectionHandler = canvasAuthoringEnabled
    ? completeDirectConnection
    : null

  const localPoint = (screen: Point): Point => {
    const bounds = diagramPanel.current?.getBoundingClientRect()
    if (!bounds) return screen
    return { x: screen.x - bounds.left, y: screen.y - bounds.top }
  }

  const overlayPoint = (screen: Point): Point => {
    const bounds = diagramPanel.current?.getBoundingClientRect()
    if (!bounds) return screen
    const desired = localPoint(screen)
    return {
      x: Math.min(Math.max(12, desired.x), Math.max(12, bounds.width - 320)),
      y: Math.min(Math.max(64, desired.y), Math.max(64, bounds.height - 220)),
    }
  }

  const flowPoint = (screen: Point): Point | null => {
    const convert = screenToFlowPosition.current
    if (!convert) {
      runtime.setCommandError('Холст ещё не готов к созданию элемента.')
      return null
    }
    return convert(screen)
  }

  const focusRelationTitle = (): void => {
    queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-relation-title-input]')?.focus())
  }

  const removeSelectedCanvasEdge = async (): Promise<boolean> => {
    return requestInspectorMutation(async () => {
      switch (canvas.selection?.family) {
        case 'logical-relation':
          return canvas.removeSelectedRelation()
        case 'dynamic-step':
          return canvas.removeSelectedDynamicStep()
        case 'deployment-relation':
          return canvas.removeSelectedDeploymentRelation()
        default:
          return false
      }
    })
  }

  const relationQuickAction = runtime.selectedView?._type === 'dynamic'
    ? {
      description: 'Начать создание направленного шага между логическими элементами.',
      label: 'Создать направленный шаг',
      disabled: wp06.logicalElements.length < 2,
      onSelect: wp06.activateDynamicStep,
    }
    : runtime.selectedView?._type === 'deployment'
    ? {
      description: 'Начать создание связи между сущностями развёртывания.',
      label: 'Создать связь развёртывания',
      disabled: wp06.deploymentElements.length < 2,
      onSelect: wp06.activateDeploymentRelation,
    }
    : {
      description: 'Создайте элемент здесь или начните связь между существующими элементами.',
      label: 'Начать создание связи',
      disabled: semantic.elements.length < 2,
      onSelect: semantic.activateRelationTool,
    }

  const takeQuickMenu = (): CanvasQuickMenuState | null => {
    const menu = canvasQuickMenu
    setCanvasQuickMenu(null)
    if (!menu) return null
    if (!canvasQuickMenuIsCurrent) {
      runtime.setCommandError('Рабочее пространство или текущий вид изменились. Повторите создание.')
      return null
    }
    return menu
  }

  const selectCanvasTool = (): void => {
    setCanvasSelectionMenu(null)
    connectionGesture.current = null
    setCanvasQuickMenu(null)
    canvas.cancelCreation()
    semantic.cancelTools()
    if (wp06.connectionMode) wp06.cancelConnection()
    diagramPanel.current?.focus()
  }

  const activateCanvasCreateTool = (kind: Parameters<typeof semantic.activateCreateTool>[0]): void => {
    if (!canvasContextMenuEnabled || runtime.selectedView?._type !== 'element' || !semantic.availableKinds.has(kind)) {
      return
    }
    selectCanvasTool()
    semantic.activateCreateTool(kind)
  }

  const activateCanvasRelationTool = (): void => {
    if (!canvasContextMenuEnabled || relationQuickAction.disabled) return
    selectCanvasTool()
    relationQuickAction.onSelect()
    if (runtime.selectedView?._type === 'element' && semantic.selectedElement) {
      semantic.setRelationSource(semantic.selectedElement.id)
      runtime.setFeedback('Исходный элемент выбран. Укажите целевой элемент или потяните маркер подключения.')
    }
    if (runtime.selectedView?._type !== 'element') setInspectorOpen(true)
  }

  const openSelectionProperties = (): void => {
    setInspectorOpen(true)
    if (
      canvas.selection && canvas.selection.family !== 'logical-element' &&
      canvas.selection.family !== 'deployment-element'
    ) {
      focusRelationTitle()
    } else {
      queueMicrotask(() => document.getElementById('element-title')?.focus())
    }
  }

  const createAtCanvasCenter = (): void => {
    const kind = semantic.activeKind
    const bounds = diagramPanel.current?.querySelector('.diagram')?.getBoundingClientRect()
    if (!kind || !bounds || !canvasContextMenuEnabled) return
    const screen = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    const position = flowPoint(screen)
    if (!position) return
    void requestInspectorMutation(() => canvas.createElementAt(kind, position, overlayPoint(screen))).then(created => {
      if (created) {
        semantic.cancelTools()
        runtime.setFeedback('Элемент создан в центре холста.')
      }
    })
  }

  const hasSelectedElement = !!semantic.selectedElement
    && (!canvas.selection || canvas.selection.family === 'logical-element')
  const hasSelectedEdge = canvas.selection?.family === 'logical-relation'
    || canvas.selection?.family === 'dynamic-step'
    || canvas.selection?.family === 'deployment-relation'
  const selectionTitle = hasSelectedElement
    ? semantic.selectedElement?.title
    : canvas.selectedLogicalRelation?.title || canvas.selectedDynamicStep?.title ||
      canvas.selectedDeploymentRelation?.title || 'Связь'
  const settingsElement = hasSelectedElement && semantic.selection
    ? state.lastValidModel?.$data.elements[semantic.selection.id]
    : undefined
  const contextElementSettings = settingsElement ?
    {
      kind: settingsElement.kind,
      shape: settingsElement.style.shape ?? 'rectangle',
      color: settingsElement.style.color ?? 'primary',
      tags: settingsElement.tags ?? [],
      technology: settingsElement.technology ?? null,
      availableKinds: semantic.availableKinds,
      kindTitles: semantic.kindTitles,
      availableTags: semantic.availableTags,
      colors: elementColorOptions(state.lastValidModel?.$data.specification.customColors ?? {}),
    } :
    undefined
  const connectionToolActive = semantic.relationActive || !!wp06.connectionMode
  const canvasHint = !canvasContextMenuEnabled
    ? runtime.busy ? 'Применяем изменение…' : 'Редактирование временно недоступно. Диаграмму можно просматривать.'
    : semantic.activeKind
    ? 'Щёлкните по холсту или нажмите Enter, чтобы создать элемент. Esc — отмена.'
    : connectionToolActive
    ? runtime.selectedView?._type === 'element'
      ? 'Потяните маркер подключения к элементу или на пустое место. Esc — отмена.'
      : 'Соедините два элемента текущего вида. Esc — отмена.'
    : hasSelectedElement
    ? 'ПКМ — действия · F2 — название · Enter — свойства · Стрелки — перемещение · Delete — удалить'
    : hasSelectedEdge
    ? 'ПКМ — действия · Enter — свойства · Delete — удалить'
    : runtime.selectedView?._type === 'element'
    ? 'Двойной щелчок — новый элемент · ПКМ — быстрые действия · V — выбор · L — связь'
    : 'ПКМ — быстрые действия · V — выбор · L — связь между элементами текущего вида'

  return (
    <main
      className="editor-shell"
      onKeyDownCapture={event => {
        if (previewOpen) return
        const shortcut = resolveEditorShortcut(event, {
          ...shortcutTargetContext(event.target, event.nativeEvent.composedPath()[0]),
          canMutate: canvasContextMenuEnabled,
          activeCreation: !!semantic.activeKind,
        })
        if (!shortcut) return
        event.preventDefault()
        event.stopPropagation()
        switch (shortcut.action) {
          case 'copy':
            professional.copySelection()
            return
          case 'paste':
            void requestInspectorMutation(professional.pasteClipboard)
            return
          case 'duplicate':
            void requestInspectorMutation(professional.duplicateSelection)
            return
          case 'select-all':
            professional.selectAll()
            return
          case 'undo':
            if (!undoDisabled) void semantic.undo()
            return
          case 'redo':
            if (!redoDisabled) void semantic.redo()
            return
          case 'cancel':
            canvas.cancelInlineTitle()
            selectCanvasTool()
            requestInspectorNavigation(null, canvas.clearSelection)
            runtime.setFeedback(null)
            return
          case 'select':
            selectCanvasTool()
            return
          case 'create':
            activateCanvasCreateTool(shortcut.kind)
            return
          case 'connect':
            activateCanvasRelationTool()
            return
          case 'rename':
            if (hasSelectedElement && semantic.selection) canvas.startInlineTitle(semantic.selection.id)
            return
          case 'remove':
            if (professional.selectedNodeIds().size > 1) {
              void requestInspectorMutation(professional.inspectSelectedRemoval)
            } else if (hasSelectedEdge) {
              void removeSelectedCanvasEdge().then(removed => {
                if (removed) diagramPanel.current?.focus()
              })
            } else if (hasSelectedElement) inspectCanvasRemoval()
            return
          case 'edit':
            if (hasSelectedElement || hasSelectedEdge) openSelectionProperties()
            return
          case 'create-at-center':
            createAtCanvasCenter()
            return
          case 'context': {
            const panel = diagramPanel.current
            if (!panel || !runtime.selectedView) return
            const selected = event.nativeEvent.composedPath().find((item): item is Element =>
              item instanceof Element && item.matches('.react-flow__node, .react-flow__edge')
            )
            const bounds = (selected ?? panel.querySelector('.diagram') ?? panel).getBoundingClientRect()
            const screen = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
            if (selectionMenuTarget) {
              setCanvasQuickMenu(null)
              setCanvasSelectionMenu({
                workspace: runtime.workspace.current,
                viewId: runtime.selectedView.id,
                revision: state.revision,
                returnFocusTo: selected instanceof HTMLElement ? selected : panel,
                target: selectionMenuTarget,
                screenPosition: localPoint(screen),
              })
            } else if (canvasContextMenuEnabled) {
              const position = flowPoint(screen)
              if (!position) return
              setCanvasQuickMenu({
                workspace: runtime.workspace.current,
                viewId: runtime.selectedView.id,
                revision: state.revision,
                position,
                screenPosition: localPoint(screen),
              })
            }
            return
          }
        }
      }}>
      <header className="topbar">
        <div className="editor-brand">
          <h1>LikeC4: визуальный редактор</h1>
          <p>Создавайте, связывайте и редактируйте сущности непосредственно на холсте.</p>
        </div>
        <ViewToolbar
          views={hasAuthoredView ? runtime.views : []}
          selectedViewId={hasAuthoredView ? runtime.selectedViewId : null}
          layoutMode={runtime.layoutMode}
          scopeId={semantic.selection?.id ?? null}
          busy={runtime.busy || runtime.layoutPending}
          mutationDisabledReason={runtime.mutationDisabledReason}
          hasManualLayout={runtime.hasManualLayout}
          onSelectView={id => requestInspectorNavigation(null, () => runtime.selectView(id))}
          onCreateView={(id, title, scope) => {
            return requestInspectorMutation(() => {
              return runtime.createView(scope as Fqn | null, id, title)
            })
          }}
          onLayoutModeChange={runtime.setLayoutMode}
          onImportLayout={event => void runtime.importLayout(event)}
          onExportLayout={runtime.exportLayout}
          onResetLayout={() => void runtime.resetLayout()} />
        <div className="topbar-controls">
          <button
            type="button"
            disabled={!state.lastValidModel || !runtime.selectedViewId || !hasAuthoredView || runtime.busy
              || runtime.layoutPending || !!canvas.inlineTitle}
            title={canvas.inlineTitle ? 'Завершите изменение названия перед просмотром.' : 'Посмотреть готовую схему'}
            onClick={() => setPreviewOpen(true)}>
            Просмотр
          </button>
          <div className="actions panel-toggles" role="group" aria-label="Панели редактора">
            <button
              type="button"
              aria-controls="workspace-structure"
              aria-expanded={structureOpen}
              onClick={() => setOpenPanel(current => current === 'structure' ? null : 'structure')}>
              Структура
            </button>
            <button
              type="button"
              aria-controls="workspace-inspector"
              aria-expanded={inspectorOpen}
              onClick={() => setInspectorOpen(!inspectorOpen)}>
              Инспектор
            </button>
            <button
              type="button"
              aria-controls="workspace-code"
              aria-expanded={codeOpen}
              onClick={() => setCodeOpen(!codeOpen)}>
              Код
            </button>
          </div>
          <div className="actions history-actions" role="group" aria-label="История изменений">
            <button
              type="button"
              aria-controls="workspace-history"
              aria-expanded={openPanel === 'history'}
              onClick={() => setOpenPanel(current => current === 'history' ? null : 'history')}>
              История
            </button>
            <button
              type="button"
              aria-label="Отменить последнее изменение"
              disabled={undoDisabled}
              onClick={() =>
                void requestInspectorMutation(async () => {
                  await semantic.undo()
                  return true
                })}>
              Отменить
            </button>
            <button
              type="button"
              aria-label="Повторить отменённое изменение"
              disabled={redoDisabled}
              onClick={() =>
                void requestInspectorMutation(async () => {
                  await semantic.redo()
                  return true
                })}>
              Повторить
            </button>
          </div>
          <details className="toolbar-menu file-menu">
            <summary>Файл и действия</summary>
            <div className="toolbar-menu-content actions" aria-label="Действия с рабочим пространством">
              <button
                type="button"
                disabled={runtime.busy || runtime.readOnly || runtime.layoutPending}
                onClick={() => {
                  void requestInspectorMutation(durable.createEmptyWorkspace)
                }}>
                Новый пустой проект
              </button>
              <label className="button">
                Открыть .c4<input
                  aria-label="Открыть файл .c4"
                  type="file"
                  accept=".c4,text/plain"
                  disabled={runtime.busy || runtime.readOnly || runtime.layoutPending}
                  onChange={event => {
                    const captured = { ...event, currentTarget: event.currentTarget }
                    void requestInspectorMutation(async () => {
                      await durable.importSource(captured)
                      return true
                    }).then(continued => {
                      if (!continued) captured.currentTarget.value = ''
                    })
                  }} />
              </label>
              <label className="button">
                Импортировать ZIP<input
                  aria-label="Импортировать архив рабочего пространства"
                  type="file"
                  accept=".zip,application/zip"
                  disabled={runtime.busy || runtime.readOnly || runtime.layoutPending}
                  onChange={event => {
                    const captured = { ...event, currentTarget: event.currentTarget }
                    void requestInspectorMutation(async () => {
                      await durable.importBundle(captured)
                      return true
                    }).then(continued => {
                      if (!continued) captured.currentTarget.value = ''
                    })
                  }} />
              </label>
              <button type="button" onClick={() => downloadSource(runtime.source, runtime.activeDocumentUri)}>
                {durable.hasUnsavedDraft ? 'Скачать черновик .c4' : 'Экспортировать .c4'}
              </button>
              <button
                type="button"
                disabled={runtime.busy || runtime.layoutPending || !state.lastValidModel}
                onClick={durable.exportBundle}>
                Экспортировать ZIP
              </button>
              <button
                type="button"
                disabled={runtime.busy || runtime.readOnly || runtime.layoutPending || state.draftSources.length > 1}
                title={state.draftSources.length > 1
                  ? 'Пример доступен для проекта с одним исходным файлом.'
                  : undefined}
                onClick={() =>
                  void requestInspectorMutation(async () => {
                    if (
                      !window.confirm('Заменить текущий код примером? Перед продолжением можно экспортировать проект.')
                    ) {
                      return false
                    }
                    semantic.updateDraftSource(starterSource)
                    return true
                  })}>
                Восстановить пример
              </button>
            </div>
          </details>
        </div>
        <p
          className="save-status"
          data-status={runtime.layoutPending ? 'saving' : inspectorDirty ? 'unsaved' : durable.draftStatus}
          role="status"
          aria-live="polite">
          {runtime.layoutPending
            ? 'Сохранение положения элементов…'
            : inspectorDirty
            ? 'Изменения в свойствах ещё не применены к проекту.'
            : durable.draftStatusMessage}
          {durable.hasUnsavedDraft && durable.status !== 'conflict' && (
            <button
              type="button"
              onClick={durable.exportDraft}>
              Скачать черновик .c4
            </button>
          )}
        </p>
      </header>

      {durable.status === 'conflict' && (
        <section className="workspace-conflict" role="alert">
          <p>
            Рабочее пространство изменилось в другой вкладке. Перед загрузкой актуальной версии скачайте ZIP корректной
            локальной версии и, если нужно, отдельный черновик .c4. Загрузка заменит локальную работу.
          </p>
          <button type="button" disabled={runtime.busy} onClick={() => void durable.reloadLatest()}>
            Загрузить актуальную версию
          </button>
          <button
            type="button"
            disabled={runtime.busy || runtime.layoutPending || !state.lastValidModel}
            onClick={durable.exportBundle}>
            Скачать ZIP корректной версии
          </button>
          {durable.hasUnsavedDraft && (
            <button type="button" disabled={runtime.busy} onClick={durable.exportDraft}>
              Скачать черновик .c4
            </button>
          )}
        </section>
      )}

      <section
        className="workspace canvas-dominant-workspace"
        aria-label="Рабочая область редактора LikeC4"
        data-panel={openPanel ?? 'none'}>
        <WorkspacePanel
          id="workspace-structure"
          title="Структура модели"
          className="structure-panel"
          open={structureOpen}
          onClose={() => setOpenPanel(null)}>
          {semantic.selectedElement && (!canvas.selection || canvas.selection.family === 'logical-element') && (
            <details className="structure-child-create">
              <summary>Добавить дочерний элемент</summary>
              <p title={semantic.selectedElement.id}>Внутри «{semantic.selectedElement.title}»</p>
              <div className="actions">
                {availableCanvasElementKinds(semantic.availableKinds, semantic.kindTitles).map(([kind, label]) => (
                  <button
                    key={kind}
                    type="button"
                    disabled={!canvasContextMenuEnabled || selectionLocked}
                    aria-label={`Добавить внутри: ${label}`}
                    onClick={() => {
                      const parent = semantic.selectedElement?.id
                      if (!parent) return
                      void requestInspectorMutation(async () => {
                        const id = await semantic.createChildElement(parent, kind)
                        if (!id) return false
                        canvas.selectElement(id)
                        setInspectorOpen(true)
                        return true
                      })
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            </details>
          )}
          <StructureTree
            nodes={semantic.structure}
            selectedId={semantic.selection?.id ?? null}
            disabled={false}
            hiddenIds={hiddenLayers}
            lockedIds={lockedLayers}
            onToggleHidden={id =>
              setHiddenLayers(current => {
                const next = new Set(current)
                if (next.has(id)) {
                  next.delete(id)
                }
                else next.add(id)
                return next
              })}
            onToggleLocked={id =>
              setLockedLayers(current => {
                const next = new Set(current)
                if (next.has(id)) {
                  next.delete(id)
                }
                else next.add(id)
                return next
              })}
            onResetLayers={() => {
              setHiddenLayers(new Set())
              setLockedLayers(new Set())
            }}
            onSelect={id =>
              requestInspectorNavigation(id, () => {
                canvas.selectElement(id)
                restoreCanvasSelection.current?.(id)
              })} />
        </WorkspacePanel>

        <section
          ref={diagramPanel}
          className="panel diagram-panel"
          aria-label="Холст диаграммы"
          tabIndex={0}
          onPointerDownCapture={beginConnectionGesture}>
          <h2 className="visually-hidden">Диаграмма</h2>
          <div className="canvas-action-bar">
            <CanvasToolbar
              viewType={hasAuthoredView ? runtime.selectedView?._type ?? null : null}
              activeKind={semantic.activeKind}
              availableKinds={semantic.availableKinds}
              kindTitles={semantic.kindTitles}
              disabled={!canvasContextMenuEnabled || !hasAuthoredView}
              relationActive={connectionToolActive}
              relationDisabled={relationQuickAction.disabled}
              onSelect={selectCanvasTool}
              onCreate={activateCanvasCreateTool}
              onConnect={activateCanvasRelationTool} />
          </div>

          {runtime.renderModel && runtime.selectedView && hasAuthoredView
            ? (
              <LikeC4EditorProvider editor={runtime.editor}>
                <LikeC4ModelProvider likec4model={runtime.renderModel}>
                  <ReactLikeC4
                    key={`${runtime.selectedView.id}-${runtime.layoutMode}`}
                    viewId={runtime.selectedView.id}
                    layoutType={runtime.layoutMode}
                    className="diagram"
                    controls={false}
                    locale="ru"
                    renderIcon={renderTechnologyIcon}
                    reactFlowProps={{
                      selectionKeyCode: 'Shift',
                      multiSelectionKeyCode: ['Meta', 'Control'],
                      selectNodesOnDrag: false,
                      'aria-label': 'Интерактивная диаграмма',
                      ariaLabelConfig: {
                        'node.a11yDescription.default': 'Enter — свойства выбранного элемента. F2 — изменить название.',
                        'node.a11yDescription.keyboardDisabled':
                          'Enter — свойства выбранного элемента. F2 — изменить название.',
                        'edge.a11yDescription.default': 'Enter — свойства выбранной связи.',
                        'controls.zoomIn.ariaLabel': 'Увеличить масштаб',
                        'controls.zoomOut.ariaLabel': 'Уменьшить масштаб',
                        'controls.fitView.ariaLabel': 'Показать всю диаграмму',
                      },
                    }}
                    nodesSelectable
                    enableCompareWithLatest
                    onLayoutTypeChange={runtime.setLayoutMode}
                    onInitialized={({ diagram, xyflow }) => {
                      professional.attachXYFlow(xyflow)
                      applyLayers.current = () => {
                        const presentation = layerRef.current
                        const hiddenNodeIds = new Set<string>()
                        const lockedNodeIds = new Set<string>()
                        // Presentation updates must retain native selection and live gesture geometry.
                        const nodes = xyflow.getNodes().map(node => {
                          const id = 'modelFqn' in node.data ? node.data.modelFqn : null
                          const hidden = !!id && presentation.hiddenIds.has(id as Fqn)
                          const locked = !!id &&
                            [...presentation.lockedIds].some(lockedId =>
                              lockedId === id || lockedId.startsWith(`${id}.`)
                            )
                          if (hidden) hiddenNodeIds.add(node.id)
                          if (locked) lockedNodeIds.add(node.id)
                          const { draggable: _draggable, connectable: _connectable, ...base } = node
                          return { ...base, hidden, ...(locked ? { draggable: false, connectable: false } : {}) }
                        })
                        const edges = xyflow.getEdges().map(edge => {
                          const hidden = hiddenNodeIds.has(edge.source) || hiddenNodeIds.has(edge.target)
                          if (edge.type === 'relationship') {
                            return {
                              ...edge,
                              hidden,
                              data: {
                                ...edge.data,
                                presentationLocked: lockedNodeIds.has(edge.source) || lockedNodeIds.has(edge.target),
                              },
                            }
                          }
                          return { ...edge, hidden }
                        })
                        diagram.send({
                          type: 'xyflow.applyChanges',
                          nodes: nodes.map(node => ({ type: 'replace', id: node.id, item: node })),
                          edges: edges.map(edge => ({ type: 'replace', id: edge.id, item: edge })),
                        })
                      }
                      applyLayers.current()
                      diagram.toggleFeature('ReadOnly', !canvasAuthoringEnabled)
                      semantic.diagramApi.current = diagram
                      runtime.observeLayout(diagram)
                      screenToFlowPosition.current = position => xyflow.screenToFlowPosition(position)
                      viewportActions.current = {
                        zoomIn: () => {
                          void xyflow.zoomIn()
                        },
                        zoomOut: () => {
                          void xyflow.zoomOut()
                        },
                        fit: () => diagram.fitDiagram(),
                      }
                      restoreCanvasSelection.current = (selectedId = semanticRef.current.selection?.id) => {
                        const selection = canvasSelectionRef.current
                        xyflow.setNodes(nodes =>
                          nodes.map(node => ({
                            ...node,
                            selected: !!selectedId && 'modelFqn' in node.data && node.data.modelFqn === selectedId,
                          }))
                        )
                        xyflow.setEdges(edges =>
                          edges.map(edge => ({
                            ...edge,
                            selected: !!selection && 'viewId' in selection && (
                              selection.family === 'dynamic-step'
                                ? edge.data.id === selection.id
                                : !!runtime.selectedView?.edges.some(modelEdge =>
                                  modelEdge.id === edge.data.id && modelEdge.relations.includes(selection.id)
                                )
                            ),
                          }))
                        )
                      }
                      // Auto → manual commits remount the renderer; keep the host selection usable.
                      restoreCanvasSelection.current()
                    }}
                    onNodeClick={node => {
                      if (node.modelRef) {
                        const id = node.modelRef as Fqn
                        requestInspectorNavigation(id, () => canvas.selectElement(id))
                      }
                    }}
                    onNodeContextMenu={(node, event) => {
                      event.preventDefault()
                      event.stopPropagation()
                      const viewId = runtime.selectedViewId
                      if (!node.modelRef || !viewId) return
                      const id = node.modelRef as Fqn
                      const screenPosition = localPoint({ x: event.clientX, y: event.clientY })
                      setCanvasQuickMenu(null)
                      canvas.cancelCreation()
                      semantic.cancelTools()
                      requestInspectorNavigation(id, () => {
                        canvas.selectElement(id)
                        restoreCanvasSelection.current?.(id)
                        setCanvasSelectionMenu({
                          workspace: runtime.workspace.current,
                          viewId,
                          revision: state.revision,
                          returnFocusTo: event.target instanceof Element
                            ? event.target.closest<HTMLElement>('.react-flow__node') :
                            null,
                          target: `logical-element:${id}`,
                          screenPosition,
                        })
                      })
                    }}
                    onNodeDblClick={(node, event) => {
                      if (node.modelRef && canvasContextMenuEnabled) {
                        requestInspectorNavigation(node.modelRef as Fqn, () =>
                          canvas.startInlineTitle(
                            node.modelRef as Fqn,
                            overlayPoint({ x: event.clientX, y: event.clientY }),
                          ))
                      }
                    }}
                    onEdgeClick={edge => {
                      requestInspectorNavigation(null, () => {
                        canvas.selectEdge(edge)
                      })
                    }}
                    onEdgeContextMenu={(edge, event) => {
                      const viewId = runtime.selectedViewId
                      if (!viewId) return
                      event.preventDefault()
                      event.stopPropagation()
                      const screenPosition = localPoint({ x: event.clientX, y: event.clientY })
                      setCanvasQuickMenu(null)
                      canvas.cancelCreation()
                      semantic.cancelTools()
                      requestInspectorNavigation(null, () => {
                        canvas.selectEdge(edge)
                        requestAnimationFrame(() => restoreCanvasSelection.current?.(null))
                        // Selection is resolved by the existing view/revision-bound edge owner.
                        setCanvasSelectionMenu({
                          workspace: runtime.workspace.current,
                          viewId,
                          revision: state.revision,
                          returnFocusTo: diagramPanel.current,
                          target: `edge:${edge.id}`,
                          screenPosition,
                        })
                      })
                    }}
                    onConnect={connectionHandler}
                    onCanvasConnectionEnd={canvasAuthoringEnabled
                      ? connection => {
                        if (connection.outcome !== 'empty' || !connection.sourceId) {
                          if (connection.outcome === 'cancelled') connectionGesture.current = null
                          return
                        }
                        const started = connectionGesture.current
                        connectionGesture.current = null
                        if (!connectionContext || !canCompleteConnectionGesture(started, connectionContext)) {
                          runtime.setCommandError(
                            'Рабочее пространство или текущий вид изменились. Повторите действие.',
                          )
                          return
                        }
                        const position = flowPoint(connection.screenPosition)
                        if (position) {
                          requestInspectorNavigation(null, () =>
                            canvas.requestCreation(
                              position,
                              overlayPoint(connection.screenPosition),
                              connection.sourceId as Fqn,
                            ))
                        }
                      }
                      : null}
                    onCanvasContextMenu={canvasContextMenuEnabled
                      ? event => {
                        event.preventDefault()
                        setCanvasSelectionMenu(null)
                        semantic.controller.current?.cancel('pointer-cancel')
                        canvas.cancelCreation()
                        const screen = { x: event.clientX, y: event.clientY }
                        const position = flowPoint(screen)
                        const view = runtime.selectedView
                        if (!position || !view) return
                        setCanvasQuickMenu({
                          workspace: runtime.workspace.current,
                          viewId: view.id,
                          revision: state.revision,
                          position,
                          screenPosition: localPoint(screen),
                        })
                      }
                      : null}
                    onCanvasClick={event => {
                      const screen = { x: event.clientX, y: event.clientY }
                      const position = flowPoint(screen)
                      if (!position) return
                      if (semantic.activeKind) {
                        const kind = semantic.activeKind
                        void requestInspectorMutation(() =>
                          canvas.createElementAt(kind, position, overlayPoint(screen))
                        ).then(created => {
                          if (created) {
                            semantic.controller.current?.cancel('tool-change')
                            runtime.setFeedback('Элемент создан в выбранной позиции.')
                          }
                        })
                        return
                      }
                      requestInspectorNavigation(null, canvas.clearSelection)
                    }}
                    onCanvasDblClick={event => {
                      if (semantic.activeKind || runtime.selectedView?._type !== 'element') return
                      const screen = { x: event.clientX, y: event.clientY }
                      const position = flowPoint(screen)
                      if (position) {
                        requestInspectorNavigation(
                          null,
                          () => canvas.requestCreation(position, overlayPoint(screen)),
                        )
                      }
                    }} />
                </LikeC4ModelProvider>
              </LikeC4EditorProvider>
            )
            : (
              <section className="empty empty-workspace" aria-label="Начало работы">
                <h2>{semantic.elements.length === 0 ? 'Начните с первого элемента' : 'Создайте первый вид'}</h2>
                {semantic.elements.length === 0
                  ? (
                    <>
                      <p>Выберите тип — элемент сразу появится на холсте. Затем задайте ему название.</p>
                      <div className="actions">
                        {availableCanvasElementKinds(semantic.availableKinds, semantic.kindTitles).map((
                          [kind, label],
                        ) => (
                          <button
                            key={kind}
                            type="button"
                            disabled={!canvasContextMenuEnabled}
                            onClick={() => {
                              void semantic.createFirstDiagram(kind).then(setFirstDiagramTitle)
                            }}>
                            Добавить первый элемент: {label}
                          </button>
                        ))}
                      </div>
                      {semantic.availableKinds.size === 0 && (
                        <p>В спецификации нет типов элементов. Откройте файл .c4 или добавьте тип в панели «Код».</p>
                      )}
                    </>
                  )
                  : (
                    <>
                      <p>Выберите элемент ниже, затем нажмите «Создать вид» в верхней панели.</p>
                      <div className="actions">
                        {semantic.elements.map(element => (
                          <button
                            key={element.id}
                            type="button"
                            aria-pressed={semantic.selection?.id === element.id}
                            onClick={() =>
                              requestInspectorNavigation(element.id, () => {
                                semantic.selectElement(element.id, false)
                                setInspectorOpen(true)
                              })}>
                            {element.title}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                <button type="button" onClick={() => setCodeOpen(true)}>Открыть код</button>
              </section>
            )}

          {canvas.pendingCreation && (
            <CanvasCreateMenu
              screenPosition={canvas.pendingCreation.screenPosition}
              connected={!!canvas.pendingCreation.sourceId}
              availableKinds={semantic.availableKinds}
              kindTitles={semantic.kindTitles}
              busy={!canvasContextMenuEnabled}
              onCreate={kind => requestInspectorMutation(() => canvas.createPendingElement(kind))}
              onCancel={() => {
                canvas.cancelCreation()
                diagramPanel.current?.focus()
              }} />
          )}

          {canvasQuickMenuIsCurrent && canvasQuickMenu && (
            <CanvasQuickCreateMenu
              screenPosition={canvasQuickMenu.screenPosition}
              availableKinds={runtime.selectedView?._type === 'element' ? semantic.availableKinds : null}
              kindTitles={semantic.kindTitles}
              description={relationQuickAction.description}
              relationLabel={relationQuickAction.label}
              relationDisabled={relationQuickAction.disabled}
              busy={!canvasContextMenuEnabled}
              onCreateElement={kind => {
                const menu = takeQuickMenu()
                if (!menu) return
                void requestInspectorMutation(() => canvas.createElementAt(kind, menu.position, menu.screenPosition))
              }}
              onCreateRelation={() => {
                if (!takeQuickMenu()) return
                relationQuickAction.onSelect()
                diagramPanel.current?.focus()
              }}
              onCancel={() => setCanvasQuickMenu(null)} />
          )}

          {canvasSelectionMenuIsCurrent && canvasSelectionMenu && (hasSelectedElement || hasSelectedEdge) && (
            <CanvasSelectionMenu
              screenPosition={canvasSelectionMenu.screenPosition}
              returnFocusTo={canvasSelectionMenu.returnFocusTo}
              title={selectionTitle ?? 'Элемент'}
              element={hasSelectedElement}
              disabled={!canvasContextMenuEnabled || selectionLocked}
              connectDisabled={relationQuickAction.disabled}
              settings={contextElementSettings}
              onPatch={patch => {
                if (
                  !canvasSelectionMenuIsCurrent || !canvasContextMenuEnabled || selectionLocked || !semantic.selection
                ) return
                const captured = canvasSelectionMenu
                const id = semantic.selection.id
                setCanvasSelectionMenu(null)
                void requestInspectorMutation(async () => {
                  if (
                    runtime.workspace.current !== captured.workspace
                    || runtime.workspace.current?.state.revision !== captured.revision
                    || contextSettingsView.current !== captured.viewId
                    || semanticRef.current.selection?.id !== id
                  ) {
                    runtime.setCommandError('Элемент или проект изменился. Откройте меню заново.')
                    return false
                  }
                  const result = await runtime.dispatchSemantic(
                    { type: 'element.patch', input: { id, patch } },
                    'Не удалось изменить настройки элемента.',
                  )
                  if (result?.status !== 'applied') return false
                  runtime.setFeedback('Настройки элемента обновлены.')
                  diagramPanel.current?.focus()
                  return true
                })
              }}
              onCancel={() => setCanvasSelectionMenu(null)}
              onAction={action => {
                if (!canvasSelectionMenuIsCurrent) return
                setCanvasSelectionMenu(null)
                switch (action) {
                  case 'rename':
                    if (semantic.selection) {
                      canvas.startInlineTitle(semantic.selection.id, canvasSelectionMenu.screenPosition)
                    }
                    return
                  case 'duplicate':
                    void requestInspectorMutation(professional.duplicateSelection).then(() =>
                      diagramPanel.current?.focus()
                    )
                    return
                  case 'properties':
                    openSelectionProperties()
                    return
                  case 'connect':
                    activateCanvasRelationTool()
                    return
                  case 'remove':
                    if (hasSelectedEdge) {
                      void removeSelectedCanvasEdge().then(removed => {
                        if (removed) {
                          diagramPanel.current?.focus()
                        }
                      })
                    } else inspectCanvasRemoval()
                    return
                  case 'clear':
                    requestInspectorNavigation(null, () => {
                      canvas.clearSelection()
                      diagramPanel.current?.focus()
                    })
                    return
                }
              }} />
          )}

          {canvas.inlineTitle && (
            <InlineTitleEditor
              id={canvas.inlineTitle.id}
              value={canvas.inlineTitle.value}
              screenPosition={canvas.inlineTitle.screenPosition}
              busy={!canvasContextMenuEnabled}
              error={runtime.commandError}
              onChange={canvas.updateInlineTitle}
              onSave={canvas.saveInlineTitle}
              onCancel={canvas.cancelInlineTitle}
              onReturnFocus={() => diagramPanel.current?.focus()} />
          )}

          <footer className="canvas-status">
            {runtime.selectedView && hasAuthoredView && (
              <div className="viewport-actions" role="group" aria-label="Масштаб диаграммы">
                <button
                  type="button"
                  aria-label="Уменьшить масштаб"
                  onClick={() =>
                    viewportActions.current?.zoomOut()}>
                  −
                </button>
                <button
                  type="button"
                  onClick={() =>
                    viewportActions.current?.fit()}>
                  Показать всю диаграмму
                </button>
                <button type="button" aria-label="Увеличить масштаб" onClick={() => viewportActions.current?.zoomIn()}>
                  +
                </button>
              </div>
            )}
            <div className="canvas-status-line">
              <p className="canvas-hint">{canvasHint}</p>
              {runtime.feedback && !inspectorDirty && (
                <p className="canvas-feedback" role="status" aria-live="polite">{runtime.feedback}</p>
              )}
            </div>
            {semantic.relationActive && (
              <RelationControls
                elements={semantic.elements}
                source={semantic.relationSource}
                target={semantic.relationTarget}
                disabled={!canvasContextMenuEnabled}
                onSource={id => {
                  semantic.setRelationSource(id)
                  runtime.setFeedback('Выберите целевой элемент.')
                }}
                onTarget={semantic.setRelationTarget}
                onCreate={() => semantic.completeRelation(semantic.relationSource, semantic.relationTarget)} />
            )}
            {runtime.persistenceNotice && <p role="status" aria-live="polite">{runtime.persistenceNotice}</p>}
            {runtime.commandError && (
              <div className="canvas-command-error" role="alert">
                <p>{runtime.commandError}</p>
                <button
                  type="button"
                  aria-label="Закрыть сообщение об ошибке"
                  onClick={() => runtime.setCommandError(null)}>
                  ×
                </button>
              </div>
            )}
          </footer>
        </section>

        <WorkspacePanel
          id="workspace-inspector"
          title="Инспектор"
          className="inspector-panel"
          open={inspectorOpen}
          onClose={() => setInspectorOpen(false)}>
          <RelationInspector
            selection={canvas.selection}
            relation={canvas.selectedLogicalRelation}
            availableTags={semantic.availableTags}
            onCreateTag={canvas.createTag}
            dynamicStep={canvas.selectedDynamicStep}
            deploymentRelation={canvas.selectedDeploymentRelation}
            alternatives={canvas.relationAlternatives}
            busy={!canvasContextMenuEnabled}
            disabledReason={runtime.mutationDisabledReason}
            onSelectionGuardChange={registerInspectorSelectionGuard}
            onDirtyChange={setInspectorDirty}
            onSelectAlternative={canvas.selectRelationAlternative}
            onPatch={async (title, patch) => {
              const saved = await canvas.patchSelectedRelation(title, patch)
              if (saved) focusRelationTitle()
              return saved
            }}
            onRemove={async () => {
              const removed = await canvas.removeSelectedRelation()
              if (removed) diagramPanel.current?.focus()
              return removed
            }}
            onPatchDynamicStep={async title => {
              const saved = await canvas.patchSelectedDynamicStep(title)
              if (saved) focusRelationTitle()
              return saved
            }}
            onRemoveDynamicStep={async () => {
              const removed = await canvas.removeSelectedDynamicStep()
              if (removed) diagramPanel.current?.focus()
              return removed
            }}
            onPatchDeploymentRelation={async title => {
              const saved = await canvas.patchSelectedDeploymentRelation(title)
              if (saved) focusRelationTitle()
              return saved
            }}
            onRemoveDeploymentRelation={async () => {
              const removed = await canvas.removeSelectedDeploymentRelation()
              if (removed) diagramPanel.current?.focus()
              return removed
            }} />
          {(!canvas.selection || canvas.selection.family === 'logical-element' ||
            canvas.selection.family === 'deployment-element') && (
            <ElementInspector
              element={semantic.selectedElement}
              emptyMessage={canvas.selection?.family === 'deployment-element'
                ? 'Выбран узел развёртывания. Создать узлы, экземпляры и связи можно в разделе «Сценарии и развёртывание».'
                : undefined}
              availableTags={semantic.availableTags}
              onCreateTag={canvas.createTag}
              parents={semantic.parents}
              disabled={!canvasContextMenuEnabled || selectionLocked}
              disabledReason={selectionLocked ? 'Элемент заблокирован в слоях.' : runtime.mutationDisabledReason}
              busy={runtime.busy || runtime.layoutPending}
              error={semantic.inspectorError}
              onSelectionGuardChange={registerInspectorSelectionGuard}
              onDirtyChange={setInspectorDirty}
              onRequestCanvasSelection={() => {
                setInspectorOpen(false)
                diagramPanel.current?.focus()
              }}
              onPatch={semantic.patchElement}
              onRename={semantic.renameElement}
              onMove={semantic.moveElement}
              onRemove={semantic.inspectRemoval} />
          )}
          {semantic.selectedElement && (
            <button
              type="button"
              disabled={state.compilation.status !== 'valid'}
              onClick={() => void openSelectedElementSource()}>
              Открыть исходник элемента
            </button>
          )}
          <Wp06Controls
            wp06={{
              ...wp06,
              createDynamicView: (id, title) => requestInspectorMutation(() => wp06.createDynamicView(id, title)),
              createDeploymentView: (id, title) => requestInspectorMutation(() => wp06.createDeploymentView(id, title)),
            }}
            busy={!canvasContextMenuEnabled} />
        </WorkspacePanel>

        <WorkspacePanel
          id="workspace-code"
          title="Код LikeC4"
          className="code-panel"
          open={codeOpen}
          onClose={() => setCodeOpen(false)}>
          <SourceFileBrowser
            sources={state.draftSources}
            committedSources={state.committedSources}
            diagnostics={state.compilation.diagnostics}
            activeUri={runtime.activeDocumentUri}
            entryUri={runtime.entryDocumentUri}
            onSelect={runtime.selectDocument} />
          <div className="source-document-heading">
            <span title={runtime.activeDocumentUri}>{runtime.activeDocumentUri}</span>
            {runtime.activeDocumentUri === runtime.entryDocumentUri && <small>Основной файл</small>}
          </div>
          <div className="source-document-content">
            <textarea
              key={runtime.activeDocumentUri}
              ref={sourceEditor}
              aria-label="Исходный код LikeC4"
              readOnly={runtime.readOnly || runtime.busy || runtime.layoutPending}
              value={runtime.source.replace(/\r\n/g, '\n')}
              onChange={event => semantic.updateDraftSource(event.target.value)}
              spellCheck={false} />
            {state.compilation.diagnostics.length > 0 && (
              <section className="diagnostics" aria-live="polite">
                <h2>Ошибки</h2>
                <ul>
                  {state.compilation.diagnostics.map((diagnostic, index) => (
                    <li key={`${diagnostic.line ?? 0}-${index}`}>
                      {diagnostic.uri && (
                        <button
                          className="diagnostic-file"
                          type="button"
                          onClick={() => {
                            if (diagnostic.uri) runtime.selectDocument(diagnostic.uri)
                          }}>
                          {diagnostic.uri}
                        </button>
                      )}
                      {diagnostic.line ? `Строка ${diagnostic.line}: ` : ''}Проверьте синтаксис LikeC4. Последняя
                      корректная диаграмма сохранена.
                      <details>
                        <summary>Подробности ошибки</summary>
                        {diagnostic.message}
                      </details>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <p>Ревизия проекта: {state.revision}</p>
          </div>
        </WorkspacePanel>
        <WorkspacePanel
          id="workspace-history"
          title="История"
          className="history-panel"
          open={openPanel === 'history'}
          onClose={() => setOpenPanel(null)}>
          <HistoryPanel
            history={state.history}
            disabledReason={runtime.layoutPending
              ? 'Дождитесь сохранения раскладки.'
              : runtime.mutationDisabledReason}
            onSelect={index => {
              if (index === state.history.past.length) return
              const revision = state.revision
              void requestInspectorMutation(async () => {
                await semantic.goToHistory(index, revision)
                return true
              })
            }} />
        </WorkspacePanel>
      </section>

      {professional.removalInspection && (
        <RemoveSelectionConfirmation
          inspection={professional.removalInspection}
          busy={runtime.busy}
          error={runtime.commandError}
          onCancel={professional.closeSelectedRemoval}
          onConfirm={async () => {
            await professional.confirmSelectedRemoval()
          }} />
      )}
      {semantic.removalReport && (
        <RemoveElementConfirmation
          report={semantic.removalReport}
          targetTitle={state.lastValidModel?.$data.elements[semantic.removalReport.target]?.title}
          sources={state.committedSources}
          elementTitles={Object.fromEntries(semantic.elements.map(element => [element.id, element.title]))}
          busy={runtime.busy || runtime.layoutPending}
          error={semantic.inspectorError ?? runtime.commandError}
          mutationDisabledReason={runtime.mutationDisabledReason}
          onCancel={semantic.closeRemoval}
          onConfirm={semantic.confirmRemoval} />
      )}
      {previewOpen && state.lastValidModel && runtime.selectedViewId && (
        <DiagramPreview
          model={state.lastValidModel}
          initialViewId={runtime.selectedViewId}
          hasDraft={durable.hasUnsavedDraft || inspectorDirty}
          onClose={() => setPreviewOpen(false)} />
      )}
    </main>
  )
}
