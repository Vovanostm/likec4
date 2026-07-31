import type { ElementKind, Fqn, RelationId } from '@likec4/core/types'
import {
  createCanvasIntentController,
  LikeC4ModelProvider,
  ReactLikeC4,
} from '@likec4/diagram'
import type { CanvasIntent, CanvasIntentController, DiagramApi } from '@likec4/diagram'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { compile } from './compiler'
import { starterSource } from './document'
import { completeRelationConnection } from './editor/canvas-relation-intents'
import type {
  CommandResult,
  EditorCommand,
  EditorWorkspaceState,
  RemovalDependencyReport,
} from './editor/contracts'
import { moveOperation, patchOperation, renameOperation } from './editor/ui/element-form'
import type { ElementFormValues } from './editor/ui/element-form'
import { ElementInspector } from './editor/ui/ElementInspector'
import { RemoveElementConfirmation } from './editor/ui/RemoveElementConfirmation'
import {
  buildStructureTree,
  parentOptions,
  reconcileSelection,
  selectionAfterResult,
} from './editor/ui/selection'
import type { EditorSelection } from './editor/ui/selection'
import { StructureTree } from './editor/ui/StructureTree'
import { EditorWorkspace } from './editor/workspace'
import { userError, userMessages } from './user-messages'

const storageKey = 'likec4.gui-to-code.source.v1'
const documentUri = 'model.c4'
const createKinds = [
  ['actor' as ElementKind, 'Актор'],
  ['system' as ElementKind, 'Система'],
  ['component' as ElementKind, 'Компонент'],
] as const

function readInitialSource(): string {
  return localStorage.getItem(storageKey) ?? starterSource
}

export function downloadSource(source: string): void {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'model.c4'
  anchor.click()
  URL.revokeObjectURL(url)
}

function relationFeedback(state: EditorWorkspaceState, relationId: RelationId): string {
  const views = Object.values(state.lastValidModel?.$data.views ?? {})
  if (views.length === 0) {
    return 'Связь создана в модели, но в проекте нет подходящего вида для отображения.'
  }
  const selectedView = views.find(candidate => candidate.id === 'index') ?? views[0]!
  const visible = selectedView.edges.some(edge => edge.relations.includes(relationId))
  return visible ? 'Связь создана.' : 'Связь создана в модели, но текущий вид её не отображает.'
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.matches('input, textarea, select, [contenteditable="true"]')
}

