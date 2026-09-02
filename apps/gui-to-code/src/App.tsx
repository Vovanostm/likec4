import type { Fqn } from '@likec4/core/types'
import { LikeC4EditorProvider, LikeC4ModelProvider, ReactLikeC4 } from '@likec4/diagram'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'
import { starterSource } from './document'
import {
  canCompleteConnectionGesture,
  captureConnectionGesture,
} from './editor/connection-gesture'
import type { ConnectionGestureSnapshot } from './editor/connection-gesture'
import { downloadSource } from './editor/file-downloads'
import { useCanvasEntityEditor } from './editor/use-canvas-entity-editor'
import { useDurableWorkspace } from './editor/use-durable-workspace'
import { useProfessionalCanvas } from './editor/use-professional-canvas'
import { CanvasContextMenu } from './editor/ui/CanvasContextMenu'
import type { CanvasContextMenuKind } from './editor/ui/CanvasContextMenu'
import { CanvasCreateMenu } from './editor/ui/CanvasCreateMenu'
import { ElementInspector } from './editor/ui/ElementInspector'
import { InlineTitleEditor } from './editor/ui/InlineTitleEditor'
import { ProfessionalCanvasToolbar } from './editor/ui/ProfessionalCanvasToolbar'
import { RelationInspector } from './editor/ui/RelationInspector'
import { RemoveElementConfirmation } from './editor/ui/RemoveElementConfirmation'
import { StructureTree } from './editor/ui/StructureTree'
import { ViewToolbar } from './editor/ui/ViewToolbar'
import { Wp06Controls } from './editor/ui/Wp06Controls'
import { useSemanticEditor } from './editor/use-semantic-editor'
import { useWorkspaceRuntime } from './editor/use-workspace-runtime'
import { useWp06Runtime } from './editor/use-wp06-runtime'
import './editor.css'

export { downloadSource }

interface Point {
  readonly x: number
  readonly y: number
}

interface ContextMenuState {
  readonly kind: CanvasContextMenuKind
  readonly screenPosition: Point
  readonly flowPosition?: Point
}

