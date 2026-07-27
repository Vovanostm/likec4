import { LikeC4ModelProvider, ReactLikeC4 } from '@likec4/diagram'
import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useState } from 'react'
import { type Compilation, compile } from './compiler'
import { type EditorCommand, applyCommand, starterSource } from './document'

const storageKey = 'likec4.gui-to-code.source.v1'

function readInitialSource(): string {
  return localStorage.getItem(storageKey) ?? starterSource
}

function downloadSource(source: string): void {
  const url = URL.createObjectURL(new Blob([source], { type: 'text/plain' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = 'model.c4'
  anchor.click()
  URL.revokeObjectURL(url)
}

function sourceFromFile(event: ChangeEvent<HTMLInputElement>, setSource: (source: string) => void): void {
  const file = event.currentTarget.files?.[0]
  if (!file) return
  void file.text().then(setSource)
}

export function App() {
  const [source, setSource] = useState(readInitialSource)
  const [compilation, setCompilation] = useState<Compilation>({ errors: [], model: null })
  const [lastValidModel, setLastValidModel] = useState<Compilation['model']>(null)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [element, setElement] = useState({ id: '', kind: 'component', title: '' })
  const [relation, setRelation] = useState({ source: '', target: '', title: '' })
  const [view, setView] = useState({ id: '', of: '' })

  useEffect(() => {
    localStorage.setItem(storageKey, source)
    let active = true
    void compile(source).then(result => {
      if (!active) return
      setCompilation(result)
      if (result.model) setLastValidModel(result.model)
    })
    return () => {
      active = false
    }
  }, [source])

  const dispatch = async (command: EditorCommand): Promise<boolean> => {
    try {
      const nextSource = applyCommand(source, command)
      const result = await compile(nextSource)
      if (!result.model) {
        setCompilation(result)
        setCommandError(result.errors[0] ?? 'The command produced invalid LikeC4 DSL.')
        return false
      }
      setSource(nextSource)
      setCompilation(result)
      setLastValidModel(result.model)
      setCommandError(null)
      return true
    } catch (error) {
      setCommandError(error instanceof Error ? error.message : String(error))
      return false
    }
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

  const renderModel = compilation.model ?? lastValidModel
  const elements = renderModel ? Object.values(renderModel.$data.elements) : []
  const views = renderModel ? Object.values(renderModel.$data.views) : []
  const selectedView = views.find(candidate => candidate.id === 'index') ?? views[0]

  return (
    <main className="editor-shell">
      <header className="topbar">
        <div>
          <h1>LikeC4 GUI-to-code</h1>
          <p>Browser-only semantic editing. The editable DSL is the single source of truth.</p>
        </div>
        <div className="actions">
          <label className="button">
            Import .c4
            <input type="file" accept=".c4,text/plain" onChange={event => sourceFromFile(event, setSource)} />
          </label>
          <button type="button" onClick={() => downloadSource(source)}>Export model.c4</button>
          <button type="button" onClick={() => setSource(starterSource)}>Reset sample</button>
        </div>
      </header>

      <section className="workspace" aria-label="LikeC4 editor workspace">
        <aside className="panel controls" aria-label="Semantic commands">
          <h2>Model</h2>
          <form onSubmit={submitElement}>
            <h3>Add root element</h3>
            <input
              required
              placeholder="id, e.g. payments"
              value={element.id}
              onChange={event => setElement({ ...element, id: event.target.value })} />
            <input
              required
              placeholder="kind, e.g. component"
              value={element.kind}
              onChange={event => setElement({ ...element, kind: event.target.value })} />
            <input
              required
              placeholder="Title"
              value={element.title}
              onChange={event => setElement({ ...element, title: event.target.value })} />
            <button type="submit">Add element</button>
          </form>
          <form onSubmit={submitRelation}>
            <h3>Add relation</h3>
            <input
              required
              placeholder="source FQN"
              value={relation.source}
              onChange={event => setRelation({ ...relation, source: event.target.value })} />
            <input
              required
              placeholder="target FQN"
              value={relation.target}
              onChange={event => setRelation({ ...relation, target: event.target.value })} />
            <input
              placeholder="Title (optional)"
              value={relation.title}
              onChange={event => setRelation({ ...relation, title: event.target.value })} />
            <button type="submit">Connect</button>
          </form>
          <form onSubmit={submitView}>
            <h3>Add view</h3>
            <input
              required
              placeholder="view id"
              value={view.id}
              onChange={event => setView({ ...view, id: event.target.value })} />
            <input
              required
              placeholder="scope FQN"
              value={view.of}
              onChange={event => setView({ ...view, of: event.target.value })} />
            <button type="submit">Add view</button>
          </form>
          <h2>Elements</h2>
          <ul className="tree">
            {elements.map(item => (
              <li key={item.id}>
                <code>{item.id}</code> <span>{item.title}</span>
              </li>
            ))}
          </ul>
          {commandError && <p className="error" role="alert">{commandError}</p>}
        </aside>

        <section className="panel code-panel" aria-label="Canonical LikeC4 source">
          <h2>Canonical DSL</h2>
          <textarea
            aria-label="LikeC4 source"
            value={source}
            onChange={event => setSource(event.target.value)}
            spellCheck={false} />
          {compilation.errors.length > 0 && (
            <section className="diagnostics" aria-live="polite">
              <h2>Diagnostics</h2>
              <ul>{compilation.errors.map(error => <li key={error}>{error}</li>)}</ul>
            </section>
          )}
        </section>

        <section className="panel diagram-panel" aria-label="Diagram preview">
          <h2>Live diagram</h2>
          {renderModel && selectedView ?
            (
              <LikeC4ModelProvider likec4model={renderModel}>
                <ReactLikeC4 viewId={selectedView.id} className="diagram" />
              </LikeC4ModelProvider>
            ) :
            <p className="empty">Fix the DSL to render a diagram.</p>}
        </section>
      </section>
    </main>
  )
}
