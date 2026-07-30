import type { ElementKind } from '@likec4/core/types'
import {
  createCanvasIntentController,
  LikeC4ModelProvider,
  ReactLikeC4,
} from '@likec4/diagram'
import type { CanvasIntent, CanvasIntentController } from '@likec4/diagram'
import type { ChangeEvent, KeyboardEvent as ReactKeyboardEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { compile } from './compiler'
import { starterSource } from './document'
import type { EditorWorkspaceState } from './editor/contracts'
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

export function App() {
  const workspace = useRef<EditorWorkspace | null>(null)
  const [state, setState] = useState<EditorWorkspaceState | null>(null)
  const [activeKind, setActiveKind] = useState<ElementKind | null>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
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

  const refresh = (): void => {
    const current = workspace.current?.state
    if (current) {
      setState(current)
      localStorage.setItem(storageKey, current.draftSources[0]?.content ?? '')
    }
  }

  const updateDraftSource = (content: string): void => {
    const current = workspace.current
    if (!current) return
    setCommandError(null)
    setFeedback(null)
    const pending = current.updateDraft([{ uri: documentUri, content }])
    refresh()
    void pending.then(refresh)
  }

  const createElement = async (kind: ElementKind): Promise<void> => {
    const current = workspace.current
    if (!current) return
    const result = await current.dispatch({
      id: Date.now(),
      expectedRevision: current.state.revision,
      semantic: { type: 'element.create', input: { kind, documentUri } },
    })
    refresh()
    setActiveKind(null)
    if (result.status === 'applied') {
      setCommandError(null)
      setFeedback(`Создан элемент ${result.createdElementId}.`)
      return
    }
    if (result.status === 'conflict') {
      setCommandError('Проект изменился. Повторите действие на актуальной версии.')
      return
    }
    setCommandError(result.issues[0]?.message ?? 'Не удалось создать элемент.')
  }

  intentHandler.current = intent => {
    switch (intent.type) {
      case 'element.create.requested':
        void createElement(intent.elementKind)
        return
      case 'interaction.cancelled':
        setActiveKind(null)
        return
      case 'selection.changed':
      case 'relation.create.requested':
        return
    }
  }

  const activateCreateTool = (kind: ElementKind): void => {
    controller.current?.startElementCreation(kind)
    setActiveKind(kind)
    setFeedback(null)
    setCommandError(null)
  }

  const confirmKeyboardCreate = (event: ReactKeyboardEvent<HTMLElement>): void => {
    if (event.key === 'Escape') {
      if (controller.current?.handleKeyDown(event.key)) event.preventDefault()
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && activeKind) {
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

  if (!state) return <main className="editor-shell"><p>Загрузка редактора…</p></main>

  const source = state.draftSources[0]?.content ?? ''
  const renderModel = state.compilation.model ?? state.lastValidModel
  const views = renderModel ? Object.values(renderModel.$data.views) : []
  const selectedView = views.find(candidate => candidate.id === 'index') ?? views[0]
  const availableKinds = new Set(Object.keys(state.lastValidModel?.$data.specification.elements ?? {}))
  const canvasDisabled = state.compilation.status !== 'valid'

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div>
          <h1>LikeC4: визуальный редактор</h1>
          <p>Создавайте элементы на диаграмме; исходный код обновляется автоматически.</p>
        </div>
        <div className="actions">
          <label className="button">
            Импортировать .c4
            <input type="file" accept=".c4,text/plain" onChange={event => void importSource(event)} />
          </label>
          <button type="button" onClick={() => downloadSource(source)}>Экспортировать model.c4</button>
          <button type="button" onClick={() => updateDraftSource(starterSource)}>Восстановить пример</button>
        </div>
      </header>

      <section className="workspace" aria-label="Рабочая область редактора LikeC4">
        <section
          className="panel diagram-panel"
          aria-label="Холст диаграммы"
          tabIndex={0}
          onKeyDown={confirmKeyboardCreate}>
          <header>
            <h2>Диаграмма</h2>
            <div className="actions" aria-label="Создание элемента">
              {createKinds.map(([kind, label]) => {
                const unavailable = !availableKinds.has(kind)
                const disabled = canvasDisabled || unavailable
                return (
                  <button
                    key={kind}
                    type="button"
                    aria-label={`Создать: ${label}`}
                    aria-pressed={activeKind === kind}
                    disabled={disabled}
                    title={unavailable ? 'Этот тип элемента недоступен в текущей спецификации.' : undefined}
                    onClick={() => activateCreateTool(kind)}>
                    {label}
                  </button>
                )
              })}
            </div>
          </header>
          {renderModel && selectedView ?
            (
              <LikeC4ModelProvider likec4model={renderModel}>
                <ReactLikeC4
                  viewId={selectedView.id}
                  className="diagram"
                  onCanvasClick={event => {
                    if (!activeKind) return
                    controller.current?.requestElementCreation({ x: event.clientX, y: event.clientY })
                  }} />
              </LikeC4ModelProvider>
            ) :
            <p className="empty">В проекте нет подходящего вида для отображения.</p>}
          {activeKind && <p aria-live="polite">Кликните по холсту или нажмите Enter, чтобы создать элемент.</p>}
          {feedback && <p role="status">{feedback}</p>}
          {commandError && <p className="error" role="alert">{commandError}</p>}
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
                    {diagnostic.line ? `Строка ${diagnostic.line}: ` : ''}{diagnostic.message}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <p>Ревизия проекта: {state.revision}</p>
        </section>
      </section>
    </main>
  )
}