export function App() {
  const workspace = useRef<EditorWorkspace | null>(null)
  const diagramApi = useRef<DiagramApi | null>(null)
  const removeInitiator = useRef<HTMLElement | null>(null)
  const [state, setState] = useState<EditorWorkspaceState | null>(null)
  const [selection, setSelection] = useState<EditorSelection>(null)
  const [activeKind, setActiveKind] = useState<ElementKind | null>(null)
  const [relationActive, setRelationActive] = useState(false)
  const [relationSource, setRelationSource] = useState('')
  const [relationTarget, setRelationTarget] = useState('')
  const [commandError, setCommandError] = useState<string | null>(null)
  const [inspectorError, setInspectorError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [removalReport, setRemovalReport] = useState<RemovalDependencyReport | null>(null)
  const intentHandler = useRef<(intent: CanvasIntent) => void>(() => undefined)
  const controller = useRef<CanvasIntentController | null>(null)
  if (!controller.current) {
    controller.current = createCanvasIntentController(intent => intentHandler.current(intent))
  }

  useEffect(() => {
    let cancelled = false
    void EditorWorkspace.create([{ uri: documentUri, content: readInitialSource() }], compile).then(created => {
      if (cancelled) return
      workspace.current = created
      setState(created.state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  const refresh = (): EditorWorkspaceState | null => {
    const current = workspace.current?.state ?? null
    if (current) {
      setState(current)
      localStorage.setItem(storageKey, current.draftSources[0]?.content ?? '')
    }
    return current
  }

  const resetTools = (): void => {
    setActiveKind(null)
    setRelationActive(false)
    setRelationSource('')
    setRelationTarget('')
  }

  const updateDraftSource = (content: string): void => {
    const current = workspace.current
    if (!current) return
    setCommandError(null)
    setInspectorError(null)
    setFeedback(null)
    const pending = current.updateDraft([{ uri: documentUri, content }])
    refresh()
    void pending.then(() => {
      const next = refresh()
      if (next) setSelection(previous => reconcileSelection(previous, next))
    })
  }

  const finishResult = (result: CommandResult, fallback: string): EditorWorkspaceState | null => {
    const next = refresh()
    if (next) setSelection(previous => selectionAfterResult(previous, result, next))
    if (result.status === 'conflict') {
      setInspectorError('Проект изменился. Повторите действие на актуальной версии.')
    } else if (result.status === 'rejected') {
      setInspectorError(result.issues[0]?.message ?? fallback)
    } else {
      setInspectorError(null)
      setCommandError(null)
    }
    return next
  }

  const dispatchInspectorCommand = async (command: EditorCommand): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!current) return null
    setBusy(true)
    setInspectorError(null)
    try {
      const result = await current.dispatch({
        id: Date.now(),
        expectedRevision: current.state.revision,
        semantic: command,
      })
      finishResult(result, 'Не удалось изменить элемент.')
      return result
    } finally {
      setBusy(false)
    }
  }

  const createElement = async (kind: ElementKind): Promise<void> => {
    const current = workspace.current
    if (!current) return
    setBusy(true)
    try {
      const result = await current.dispatch({
        id: Date.now(),
        expectedRevision: current.state.revision,
        semantic: { type: 'element.create', input: { kind, documentUri } },
      })
      const next = refresh()
      resetTools()
      if (result.status === 'applied' && result.command === 'element.create') {
        setSelection({ type: 'element', id: result.createdElementId })
        setCommandError(null)
        setFeedback(`Создан элемент ${result.createdElementId}.`)
        return
      }
      if (next) setSelection(previous => reconcileSelection(previous, next))
      if (result.status === 'conflict') {
        setCommandError('Проект изменился. Повторите действие на актуальной версии.')
      } else if (result.status === 'rejected') {
        setCommandError(result.issues[0]?.message ?? 'Не удалось создать элемент.')
      }
    } finally {
      setBusy(false)
    }
  }

  const createRelation = async (sourceId: Fqn, targetId: Fqn): Promise<void> => {
    const current = workspace.current
    if (!current) return
    setBusy(true)
    try {
      const result = await current.dispatch({
        id: Date.now(),
        expectedRevision: current.state.revision,
        semantic: { type: 'relation.create', input: { sourceId, targetId, documentUri } },
      })
      refresh()
      resetTools()
      if (result.status === 'applied' && result.command === 'relation.create') {
        setCommandError(null)
        setFeedback(relationFeedback(current.state, result.createdRelationId))
        return
      }
      if (result.status === 'conflict') {
        setCommandError('Проект изменился. Повторите действие на актуальной версии.')
      } else if (result.status === 'rejected') {
        setCommandError(result.issues[0]?.message ?? 'Не удалось создать связь.')
      }
    } finally {
      setBusy(false)
    }
  }

  const undo = async (): Promise<void> => {
    const current = workspace.current
    if (!current) return
    setBusy(true)
    try {
      const result = await current.undo(current.state.revision)
      finishResult(result, 'Не удалось отменить изменение.')
      resetTools()
      if (result.status === 'applied' && result.command === 'history.undo') {
        setFeedback('Изменение отменено.')
      }
    } finally {
      setBusy(false)
    }
  }

  const redo = async (): Promise<void> => {
    const current = workspace.current
    if (!current) return
    setBusy(true)
    try {
      const result = await current.redo(current.state.revision)
      finishResult(result, 'Не удалось повторить изменение.')
      resetTools()
      if (result.status === 'applied' && result.command === 'history.redo') {
        setFeedback('Изменение повторено.')
      }
    } finally {
      setBusy(false)
    }
  }

  const patchElement = async (values: ElementFormValues): Promise<void> => {
    if (!selection || !state) return
    setBusy(true)
    setInspectorError(null)
    try {
      const result = await workspace.current?.dispatch(patchOperation(selection.id, state.revision, values))
      if (!result) return
      finishResult(result, 'Не удалось сохранить свойства.')
      if (result.status === 'applied') setFeedback('Свойства элемента сохранены.')
    } finally {
      setBusy(false)
    }
  }

  const renameElement = async (newId: string): Promise<void> => {
    if (!selection || !state) return
    setBusy(true)
    try {
      const result = await workspace.current?.dispatch(renameOperation(selection.id, state.revision, newId))
      if (!result) return
      finishResult(result, 'Не удалось переименовать элемент.')
      if (result.status === 'applied' && result.command === 'element.rename') {
        setFeedback(`Элемент переименован: ${result.updatedElementId}.`)
      }
    } finally {
      setBusy(false)
    }
  }

  const moveElement = async (parentId: Fqn | null): Promise<void> => {
    if (!selection || !state) return
    setBusy(true)
    try {
      const result = await workspace.current?.dispatch(moveOperation(selection.id, state.revision, parentId))
      if (!result) return
      finishResult(result, 'Не удалось переместить элемент.')
      if (result.status === 'applied' && result.command === 'element.move') {
        setFeedback(`Элемент перемещён: ${result.updatedElementId}.`)
      }
    } finally {
      setBusy(false)
    }
  }

  const inspectRemoval = async (): Promise<void> => {
    const current = workspace.current
    if (!current || !selection) return
    removeInitiator.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setBusy(true)
    setInspectorError(null)
    try {
      const result = await current.inspectElementRemoval(selection.id, current.state.revision)
      refresh()
      if (result.status === 'ready') {
        setRemovalReport(result.report)
      } else if (result.status === 'conflict') {
        setInspectorError('Проект изменился. Проверьте удаление ещё раз.')
      } else {
        setInspectorError(result.issues[0]?.message ?? 'Не удалось проверить зависимости.')
      }
    } finally {
      setBusy(false)
    }
  }

  const closeRemoval = (): void => {
    setRemovalReport(null)
    queueMicrotask(() => removeInitiator.current?.focus())
  }

  const confirmRemoval = async (): Promise<void> => {
    const report = removalReport
    if (!report) return
    const result = await dispatchInspectorCommand({
      type: 'element.remove',
      input: {
        id: report.target,
        dependencyRevision: report.revision,
        approvedDependencyIds: report.dependencies.map(dependency => dependency.id),
      },
    })
    if (result?.status === 'applied') {
      setRemovalReport(null)
      setFeedback('Элемент и подтверждённые зависимости удалены.')
      queueMicrotask(() => {
        const target = document.querySelector<HTMLElement>('.structure-item, .diagram-panel')
        target?.focus()
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
        setFeedback(intent.interaction === 'relation-create' ? 'Создание связи отменено.' : null)
        return
      case 'selection.changed':
        return
    }
  }

  const activateCreateTool = (kind: ElementKind): void => {
    controller.current?.startElementCreation(kind)
    setActiveKind(kind)
    setRelationActive(false)
    setFeedback(null)
    setCommandError(null)
  }

  const activateRelationTool = (): void => {
    controller.current?.startRelationCreation()
    setActiveKind(null)
    setRelationActive(true)
    setRelationSource('')
    setRelationTarget('')
    setFeedback('Выберите исходный элемент.')
    setCommandError(null)
  }

  const completeRelation = (sourceId: string, targetId: string): void => {
    const currentController = controller.current
    if (!currentController || !sourceId) {
      setCommandError('Выберите исходный элемент.')
      return
    }
    if (!targetId) {
      setCommandError('Выберите целевой элемент.')
      return
    }
    const completed = completeRelationConnection(currentController, sourceId as Fqn, targetId as Fqn)
    if (!completed && sourceId === targetId) setCommandError('Нельзя связать элемент с самим собой.')
  }

  const selectElement = (id: Fqn, focusDiagram = true): void => {
    setSelection({ type: 'element', id })
    setInspectorError(null)
    if (focusDiagram) diagramApi.current?.focusOnElement(id)
  }

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      void (event.shiftKey ? redo() : undo())
      return
    }
    if (event.key === 'Escape') {
      event.preventDefault()
      if (removalReport) {
        closeRemoval()
      } else if (!controller.current?.handleKeyDown(event.key)) {
        setSelection(null)
      }
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

  const importSource = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const content = await file.text()
      if (!content.length) {
        setCommandError(userMessages.importEmpty)
        return
      }
      updateDraftSource(content)
    } catch (error) {
      setCommandError(userError(userMessages.importFailed, error instanceof Error ? error.message : String(error)))
    } finally {
      input.value = ''
    }
  }

  if (!state) {
    return <main className="editor-shell"><p>Загрузка редактора…</p></main>
  }

  const source = state.draftSources[0]?.content ?? ''
  const renderModel = state.compilation.model ?? state.lastValidModel
  const views = renderModel ? Object.values(renderModel.$data.views) : []
  const selectedView = views.find(candidate => candidate.id === 'index') ?? views[0]
  const availableKinds = new Set(Object.keys(state.lastValidModel?.$data.specification.elements ?? {}))
  const availableTags = Object.keys(state.lastValidModel?.$data.specification.tags ?? {}).sort()
  const elements = Object.values(state.lastValidModel?.$data.elements ?? {})
    .map(element => ({ id: element.id as Fqn, title: element.title }))
    .sort((left, right) => left.id.localeCompare(right.id))
  const selectedModelElement = selection ? state.lastValidModel?.$data.elements[selection.id] : undefined
  const selectedElement = selectedModelElement
    ? {
      id: selectedModelElement.id as Fqn,
      title: selectedModelElement.title,
      description: typeof selectedModelElement.description === 'string' ? selectedModelElement.description : null,
      technology: selectedModelElement.technology ?? null,
      tags: selectedModelElement.tags ?? [],
    }
    : null
  const canvasDisabled = state.compilation.status !== 'valid' || busy
  const undoDisabled = state.history.past.length === 0 || state.compilation.status !== 'valid' || busy
  const redoDisabled = state.history.future.length === 0 || state.compilation.status !== 'valid' || busy
  const structure = buildStructureTree(state)

  return (
    <main className="editor-shell" onKeyDown={handleEditorKeyDown}>
      <header className="topbar">
        <div>
          <h1>LikeC4: визуальный редактор</h1>
          <p>Выбирайте элементы, меняйте свойства и структуру; исходный код обновляется безопасно.</p>
        </div>
        <div className="actions">
          <label className="button">
            Импортировать .c4
            <input type="file" accept=".c4,text/plain" onChange={event => void importSource(event)} />
          </label>
          <button type="button" onClick={() => downloadSource(source)}>Экспортировать model.c4</button>
          <button
            type="button"
            aria-label="Отменить последнее изменение"
            disabled={undoDisabled}
            onClick={() => void undo()}>
            Отменить
          </button>
          <button
            type="button"
            aria-label="Повторить отменённое изменение"
            disabled={redoDisabled}
            onClick={() => void redo()}>
            Повторить
          </button>
          <button type="button" disabled={busy} onClick={() => updateDraftSource(starterSource)}>Восстановить пример</button>
        </div>
      </header>

      <section className="workspace" aria-label="Рабочая область редактора LikeC4">
        <section className="panel structure-panel" aria-label="Структура модели">
          <h2>Структура</h2>
          <StructureTree
            nodes={structure}
            selectedId={selection?.id ?? null}
            disabled={canvasDisabled}
            onSelect={id => selectElement(id)} />
        </section>

        <section className="panel diagram-panel" aria-label="Холст диаграммы" tabIndex={0}>
          <header>
            <h2>Диаграмма</h2>
            <div className="actions" aria-label="Инструменты диаграммы">
              {createKinds.map(([kind, label]) => {
                const unavailable = !availableKinds.has(kind)
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-label={`Создать: ${label}`}
                    aria-pressed={activeKind === kind}
                    disabled={canvasDisabled || unavailable}
                    title={unavailable ? 'Этот тип элемента недоступен в текущей спецификации.' : undefined}
                    onClick={() => activateCreateTool(kind)}>
                    {label}
                  </button>
                )
              })}
              <button
                type="button"
                aria-label="Связать элементы"
                aria-pressed={relationActive}
                disabled={canvasDisabled || elements.length < 2}
                onClick={activateRelationTool}>
                Связать
              </button>
            </div>
          </header>
          {renderModel && selectedView
            ? (
              <LikeC4ModelProvider likec4model={renderModel}>
                <ReactLikeC4
                  viewId={selectedView.id}
                  className="diagram"
                  nodesSelectable
                  onInitialized={({ diagram }) => {
                    diagramApi.current = diagram
                  }}
                  onNodeClick={node => {
                    if (node.modelRef) selectElement(node.modelRef as Fqn, false)
                  }}
                  onConnect={relationActive
                    ? (sourceId, targetId) => completeRelation(sourceId, targetId)
                    : null}
                  onCanvasClick={event => {
                    if (!activeKind) return
                    controller.current?.requestElementCreation({ x: event.clientX, y: event.clientY })
                  }} />
              </LikeC4ModelProvider>
            )
            : <p className="empty">В проекте нет подходящего вида для отображения.</p>}
          {activeKind && <p aria-live="polite">Кликните по холсту или нажмите Enter, чтобы создать элемент.</p>}
          {relationActive && (
            <section className="relation-controls" aria-label="Создание связи с клавиатуры">
              <p aria-live="polite">Перетащите маркер исходного элемента на целевой или выберите элементы ниже.</p>
              <label>
                Исходный элемент
                <select
                  aria-label="Исходный элемент связи"
                  value={relationSource}
                  onChange={event => {
                    setRelationSource(event.target.value)
                    setFeedback('Выберите целевой элемент.')
                  }}>
                  <option value="">Выберите исходный элемент</option>
                  {elements.map(element => (
                    <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                  ))}
                </select>
              </label>
              <label>
                Целевой элемент
                <select
                  aria-label="Целевой элемент связи"
                  value={relationTarget}
                  onChange={event => setRelationTarget(event.target.value)}>
                  <option value="">Выберите целевой элемент</option>
                  {elements.map(element => (
                    <option key={element.id} value={element.id}>{element.title} ({element.id})</option>
                  ))}
                </select>
              </label>
              <button type="button" onClick={() => completeRelation(relationSource, relationTarget)}>
                Создать связь
              </button>
            </section>
          )}
          {feedback && <p role="status" aria-live="polite">{feedback}</p>}
          {commandError && <p className="error" role="alert">{commandError}</p>}
        </section>

        <section className="panel inspector-panel">
          <ElementInspector
            element={selectedElement}
            availableTags={availableTags}
            parents={selection ? parentOptions(state, selection.id) : []}
            disabled={state.compilation.status !== 'valid'}
            busy={busy}
            error={inspectorError}
            onPatch={patchElement}
            onRename={renameElement}
            onMove={moveElement}
            onRemove={inspectRemoval} />
        </section>

        <section className="panel code-panel" aria-label="Код LikeC4">
          <h2>Код LikeC4</h2>
          <textarea
            aria-label="Исходный код LikeC4"
            value={source}
            onChange={event => updateDraftSource(event.target.value)}
            spellCheck={false} />
          {state.compilation.diagnostics.length > 0 && (
            <section className="diagnostics" aria-live="polite">
              <h2>Ошибки</h2>
              <ul>
                {state.compilation.diagnostics.map((diagnostic, index) => (
                  <li key={`${diagnostic.line ?? 0}-${index}`}>
                    {diagnostic.line ? `Строка ${diagnostic.line}: ` : ''}
                    {diagnostic.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p>Ревизия проекта: {state.revision}</p>
        </section>
      </section>

      {removalReport && (
        <RemoveElementConfirmation
          report={removalReport}
          busy={busy}
          onCancel={closeRemoval}
          onConfirm={confirmRemoval} />
      )}
    </main>
  )
}
