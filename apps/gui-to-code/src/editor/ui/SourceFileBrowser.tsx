import { useState } from 'react'
import type { SourceFile, WorkspaceDiagnostic } from '../contracts'

export interface SourceFileEntry {
  readonly path: string
  readonly name: string
  readonly children: readonly SourceFileEntry[] | null
}

/** Folder hierarchy is derived from source paths and never owns model state. */
export function sourceFileEntries(sources: readonly SourceFile[]): readonly SourceFileEntry[] {
  const paths = sources.map(source => source.uri)
  function entries(prefix: string): readonly SourceFileEntry[] {
    const children = new Set(
      paths.filter(path => path.startsWith(prefix)).map(path => path.slice(prefix.length).split('/')[0]!),
    )
    return [...children].map(name => {
      const path = `${prefix}${name}`
      const directory = paths.some(candidate => candidate.startsWith(`${path}/`))
      const result: SourceFileEntry[] = []
      if (directory) result.push({ path, name, children: entries(`${path}/`) })
      if (paths.includes(path)) result.push({ path, name, children: null })
      return result
    }).flat().sort((left, right) =>
      Number(right.children !== null) - Number(left.children !== null) || left.name.localeCompare(right.name)
    )
  }
  return entries('')
}

interface SourceEntriesProps {
  readonly entries: readonly SourceFileEntry[]
  readonly activeUri: string
  readonly entryUri: string
  readonly changed: ReadonlySet<string>
  readonly errors: ReadonlySet<string>
  readonly onSelect: (uri: string) => void
}

function SourceEntries({ entries, ...props }: SourceEntriesProps) {
  return (
    <ul>
      {entries.map(entry => (
        <li key={`${entry.children ? 'folder' : 'file'}:${entry.path}`}>
          {entry.children
            ? (
              <details open>
                <summary title={entry.path}>{entry.name}</summary>
                <SourceEntries entries={entry.children} {...props} />
              </details>
            )
            : (
              <button
                type="button"
                aria-label={`Открыть файл ${entry.path}`}
                aria-current={props.activeUri === entry.path ? 'page' : undefined}
                title={entry.path}
                onClick={() => props.onSelect(entry.path)}>
                <span className="source-file-name">{entry.name}</span>
                {props.entryUri === entry.path && <span className="source-file-badge">Основной</span>}
                {props.changed.has(entry.path) && <span className="source-file-badge">Изменён</span>}
                {props.errors.has(entry.path) && <span className="source-file-error">Ошибка</span>}
              </button>
            )}
        </li>
      ))}
    </ul>
  )
}

interface SourceFileBrowserProps {
  readonly sources: readonly SourceFile[]
  readonly committedSources: readonly SourceFile[]
  readonly diagnostics: readonly WorkspaceDiagnostic[]
  readonly activeUri: string
  readonly entryUri: string
  readonly onSelect: (uri: string) => void
}

export function SourceFileBrowser(props: SourceFileBrowserProps) {
  const [query, setQuery] = useState('')
  const committed = new Map(props.committedSources.map(source => [source.uri, source.content]))
  const changed = new Set(
    props.sources.filter(source => source.content !== committed.get(source.uri)).map(source => source.uri),
  )
  const errors = new Set(props.diagnostics.flatMap(diagnostic => diagnostic.uri ? [diagnostic.uri] : []))
  const normalized = query.trim().toLocaleLowerCase()
  const sources = props.sources.filter(source => source.uri.toLocaleLowerCase().includes(normalized))
  return (
    <details className="source-files" open={props.sources.length > 1}>
      <summary>Файлы проекта ({props.sources.length})</summary>
      <input
        type="search"
        aria-label="Найти файл проекта"
        placeholder="Найти файл…"
        value={query}
        onChange={event => setQuery(event.target.value)} />
      <nav aria-label="Файлы проекта">
        <SourceEntries
          entries={sourceFileEntries(sources)}
          activeUri={props.activeUri}
          entryUri={props.entryUri}
          changed={changed}
          errors={errors}
          onSelect={props.onSelect} />
        {sources.length === 0 && <p>Файлы не найдены.</p>}
      </nav>
      {changed.size > 0 && (
        <p className="source-file-note">Изменённых файлов: {changed.size}. Черновики сохраняются при переключении.</p>
      )}
    </details>
  )
}
