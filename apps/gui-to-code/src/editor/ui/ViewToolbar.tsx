import type { LayoutedView, LayoutType, ViewId } from '@likec4/core/types'
import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'

export interface ViewToolbarProps {
  readonly views: readonly LayoutedView[]
  readonly selectedViewId: ViewId | null
  readonly layoutMode: LayoutType
  readonly scopeId: string | null
  readonly busy: boolean
  readonly hasManualLayout: boolean
  readonly onSelectView: (viewId: ViewId) => void
  readonly onCreateView: (id: string, title: string) => Promise<boolean>
  readonly onLayoutModeChange: (mode: LayoutType) => void
  readonly onImportLayout: (event: ChangeEvent<HTMLInputElement>) => void
  readonly onExportLayout: () => void
  readonly onResetLayout: () => void
}

export function ViewToolbar({
  views,
  selectedViewId,
  layoutMode,
  scopeId,
  busy,
  hasManualLayout,
  onSelectView,
  onCreateView,
  onLayoutModeChange,
  onImportLayout,
  onExportLayout,
  onResetLayout,
}: ViewToolbarProps) {
  const createButton = useRef<HTMLButtonElement | null>(null)
  const idInput = useRef<HTMLInputElement | null>(null)
  const selector = useRef<HTMLSelectElement | null>(null)
  const [open, setOpen] = useState(false)
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')

  useEffect(() => {
    if (open) queueMicrotask(() => idInput.current?.focus())
  }, [open])

  const close = (): void => {
    setOpen(false)
    setId('')
    setTitle('')
    queueMicrotask(() => createButton.current?.focus())
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (!id.trim()) {
      idInput.current?.focus()
      return
    }
    if (await onCreateView(id.trim(), title.trim())) {
      setOpen(false)
      setId('')
      setTitle('')
      queueMicrotask(() => selector.current?.focus())
    }
  }

  return (
    <section className="view-toolbar" aria-label="Вид и раскладка">
      <label>
        Текущий вид
        <select
          ref={selector}
          aria-label="Текущий вид"
          value={selectedViewId ?? ''}
          disabled={busy || views.length === 0}
          onChange={event => onSelectView(event.target.value as ViewId)}>
          {views.length === 0 && <option value="">Нет доступных видов</option>}
          {views.map(view => (
            <option key={view.id} value={view.id}>{view.title ?? view.id} ({view.id})</option>
          ))}
        </select>
      </label>

      <button
        ref={createButton}
        type="button"
        disabled={busy || !scopeId}
        aria-describedby={!scopeId ? 'create-view-disabled-reason' : undefined}
        onClick={() => setOpen(true)}>
        Создать вид
      </button>
      {!scopeId && (
        <span id="create-view-disabled-reason" className="visually-hidden">
          Сначала выберите логический элемент.
        </span>
      )}

      <label>
        Режим раскладки
        <select
          aria-label="Режим раскладки"
          value={layoutMode}
          disabled={busy || !selectedViewId}
          onChange={event => onLayoutModeChange(event.target.value as LayoutType)}>
          <option value="manual">Ручная</option>
          <option value="auto">Автоматическая</option>
        </select>
      </label>

      <label className="button">
        Импортировать раскладку
        <input
          type="file"
          accept=".likec4.snap,application/json"
          disabled={busy || !selectedViewId}
          onChange={onImportLayout} />
      </label>
      <button type="button" disabled={busy || !hasManualLayout} onClick={onExportLayout}>
        Экспортировать раскладку
      </button>
      <button type="button" disabled={busy || !hasManualLayout} onClick={onResetLayout}>
        Сбросить раскладку
      </button>

      {open && scopeId && (
        <form
          className="view-create-form"
          aria-label="Создание статического вида"
          onSubmit={event => void submit(event)}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}>
          <p>Область вида: <code>{scopeId}</code></p>
          <label>
            ID вида
            <input
              ref={idInput}
              value={id}
              required
              aria-label="ID нового вида"
              onChange={event => setId(event.target.value)} />
          </label>
          <label>
            Название (необязательно)
            <input
              value={title}
              aria-label="Название нового вида"
              onChange={event => setTitle(event.target.value)} />
          </label>
          <button type="submit" disabled={busy}>Создать</button>
          <button type="button" disabled={busy} onClick={close}>Отмена</button>
        </form>
      )}
    </section>
  )
}