export function App() {
  const runtime = useWorkspaceRuntime()
  const durable = useDurableWorkspace(runtime)
  const semantic = useSemanticEditor(runtime)
  const wp06 = useWp06Runtime(runtime)
  const professional = useProfessionalCanvas(runtime)
  const state = runtime.state
  const connectionGesture = useRef<ConnectionGestureSnapshot | null>(null)
  const diagramPanel = useRef<HTMLElement | null>(null)
  const screenToFlowPosition = useRef<((position: Point) => Point) | null>(null)
  const [structureOpen, setStructureOpen] = useState(true)
  const [inspectorOpen, setInspectorOpen] = useState(true)
  const [codeOpen, setCodeOpen] = useState(false)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)
  const canvas = useCanvasEntityEditor(
    runtime,
    id => semantic.selectElement(id, false),
    id => semantic.selectElement(id, false),
  )
  const canvasAuthoringEnabled = !!state
    && state.compilation.status === 'valid'
    && !runtime.busy
    && !semantic.activeKind

  useEffect(() => {
    semantic.diagramApi.current?.toggleFeature('ReadOnly', !canvasAuthoringEnabled)
    if (!canvasAuthoringEnabled) connectionGesture.current = null
  }, [canvasAuthoringEnabled, semantic.diagramApi])

  if (!state || durable.status === 'loading') {
    return <main className="editor-shell" aria-busy="true"><p role="status">Восстановление рабочего пространства…</p></main>
  }

  const undoDisabled = state.history.past.length === 0 || state.compilation.status !== 'valid' || runtime.busy
  const redoDisabled = state.history.future.length === 0 || state.compilation.status !== 'valid' || runtime.busy

  const connectionContext = runtime.selectedView
    ? {
      enabled: canvasAuthoringEnabled,
      revision: state.revision,
      viewId: runtime.selectedView.id,
    }
    : null

  const beginConnectionGesture = (): void => {
    setContextMenu(null)
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

  const overlayPoint = (screen: Point): Point => {
    const bounds = diagramPanel.current?.getBoundingClientRect()
    if (!bounds) return screen
    const desiredX = screen.x - bounds.left
    const desiredY = screen.y - bounds.top
    return {
      x: Math.min(Math.max(12, desiredX), Math.max(12, bounds.width - 320)),
      y: Math.min(Math.max(64, desiredY), Math.max(64, bounds.height - 220)),
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

  const keyboardMenuPoint = (): Point => {
    const bounds = diagramPanel.current?.getBoundingClientRect()
    return bounds ? { x: bounds.left + 32, y: bounds.top + 88 } : { x: 32, y: 88 }
  }

  const focusRelationTitle = (): void => {
    queueMicrotask(() => document.querySelector<HTMLInputElement>('[data-relation-title-input]')?.focus())
  }

  const removeSelectedCanvasEdge = async (): Promise<boolean> => {
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
  }

  const workspaceColumns = [
    structureOpen ? 'minmax(13rem, 16rem)' : null,
    'minmax(24rem, 1fr)',
    inspectorOpen ? 'minmax(18rem, 22rem)' : null,
    codeOpen ? 'minmax(24rem, 28rem)' : null,
  ].filter(Boolean).join(' ')

  return (
    <main
      className="editor-shell"
      onKeyDown={event => {
        if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a' && !isEditableTarget(event.target)) {
          event.preventDefault()
          professional.selectAll()
          runtime.setFeedback('Все элементы текущего вида выделены.')
          return
        }
        if (event.key === 'Escape' && contextMenu) {
          event.preventDefault()
          setContextMenu(null)
          diagramPanel.current?.focus()
          return
        }
        if (event.key === 'Escape' && canvas.inlineTitle) {
          event.preventDefault()
          canvas.cancelInlineTitle()
          diagramPanel.current?.focus()
          return
        }
        if (event.key === 'Escape' && canvas.pendingCreation) {
          event.preventDefault()
          canvas.cancelCreation()
          diagramPanel.current?.focus()
          return
        }
        if (event.key === 'Escape' && canvas.selection && canvas.selection.family !== 'logical-element') {
          event.preventDefault()
          canvas.clearSelection()
          professional.clearVisualSelection()
          diagramPanel.current?.focus()
          return
        }
        if (event.key === 'Escape' && !isEditableTarget(event.target)) {
          professional.clearVisualSelection()
        }
        if ((event.key === 'Delete' || event.key === 'Backspace')
          && (canvas.selection?.family === 'logical-relation'
            || canvas.selection?.family === 'dynamic-step'
            || canvas.selection?.family === 'deployment-relation')
          && !isEditableTarget(event.target)) {
          event.preventDefault()
          void removeSelectedCanvasEdge().then(removed => {
            if (removed) diagramPanel.current?.focus()
          })
          return
        }
        if (
          event.key === 'F2'
          && semantic.selection
          && (!canvas.selection || canvas.selection.family === 'logical-element')
          && !isEditableTarget(event.target)
        ) {
          event.preventDefault()
          canvas.startInlineTitle(semantic.selection.id)
          return
        }
        if (event.key === 'Enter'
          && canvas.selection
          && canvas.selection.family !== 'logical-element'
          && canvas.selection.family !== 'deployment-element'
          && !isEditableTarget(event.target)) {
          event.preventDefault()
          setInspectorOpen(true)
          focusRelationTitle()
          return
        }
        if (event.shiftKey && event.key === 'F10' && !isEditableTarget(event.target)) {
          event.preventDefault()
          const screenPosition = keyboardMenuPoint()
          const edgeSelected = !!canvas.selection
            && canvas.selection.family !== 'logical-element'
            && canvas.selection.family !== 'deployment-element'
          setContextMenu({
            kind: edgeSelected ? 'edge' : semantic.selection ? 'node' : 'canvas',
            screenPosition,
            ...(!edgeSelected && !semantic.selection ? { flowPosition: flowPoint(screenPosition) ?? undefined } : {}),
          })
          return
        }
        if (event.key === 'Escape' && wp06.connectionMode) wp06.cancelConnection()
        semantic.handleEditorKeyDown(event)
      }}>
      <header className="topbar">
        <div>
          <h1>LikeC4: визуальный редактор</h1>
          <p>Создавайте, связывайте и редактируйте сущности непосредственно на холсте.</p>
        </div>
        <ViewToolbar
          views={runtime.views}
          selectedViewId={runtime.selectedViewId}
          layoutMode={runtime.layoutMode}
          scopeId={semantic.selection?.id ?? null}
          busy={runtime.busy}
          hasManualLayout={runtime.hasManualLayout}
          onSelectView={runtime.selectView}
          onCreateView={(id, title) => {
            const scope = semantic.selection?.id
            return scope ? runtime.createView(scope, id, title) : Promise.resolve(false)
          }}
          onLayoutModeChange={runtime.setLayoutMode}
          onImportLayout={event => void runtime.importLayout(event)}
          onExportLayout={runtime.exportLayout}
          onResetLayout={() => void runtime.resetLayout()} />
        <div className="actions" aria-label="Панели редактора">
          <button type="button" aria-expanded={structureOpen} onClick={() => setStructureOpen(open => !open)}>Структура</button>
          <button type="button" aria-expanded={inspectorOpen} onClick={() => setInspectorOpen(open => !open)}>Инспектор</button>
          <button type="button" aria-expanded={codeOpen} onClick={() => setCodeOpen(open => !open)}>Код</button>
        </div>
        <div className="actions" aria-label="Действия с рабочим пространством">
          <label className="button">Открыть .c4<input aria-label="Открыть файл .c4" type="file" accept=".c4,text/plain" onChange={event => void durable.importSource(event)} /></label>
          <label className="button">Импортировать ZIP<input aria-label="Импортировать архив рабочего пространства" type="file" accept=".zip,application/zip" onChange={event => void durable.importBundle(event)} /></label>
          <button type="button" onClick={() => downloadSource(runtime.source)}>Экспортировать model.c4</button>
          <button type="button" disabled={runtime.busy || state.compilation.status !== 'valid'} onClick={durable.exportBundle}>Экспортировать ZIP</button>
          <button type="button" aria-label="Отменить последнее изменение" disabled={undoDisabled} onClick={() => void semantic.undo()}>Отменить</button>
          <button type="button" aria-label="Повторить отменённое изменение" disabled={redoDisabled} onClick={() => void semantic.redo()}>Повторить</button>
          <button type="button" disabled={runtime.busy} onClick={() => semantic.updateDraftSource(starterSource)}>Восстановить пример</button>
        </div>
        <p role="status" aria-live="polite">
          {durable.status === 'saving'
            ? 'Сохранение рабочего пространства…'
            : durable.status === 'error'
            ? 'Не удалось сохранить рабочее пространство.'
            : 'Рабочее пространство сохранено.'}
        </p>
      </header>

      <section
        className="workspace canvas-dominant-workspace"
        aria-label="Рабочая область редактора LikeC4"
        style={{ '--workspace-columns': workspaceColumns } as CSSProperties}>
        {structureOpen && (
          <section className="panel structure-panel" aria-label="Структура модели">
            <h2>Структура</h2>
            <StructureTree
              nodes={semantic.structure}
              selectedId={semantic.selection?.id ?? null}
              disabled={semantic.canvasDisabled}
              onSelect={id => canvas.selectElement(id)} />
          </section>
        )}

        <section
          ref={diagramPanel}
          className="panel diagram-panel"
          aria-label="Холст диаграммы"
          tabIndex={0}
          onPointerDownCapture={beginConnectionGesture}>
          <header>
            <h2>Диаграмма</h2>
            <ProfessionalCanvasToolbar
              availableKinds={semantic.availableKinds}
              activeKind={semantic.activeKind}
              busy={semantic.canvasDisabled}
              gridVisible={professional.gridVisible}
              snapEnabled={professional.snapEnabled}
              gridStep={professional.gridStep}
              onCreate={semantic.activateCreateTool}
              onLayout={action => void professional.applyLayout(action)}
              onSelectAll={professional.selectAll}
              onFitSelection={() => void professional.fitSelection()}
              onFitView={() => void professional.fitView()}
              onGridVisibleChange={professional.setGridVisible}
              onSnapEnabledChange={professional.setSnapEnabled}
              onGridStepChange={professional.setGridStep} />
            <div className="actions" aria-label="Инструменты связей">
              <button type="button" aria-label="Связать элементы" aria-pressed={semantic.relationActive} disabled={semantic.canvasDisabled || semantic.elements.length < 2} onClick={semantic.activateRelationTool}>Связать</button>
              <button type="button" aria-label="Добавить направленный шаг" aria-pressed={wp06.connectionMode === 'dynamic-step'} disabled={runtime.busy || wp06.selectedViewType !== 'dynamic' || wp06.logicalElements.length < 2} onClick={wp06.activateDynamicStep}>Добавить шаг</button>
              <button type="button" aria-label="Создать связь развёртывания" aria-pressed={wp06.connectionMode === 'deployment-relation'} disabled={runtime.busy || wp06.selectedViewType !== 'deployment' || wp06.deploymentElements.length < 2} onClick={wp06.activateDeploymentRelation}>Связь развёртывания</button>
            </div>
          </header>

          {runtime.renderModel && runtime.selectedView
            ? <LikeC4EditorProvider editor={runtime.editor}>
                <LikeC4ModelProvider likec4model={runtime.renderModel}>
                  <ReactLikeC4
                    key={`${runtime.selectedView.id}-${runtime.layoutMode}`}
                    viewId={runtime.selectedView.id}
                    layoutType={runtime.layoutMode}
                    className="diagram"
                    nodesSelectable
                    background={professional.gridVisible ? 'lines' : 'transparent'}
                    reactFlowProps={{
                      snapToGrid: professional.snapEnabled,
                      snapGrid: [professional.gridStep, professional.gridStep],
                      selectionKeyCode: 'Shift',
                      multiSelectionKeyCode: ['Meta', 'Control'],
                      selectNodesOnDrag: false,
                    }}
                    enableCompareWithLatest
                    onLayoutTypeChange={runtime.setLayoutMode}
                    onInitialized={({ diagram, xyflow }) => {
                      diagram.toggleFeature('ReadOnly', !canvasAuthoringEnabled)
                      semantic.diagramApi.current = diagram
                      professional.attachXYFlow(xyflow)
                      screenToFlowPosition.current = position => xyflow.screenToFlowPosition(position)
                    }}
                    onNodeClick={node => {
                      if (node.modelRef) canvas.selectElement(node.modelRef as Fqn)
                    }}
                    onNodeDblClick={(node, event) => {
                      if (node.modelRef) {
                        canvas.startInlineTitle(node.modelRef as Fqn, overlayPoint({ x: event.clientX, y: event.clientY }))
                      }
                    }}
                    onNodeContextMenu={(node, event) => {
                      event.preventDefault()
                      if (node.modelRef) canvas.selectElement(node.modelRef as Fqn)
                      setContextMenu({ kind: 'node', screenPosition: { x: event.clientX, y: event.clientY } })
                    }}
                    onEdgeClick={edge => {
                      canvas.selectEdge(edge)
                      setInspectorOpen(true)
                    }}
                    onEdgeContextMenu={(edge, event) => {
                      event.preventDefault()
                      canvas.selectEdge(edge)
                      setContextMenu({ kind: 'edge', screenPosition: { x: event.clientX, y: event.clientY } })
                    }}
                    onCanvasContextMenu={event => {
                      event.preventDefault()
                      const screenPosition = { x: event.clientX, y: event.clientY }
                      const position = flowPoint(screenPosition)
                      setContextMenu({
                        kind: 'canvas',
                        screenPosition,
                        ...(position ? { flowPosition: position } : {}),
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
                          runtime.setCommandError('Рабочее пространство или текущий вид изменились. Повторите действие.')
                          return
                        }
                        const position = flowPoint(connection.screenPosition)
                        if (position) {
                          canvas.requestCreation(
                            position,
                            overlayPoint(connection.screenPosition),
                            connection.sourceId as Fqn,
                          )
                        }
                      }
                      : null}
                    onCanvasClick={event => {
                      setContextMenu(null)
                      const screen = { x: event.clientX, y: event.clientY }
                      const position = flowPoint(screen)
                      if (!position) return
                      if (semantic.activeKind) {
                        const kind = semantic.activeKind
                        void canvas.createElementAt(kind, position, overlayPoint(screen)).then(created => {
                          if (created) {
                            semantic.controller.current?.cancel('tool-change')
                            runtime.setFeedback('Элемент создан в выбранной позиции.')
                          }
                        })
                        return
                      }
                      professional.clearVisualSelection()
                      canvas.clearSelection()
                    }}
                    onCanvasDblClick={event => {
                      if (semantic.activeKind || runtime.selectedView?._type !== 'element') return
                      const screen = { x: event.clientX, y: event.clientY }
                      const position = flowPoint(screen)
                      if (position) canvas.requestCreation(position, overlayPoint(screen))
                    }} />
                </LikeC4ModelProvider>
              </LikeC4EditorProvider>
            : <p className="empty">В проекте нет подходящего вида для отображения.</p>}

          {contextMenu && (
            <CanvasContextMenu
              kind={contextMenu.kind}
              x={contextMenu.screenPosition.x}
              y={contextMenu.screenPosition.y}
              canRemoveNode={!!semantic.selection}
              hasManualLayout={runtime.hasManualLayout}
              onClose={() => {
                setContextMenu(null)
                diagramPanel.current?.focus()
              }}
              onEdit={() => {
                setContextMenu(null)
                setInspectorOpen(true)
                if (contextMenu.kind === 'edge') focusRelationTitle()
              }}
              onRenameNode={() => {
                setContextMenu(null)
                if (semantic.selection) canvas.startInlineTitle(semantic.selection.id, overlayPoint(contextMenu.screenPosition))
              }}
              onConnectNode={() => {
                setContextMenu(null)
                semantic.activateRelationTool()
              }}
              onRemoveNode={() => {
                setContextMenu(null)
                void semantic.inspectRemoval()
              }}
              onRemoveEdge={() => {
                setContextMenu(null)
                void removeSelectedCanvasEdge()
              }}
              onCreateElement={() => {
                const position = contextMenu.flowPosition ?? flowPoint(contextMenu.screenPosition)
                setContextMenu(null)
                if (position) canvas.requestCreation(position, overlayPoint(contextMenu.screenPosition))
              }}
              onSelectAll={() => {
                setContextMenu(null)
                professional.selectAll()
              }}
              onAutoLayout={() => {
                setContextMenu(null)
                runtime.setLayoutMode('auto')
                runtime.setFeedback('Показана автоматическая раскладка.')
              }}
              onResetLayout={() => {
                setContextMenu(null)
                void runtime.resetLayout()
              }}
              onFitView={() => {
                setContextMenu(null)
                void professional.fitView()
              }} />
          )}

          {canvas.pendingCreation && (
            <CanvasCreateMenu
              screenPosition={canvas.pendingCreation.screenPosition}
              connected={!!canvas.pendingCreation.sourceId}
              availableKinds={semantic.availableKinds}
              busy={runtime.busy}
              onCreate={kind => void canvas.createPendingElement(kind)}
              onCancel={() => {
                canvas.cancelCreation()
                diagramPanel.current?.focus()
              }} />
          )}

          {canvas.inlineTitle && (
            <InlineTitleEditor
              id={canvas.inlineTitle.id}
              value={canvas.inlineTitle.value}
              screenPosition={canvas.inlineTitle.screenPosition}
              busy={runtime.busy}
              onChange={canvas.updateInlineTitle}
              onSave={() => void canvas.saveInlineTitle().then(saved => {
                if (saved) diagramPanel.current?.focus()
              })}
              onCancel={canvas.cancelInlineTitle}
              onReturnFocus={() => diagramPanel.current?.focus()} />
          )}

          {canvasAuthoringEnabled && runtime.selectedView && <p aria-live="polite">Потяните точку подключения к существующему элементу или на пустое место.</p>}
          {semantic.activeKind && <p aria-live="polite">Щёлкните по холсту или нажмите Enter, чтобы создать элемент.</p>}
          {wp06.connectionMode === 'dynamic-step' && <p aria-live="polite">Соедините два логических элемента, чтобы создать направленный шаг.</p>}
          {wp06.connectionMode === 'deployment-relation' && <p aria-live="polite">Соедините две сущности развёртывания, чтобы создать связь.</p>}

          {semantic.relationActive && (
            <section className="relation-controls" aria-label="Создание связи с клавиатуры">
              <p aria-live="polite">Перетащите маркер исходного элемента на целевой или выберите элементы ниже.</p>
              <label>Исходный элемент<select aria-label="Исходный элемент связи" value={semantic.relationSource} onChange={event => { semantic.setRelationSource(event.target.value); runtime.setFeedback('Выберите целевой элемент.') }}><option value="">Выберите исходный элемент</option>{semantic.elements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
              <label>Целевой элемент<select aria-label="Целевой элемент связи" value={semantic.relationTarget} onChange={event => semantic.setRelationTarget(event.target.value)}><option value="">Выберите целевой элемент</option>{semantic.elements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
              <button type="button" disabled={runtime.busy || !semantic.relationSource || !semantic.relationTarget || semantic.relationSource === semantic.relationTarget} onClick={() => semantic.completeRelation(semantic.relationSource, semantic.relationTarget)}>Создать связь</button>
            </section>
          )}
          {runtime.feedback && <p role="status" aria-live="polite">{runtime.feedback}</p>}
          {runtime.persistenceNotice && <p role="status" aria-live="polite">{runtime.persistenceNotice}</p>}
          {runtime.commandError && <p className="error" role="alert">{runtime.commandError}</p>}
        </section>

        {inspectorOpen && (
          <section className="panel inspector-panel" aria-label="Инспектор">
            <RelationInspector
              selection={canvas.selection}
              relation={canvas.selectedLogicalRelation}
              dynamicStep={canvas.selectedDynamicStep}
              deploymentRelation={canvas.selectedDeploymentRelation}
              alternatives={canvas.relationAlternatives}
              busy={runtime.busy}
              onSelectAlternative={canvas.selectRelationAlternative}
              onPatch={async title => {
                const saved = await canvas.patchSelectedRelation(title)
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
            <Wp06Controls wp06={wp06} busy={runtime.busy} />
            {(!canvas.selection || canvas.selection.family === 'logical-element' || canvas.selection.family === 'deployment-element') && (
              <ElementInspector element={semantic.selectedElement} availableTags={semantic.availableTags} parents={semantic.parents} disabled={state.compilation.status !== 'valid'} busy={runtime.busy} error={semantic.inspectorError} onPatch={semantic.patchElement} onRename={semantic.renameElement} onMove={semantic.moveElement} onRemove={semantic.inspectRemoval} />
            )}
          </section>
        )}

        {codeOpen && (
          <section className="panel code-panel" aria-label="Код LikeC4">
            <h2>Код LikeC4</h2>
            <textarea aria-label="Исходный код LikeC4" value={runtime.source} onChange={event => semantic.updateDraftSource(event.target.value)} spellCheck={false} />
            {state.compilation.diagnostics.length > 0 && <section className="diagnostics" aria-live="polite"><h2>Ошибки</h2><ul>{state.compilation.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.line ?? 0}-${index}`}>{diagnostic.line ? `Строка ${diagnostic.line}: ` : ''}{diagnostic.message}</li>)}</ul></section>}
            <p>Ревизия проекта: {state.revision}</p>
          </section>
        )}
      </section>

      {semantic.removalReport && <RemoveElementConfirmation report={semantic.removalReport} busy={runtime.busy} onCancel={semantic.closeRemoval} onConfirm={semantic.confirmRemoval} />}
    </main>
  )
}

function isEditableTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && !!target.closest('input, textarea, select, [contenteditable="true"], .monaco-editor')
}
