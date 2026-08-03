import type { ElementKind, Fqn } from '@likec4/core/types'
import { LikeC4EditorProvider, LikeC4ModelProvider, ReactLikeC4 } from '@likec4/diagram'
import { starterSource } from './document'
import { downloadSource } from './editor/file-downloads'
import { useDurableWorkspace } from './editor/use-durable-workspace'
import { ElementInspector } from './editor/ui/ElementInspector'
import { RemoveElementConfirmation } from './editor/ui/RemoveElementConfirmation'
import { StructureTree } from './editor/ui/StructureTree'
import { ViewToolbar } from './editor/ui/ViewToolbar'
import { Wp06Controls } from './editor/ui/Wp06Controls'
import { useSemanticEditor } from './editor/use-semantic-editor'
import { useWorkspaceRuntime } from './editor/use-workspace-runtime'
import { useWp06Runtime } from './editor/use-wp06-runtime'
import './editor.css'

export { downloadSource }

const createKinds = [
  ['actor' as ElementKind, 'Актор'],
  ['system' as ElementKind, 'Система'],
  ['component' as ElementKind, 'Компонент'],
] as const

export function App() {
  const runtime = useWorkspaceRuntime()
  const durable = useDurableWorkspace(runtime)
  const semantic = useSemanticEditor(runtime)
  const wp06 = useWp06Runtime(runtime)
  const state = runtime.state

  if (!state || durable.status === 'loading') {
    return <main className="editor-shell" aria-busy="true"><p role="status">Восстановление workspace…</p></main>
  }

  const undoDisabled = state.history.past.length === 0 || state.compilation.status !== 'valid' || runtime.busy
  const redoDisabled = state.history.future.length === 0 || state.compilation.status !== 'valid' || runtime.busy
  const connectionHandler = wp06.connectionMode
    ? (sourceId: string, targetId: string) => { void wp06.completeCanvasConnection(sourceId, targetId) }
    : semantic.relationActive
    ? (sourceId: string, targetId: string) => semantic.completeRelation(sourceId, targetId)
    : null

  return (
    <main
      className="editor-shell"
      onKeyDown={event => {
        if (event.key === 'Escape' && wp06.connectionMode) wp06.cancelConnection()
        semantic.handleEditorKeyDown(event)
      }}>
      <header className="topbar">
        <div>
          <h1>LikeC4: визуальный редактор</h1>
          <p>Выбирайте элементы, виды и раскладку; исходный код обновляется безопасно.</p>
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
        <div className="actions">
          <label className="button">Открыть .c4<input type="file" accept=".c4,text/plain" onChange={event => void durable.importSource(event)} /></label>
          <label className="button">Импортировать workspace ZIP<input type="file" accept=".zip,application/zip" onChange={event => void durable.importBundle(event)} /></label>
          <button type="button" onClick={() => downloadSource(runtime.source)}>Экспортировать model.c4</button>
          <button type="button" disabled={runtime.busy || state.compilation.status !== 'valid'} onClick={durable.exportBundle}>Экспортировать workspace ZIP</button>
          <button type="button" aria-label="Отменить последнее изменение" disabled={undoDisabled} onClick={() => void semantic.undo()}>Отменить</button>
          <button type="button" aria-label="Повторить отменённое изменение" disabled={redoDisabled} onClick={() => void semantic.redo()}>Повторить</button>
          <button type="button" disabled={runtime.busy} onClick={() => semantic.updateDraftSource(starterSource)}>Восстановить пример</button>
        </div>
        <p role="status" aria-live="polite">
          {durable.status === 'saving'
            ? 'Сохранение workspace…'
            : durable.status === 'error'
            ? 'Ошибка сохранения workspace.'
            : 'Workspace сохранён.'}
        </p>
      </header>

      <section className="workspace" aria-label="Рабочая область редактора LikeC4">
        <section className="panel structure-panel" aria-label="Структура модели">
          <h2>Структура</h2>
          <StructureTree nodes={semantic.structure} selectedId={semantic.selection?.id ?? null} disabled={semantic.canvasDisabled} onSelect={id => semantic.selectElement(id)} />
        </section>

        <section className="panel diagram-panel" aria-label="Холст диаграммы" tabIndex={0}>
          <header>
            <h2>Диаграмма</h2>
            <div className="actions" aria-label="Инструменты диаграммы">
              {createKinds.map(([kind, label]) => {
                const unavailable = !semantic.availableKinds.has(kind)
                return <button key={kind} type="button" aria-label={`Создать: ${label}`} aria-pressed={semantic.activeKind === kind} disabled={semantic.canvasDisabled || unavailable} title={unavailable ? 'Этот тип элемента недоступен в текущей спецификации.' : undefined} onClick={() => semantic.activateCreateTool(kind)}>{label}</button>
              })}
              <button type="button" aria-label="Связать элементы" aria-pressed={semantic.relationActive} disabled={semantic.canvasDisabled || semantic.elements.length < 2} onClick={semantic.activateRelationTool}>Связать</button>
              <button type="button" aria-label="Добавить шаг" aria-pressed={wp06.connectionMode === 'dynamic-step'} disabled={runtime.busy || wp06.selectedViewType !== 'dynamic' || wp06.logicalElements.length < 2} onClick={wp06.activateDynamicStep}>Добавить шаг</button>
              <button type="button" aria-label="Создать deployment-связь" aria-pressed={wp06.connectionMode === 'deployment-relation'} disabled={runtime.busy || wp06.selectedViewType !== 'deployment' || wp06.deploymentElements.length < 2} onClick={wp06.activateDeploymentRelation}>Deployment-связь</button>
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
                    enableCompareWithLatest
                    onLayoutTypeChange={runtime.setLayoutMode}
                    onInitialized={({ diagram }) => {
                      diagram.toggleFeature('ReadOnly', false)
                      semantic.diagramApi.current = diagram
                    }}
                    onNodeClick={node => { if (node.modelRef) semantic.selectElement(node.modelRef as Fqn, false) }}
                    onConnect={connectionHandler}
                    onCanvasClick={event => {
                      if (!semantic.activeKind) return
                      semantic.controller.current?.requestElementCreation({ x: event.clientX, y: event.clientY })
                    }} />
                </LikeC4ModelProvider>
              </LikeC4EditorProvider>
            : <p className="empty">В проекте нет подходящего вида для отображения.</p>}

          {semantic.activeKind && <p aria-live="polite">Кликните по холсту или нажмите Enter, чтобы создать элемент.</p>}
          {wp06.connectionMode === 'dynamic-step' && <p aria-live="polite">Соедините два логических элемента, чтобы создать направленный шаг.</p>}
          {wp06.connectionMode === 'deployment-relation' && <p aria-live="polite">Соедините две deployment-сущности, чтобы создать deployment-связь.</p>}

          {semantic.relationActive && (
            <section className="relation-controls" aria-label="Создание связи с клавиатуры">
              <p aria-live="polite">Перетащите маркер исходного элемента на целевой или выберите элементы ниже.</p>
              <label>Исходный элемент<select aria-label="Исходный элемент связи" value={semantic.relationSource} onChange={event => { semantic.setRelationSource(event.target.value); runtime.setFeedback('Выберите целевой элемент.') }}><option value="">Выберите исходный элемент</option>{semantic.elements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
              <label>Целевой элемент<select aria-label="Целевой элемент связи" value={semantic.relationTarget} onChange={event => semantic.setRelationTarget(event.target.value)}><option value="">Выберите целевой элемент</option>{semantic.elements.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}</select></label>
              <button type="button" onClick={() => semantic.completeRelation(semantic.relationSource, semantic.relationTarget)}>Создать связь</button>
            </section>
          )}
          {runtime.feedback && <p role="status" aria-live="polite">{runtime.feedback}</p>}
          {runtime.persistenceNotice && <p role="status" aria-live="polite">{runtime.persistenceNotice}</p>}
          {runtime.commandError && <p className="error" role="alert">{runtime.commandError}</p>}
        </section>

        <section className="panel inspector-panel">
          <Wp06Controls wp06={wp06} busy={runtime.busy} />
          <ElementInspector element={semantic.selectedElement} availableTags={semantic.availableTags} parents={semantic.parents} disabled={state.compilation.status !== 'valid'} busy={runtime.busy} error={semantic.inspectorError} onPatch={semantic.patchElement} onRename={semantic.renameElement} onMove={semantic.moveElement} onRemove={semantic.inspectRemoval} />
        </section>

        <section className="panel code-panel" aria-label="Код LikeC4">
          <h2>Код LikeC4</h2>
          <textarea aria-label="Исходный код LikeC4" value={runtime.source} onChange={event => semantic.updateDraftSource(event.target.value)} spellCheck={false} />
          {state.compilation.diagnostics.length > 0 && <section className="diagnostics" aria-live="polite"><h2>Ошибки</h2><ul>{state.compilation.diagnostics.map((diagnostic, index) => <li key={`${diagnostic.line ?? 0}-${index}`}>{diagnostic.line ? `Строка ${diagnostic.line}: ` : ''}{diagnostic.message}</li>)}</ul></section>}
          <p>Ревизия проекта: {state.revision}</p>
        </section>
      </section>

      {semantic.removalReport && <RemoveElementConfirmation report={semantic.removalReport} busy={runtime.busy} onCancel={semantic.closeRemoval} onConfirm={semantic.confirmRemoval} />}
    </main>
  )
}
