import { LikeC4ModelProvider, ReactLikeC4 } from '@likec4/diagram'
import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { type Compilation, compile } from './compiler'
import { type EditorCommand, starterSource } from './document'
import {
  CompilationSequence,
  type EditorRuntimeState,
  applyDraftCompilation,
  applyEditorCommand,
} from './editor-state'
import { userError, userMessages } from './user-messages'

const storageKey = 'likec4.gui-to-code.source.v1'

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
  const initialSource = readInitialSource()
  const [runtime, setRuntime] = useState<EditorRuntimeState>({
    source: initialSource,
    compilation: { errors: [], model: null },
    lastValidModel: null,
  })
  const [commandError, setCommandError] = useState<string | null>(null)
  const [element, setElement] = useState({ id: '', kind: 'component', title: '' })
  const [relation, setRelation] = useState({ source: '', target: '', title: '' })
  const [view, setView] = useState({ id: '', of: '' })
  const compilationSequence = useRef(new CompilationSequence())
  const validatedSource = useRef<string | null>(null)

  const source = runtime.source
  const compilation = runtime.compilation

  useEffect(() => {
    localStorage.setItem(storageKey, source)
    if (validatedSource.current === source) {
      validatedSource.current = null
      return
    }
    const sequence = compilationSequence.current.next()
    void compile(source).then(result => {
      if (!compilationSequence.current.isCurrent(sequence)) return
      setRuntime(current => applyDraftCompilation(current, source, result))
    })
  }, [source])

  const updateDraftSource = (nextSource: string): void => {
    validatedSource.current = null
    setCommandError(null)
    setRuntime(current => ({ ...current, source: nextSource }))
  }

  const importSource = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      const nextSource = await file.text()
      if (!nextSource.length) {
        setCommandError(userMessages.importEmpty)
        return
      }
      updateDraftSource(nextSource)
    } catch (error) {
      setCommandError(userError(userMessages.importFailed, error instanceof Error ? error.message : String(error)))
    } finally {
      input.value = ''
    }
  }

  const dispatch = async (command: EditorCommand): Promise<boolean> => {
    const result = await applyEditorCommand(runtime, command, compile)
    if (result.status === 'rejected') {
      setCommandError(result.message)
      return false
    }
    compilationSequence.current.next()
    validatedSource.current = result.state.source
    setRuntime(result.state)
    setCommandError(null)
    return true
  }

  const submitElement = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await dispatch({ type: 'add-element', ...element })) setElement({ id: '', kind: element.kind, title: '' })
  }
  const submitRelation = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await dispatch({ type: 'add-relation', ...relation })) setRelation({ source: '', target: '', title: '' })
  }
  const submitView = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (await dispatch({ type: 'add-view', ...view })) setView({ id: '', of: '' })
  }

  const renderModel = compilation.model ?? runtime.lastValidModel
  const elements = renderModel ? Object.values(renderModel.$data.elements) : []
  const views = renderModel ? Object.values(renderModel.$data.views) : []
  const selectedView = views.find(candidate => candidate.id === 'index') ?? views[0]

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div>
          <h1>LikeC4: визуальный редактор</h1>
          <p>Семантический редактор LikeC4, работающий полностью в браузере.</p>
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
        <aside className="panel controls" aria-label="Команды модели">
          <h2>Модель</h2>
          <form onSubmit={submitElement}>
            <h3>Добавить корневой элемент</h3>
            <input
              required
              placeholder="Идентификатор, например payments"
              value={element.id}
              onChange={event => setElement({ ...element, id: event.target.value })} />
            <input
              required
              placeholder="Тип, например component"
              value={element.kind}
              onChange={event => setElement({ ...element, kind: event.target.value })} />
            <input
              required
              placeholder="Название"
              value={element.title}
              onChange={event => setElement({ ...element, title: event.target.value })} />
            <button type="submit">Добавить элемент</button>
          </form>
          <form onSubmit={submitRelation}>
            <h3>Добавить связь</h3>
            <input
              required
              placeholder="Источник связи, например shop.web"
              value={relation.source}
              onChange={event => setRelation({ ...relation, source: event.target.value })} />
            <input
              required
              placeholder="Цель связи, например payments"
              value={relation.target}
              onChange={event => setRelation({ ...relation, target: event.target.value })} />
            <input
              placeholder="Подпись связи — необязательно"
              value={relation.title}
              onChange={event => setRelation({ ...relation, title: event.target.value })} />
            <button type="submit">Связать</button>
          </form>
          <form onSubmit={submitView}>
            <h3>Добавить вид</h3>
            <input
              required
              placeholder="Идентификатор вида"
              value={view.id}
              onChange={event => setView({ ...view, id: event.target.value })} />
            <input
              required
              placeholder="Область вида, например shop"
              value={view.of}
              onChange={event => setView({ ...view, of: event.target.value })} />
            <button type="submit">Добавить вид</button>
          </form>
          <h2>Элементы</h2>
          <ul className="tree">
            {elements.map(item => (
              <li key={item.id}>
                <code>{item.id}</code> <span>{item.title}</span>
              </li>
            ))}
          </ul>
          {commandError && <p className="error" role="alert">{commandError}</p>}
        </aside>

        <section className="panel code-panel" aria-label="Код LikeC4">
          <h2>Код LikeC4</h2>
          <textarea
            aria-label="Исходный код LikeC4"
            value={source}
            onChange={event => updateDraftSource(event.target.value)}
            spellCheck={false} />
          {compilation.errors.length > 0 && (
            <section className="diagnostics" aria-live="polite">
              <h2>Ошибки</h2>
              <ul>{compilation.errors.map(error => <li key={error}>{error}</li>)}</ul>
            </section>
          )}
        </section>

        <section className="panel diagram-panel" aria-label="Предпросмотр диаграммы">
          <h2>Диаграмма</h2>
          {renderModel && selectedView ?
            (
              <LikeC4ModelProvider likec4model={renderModel}>
                <ReactLikeC4 viewId={selectedView.id} className="diagram" />
              </LikeC4ModelProvider>
            ) :
            <p className="empty">Исправьте код LikeC4, чтобы отобразить диаграмму.</p>}
        </section>
      </section>
    </main>
  )
}
