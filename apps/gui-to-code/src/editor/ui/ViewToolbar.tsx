import type { LayoutedView, LayoutType, ViewId } from '@likec4/core/types'
import type { ChangeEvent, FormEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { findDetailView, scopeLevelLabel, viewBreadcrumbs, viewLevelLabel } from './level-navigation'
import { viewDisplayTitle } from './view-selection'

export interface ViewToolbarProps {
  readonly views: readonly LayoutedView[]
  readonly selectedViewId: ViewId | null
  readonly layoutMode: LayoutType
  readonly scopeId: string | null
  readonly busy: boolean
  readonly mutationDisabledReason: string | null
  readonly hasManualLayout: boolean
  readonly onSelectView: (viewId: ViewId) => void
  readonly onCreateView: (id: string, title: string, scope: string | null) => Promise<boolean>
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
  mutationDisabledReason,
  hasManualLayout,
  onSelectView,
  onCreateView,
  onLayoutModeChange,
  onImportLayout,
  onExportLayout,
  onResetLayout,
}: ViewToolbarProps) {
  const createButton = useRef<HTMLButtonElement | null>(null)
  const titleInput = useRef<HTMLInputElement | null>(null)
  const selector = useRef<HTMLSelectElement | null>(null)
  const breadcrumbNav = useRef<HTMLElement | null>(null)
  const focusAfterClose = useRef<'create' | 'selector' | null>(null)
  const [open, setOpen] = useState(false)
  const [formScopeId, setFormScopeId] = useState<string | null>(null)
  const [capturedScopeId, setCapturedScopeId] = useState<string | null>(null)
  const [id, setId] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const submitLock = useRef(false)
  const composing = useRef(false)
  const currentScopeId = useRef(scopeId)
  currentScopeId.current = scopeId
  const currentFormScopeId = useRef(formScopeId)
  currentFormScopeId.current = formScopeId
  const scopeChanged = formScopeId !== null && formScopeId !== scopeId
  const creationDisabled = busy || !!mutationDisabledReason || submitting || scopeChanged
  const breadcrumbs = viewBreadcrumbs(views, selectedViewId)
  const parentView = breadcrumbs.at(-2)
  const detailView = findDetailView(views, scopeId)

  useEffect(() => {
    breadcrumbNav.current?.querySelector('[aria-current="page"]')?.scrollIntoView({
      block: 'nearest',
      inline: 'end',
    })
  }, [selectedViewId])

  useEffect(() => {
    if (open) {
      if (!busy && !submitLock.current) queueMicrotask(() => titleInput.current?.focus())
      return
    }
    if (busy || !focusAfterClose.current) return
    const target = focusAfterClose.current === 'selector' ? selector : createButton
    focusAfterClose.current = null
    requestAnimationFrame(() => target.current?.focus())
  }, [open, busy, selectedViewId])

  const close = (): void => {
    if (submitLock.current || busy) return
    focusAfterClose.current = 'create'
    setOpen(false)
    setId('')
    setTitle('')
    setError(null)
    composing.current = false
  }

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (
      busy || mutationDisabledReason || submitLock.current || composing.current
      || !open || formScopeId !== currentFormScopeId.current
      || (formScopeId !== null && formScopeId !== currentScopeId.current)
    ) return
    submitLock.current = true
    setSubmitting(true)
    setError(null)
    let created = false
    try {
      created = await onCreateView(id.trim(), title.trim() || 'Новая диаграмма', formScopeId)
      if (created) {
        focusAfterClose.current = 'selector'
        setOpen(false)
        setId('')
        setTitle('')
      } else {
        setError('Вид не создан. Проверьте данные и повторите попытку.')
      }
    } catch {
      setError('Не удалось создать вид. Введённые данные сохранены; повторите попытку.')
    } finally {
      submitLock.current = false
      setSubmitting(false)
      if (!created) requestAnimationFrame(() => titleInput.current?.focus())
    }
  }

  return (
    <section className="view-toolbar" aria-label="Вид и раскладка">
      {breadcrumbs.length > 0 && (
        <nav ref={breadcrumbNav} className="actions architecture-breadcrumbs" aria-label="Уровни архитектуры">
          {parentView && (
            <button
              className="breadcrumb-back"
              type="button"
              disabled={busy || submitting}
              onClick={() => onSelectView(parentView.id)}>
              Назад к родителю
            </button>
          )}
          {breadcrumbs.map(view => (
            <button
              key={view.id}
              type="button"
              disabled={busy || submitting || view.id === selectedViewId}
              aria-current={view.id === selectedViewId ? 'page' : undefined}
              title={`${viewLevelLabel(view)}: ${viewDisplayTitle(view)}`}
              onClick={() => onSelectView(view.id)}>
              {viewLevelLabel(view)}: {viewDisplayTitle(view)}
            </button>
          ))}
        </nav>
      )}
      <label>
        Текущий вид
        <select
          ref={selector}
          aria-label="Текущий вид"
          value={selectedViewId ?? ''}
          disabled={busy || submitting || views.length === 0}
          onChange={event => onSelectView(event.target.value as ViewId)}>
          {views.length === 0 && <option value="">Нет доступных видов</option>}
          {views.map(view => (
            <option key={view.id} value={view.id}>
              {view._type === 'element' ? `${viewLevelLabel(view)}: ` : ''}
              {viewDisplayTitle(view)} ({view.id})
            </option>
          ))}
        </select>
      </label>

      <button
        ref={createButton}
        type="button"
        disabled={busy || submitting || open || !!mutationDisabledReason}
        onClick={() => {
          if (busy || mutationDisabledReason || submitLock.current || open) return
          setFormScopeId(scopeId)
          setCapturedScopeId(scopeId)
          setError(null)
          setOpen(true)
        }}>
        Создать вид
      </button>
      {detailView && detailView.id !== selectedViewId && (
        <button
          type="button"
          disabled={busy || submitting}
          onClick={() => onSelectView(detailView.id)}>
          Открыть детализацию
        </button>
      )}
      {mutationDisabledReason && <p className="muted" role="status">{mutationDisabledReason}</p>}

      <details className="toolbar-menu layout-menu">
        <summary>Дополнительно</summary>
        <div className="toolbar-menu-content actions">
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

          <div className="actions" aria-label="Действия с раскладкой">
            <label className="button">
              Импортировать раскладку
              <input
                type="file"
                accept=".likec4.snap,application/json"
                disabled={!!mutationDisabledReason || !selectedViewId}
                onChange={onImportLayout} />
            </label>
            <button type="button" disabled={busy || !hasManualLayout} onClick={onExportLayout}>
              Экспортировать раскладку
            </button>
            <button type="button" disabled={!!mutationDisabledReason || !hasManualLayout} onClick={onResetLayout}>
              Сбросить раскладку
            </button>
          </div>
        </div>
      </details>

      {open && (
        <form
          className="view-create-form"
          aria-label="Создание статического вида"
          onSubmit={event => void submit(event)}
          onCompositionStart={() => composing.current = true}
          onCompositionEnd={() => composing.current = false}
          onKeyDown={event => {
            if (
              (event.key === 'Enter' || event.key === 'Escape')
              && (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229 || composing.current)
            ) {
              event.preventDefault()
              event.stopPropagation()
              return
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              close()
            }
          }}>
          <label>
            Уровень нового вида
            <select
              aria-label="Область нового вида"
              disabled={busy || submitting}
              value={formScopeId === null ? 'root' : 'selected'}
              onChange={event => {
                if (busy || submitLock.current) return
                setFormScopeId(event.target.value === 'root' ? null : capturedScopeId)
              }}>
              <option value="root">C1 · Контекст всей архитектуры</option>
              {capturedScopeId && (
                <option value="selected">
                  {scopeLevelLabel(capturedScopeId)} выбранного элемента
                </option>
              )}
            </select>
          </label>
          <p>
            Область вида: {formScopeId === null ? 'Вся архитектура' : <code>{formScopeId}</code>}
          </p>
          <label>
            Название (необязательно)
            <input
              ref={titleInput}
              value={title}
              disabled={busy || submitting}
              placeholder="Новая диаграмма"
              aria-label="Название нового вида"
              onChange={event => setTitle(event.target.value)} />
          </label>
          <details>
            <summary>Подробности</summary>
            <label>
              ID вида (необязательно)
              <input
                disabled={busy || submitting}
                value={id}
                aria-label="ID нового вида"
                onChange={event => setId(event.target.value)} />
            </label>
            <p className="muted">Оставьте пустым, чтобы создать ID автоматически.</p>
          </details>
          <button type="submit" disabled={creationDisabled}>Создать</button>
          <button type="button" disabled={busy || submitting} onClick={close}>Отмена</button>
          {scopeChanged && (
            <p className="muted" role="status">
              Выбранный элемент изменился. Вернитесь к исходному элементу или отмените создание вида.
            </p>
          )}
          {error && <p className="error" role="alert">{error}</p>}
        </form>
      )}
    </section>
  )
}
