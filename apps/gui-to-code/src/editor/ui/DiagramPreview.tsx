import type { LikeC4Model } from '@likec4/core/model'
import type { LayoutType, ViewId } from '@likec4/core/types'
import { LikeC4ModelProvider, ReactLikeC4 } from '@likec4/diagram'
import { useEffect, useRef, useState } from 'react'
import { renderTechnologyIcon } from './technology-icon'
import './DiagramPreview.css'

export interface DiagramPreviewProps {
  readonly model: LikeC4Model.Layouted
  readonly initialViewId: ViewId
  readonly hasDraft: boolean
  readonly onClose: () => void
}

/** Read-only presentation of the compiler-owned model, independent of editor tools and layer visibility. */
export function DiagramPreview({ model, initialViewId, hasDraft, onClose }: DiagramPreviewProps) {
  const dialogRef = useRef<HTMLDialogElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const viewport = useRef<{ zoomIn: () => void; zoomOut: () => void; fit: () => void } | null>(null)
  const [viewId, setViewId] = useState(initialViewId)
  const [colorScheme, setColorScheme] = useState<'light' | 'dark'>('light')
  const [layoutType, setLayoutType] = useState<LayoutType>('manual')
  const views = Object.values(model.$data.views)
  const selectedView = model.findView(viewId) ?? model.findView(initialViewId)
    ?? (views[0] ? model.findView(views[0].id) : null)

  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    // Diagram actors register body-level capture handlers, including the editor hidden behind this dialog.
    const isolateEditorHotkeys = (event: KeyboardEvent): void => {
      if (event.isComposing || !dialog || !event.composedPath().includes(dialog)) return
      const undo = (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z'
      if (!undo && !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return
      event.stopPropagation()
      if (undo) event.preventDefault()
      const select = event.target
      if (!undo && select instanceof HTMLSelectElement) {
        // The body capture handlers cannot receive arrows, so apply the header selection here.
        const direction = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1
        const option =
          select.options[Math.max(0, Math.min(select.options.length - 1, select.selectedIndex + direction))]
        if (!option) return
        event.preventDefault()
        if (select.name === 'preview-view') {
          const view = Object.values(model.$data.views).find(candidate => candidate.id === option.value)
          if (view) setViewId(view.id)
        } else if (select.name === 'preview-theme') {
          setColorScheme(option.value === 'dark' ? 'dark' : 'light')
        }
      }
    }
    window.addEventListener('keydown', isolateEditorHotkeys, true)
    dialog?.showModal()
    closeRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', isolateEditorHotkeys, true)
      dialog?.close()
      if (opener?.isConnected) opener.focus()
    }
  }, [model])

  const navigateTo = (id: string): void => {
    const view = views.find(candidate => candidate.id === id)
    if (view) setViewId(view.id)
  }

  return (
    <dialog
      ref={dialogRef}
      className="diagram-preview"
      data-color-scheme={colorScheme}
      aria-labelledby="diagram-preview-title"
      onKeyDown={event => {
        if (event.key !== 'Escape' || event.nativeEvent.isComposing) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}
      onCancel={event => {
        event.preventDefault()
        onClose()
      }}>
      <header className="diagram-preview-header">
        <div className="diagram-preview-heading">
          <h2 id="diagram-preview-title">Просмотр схемы</h2>
          <p>Так схема выглядит в LikeC4</p>
        </div>
        <label>
          Вид
          <select
            name="preview-view"
            aria-label="Вид в просмотре"
            value={selectedView?.id ?? ''}
            onChange={event => {
              const view = views.find(candidate => candidate.id === event.target.value)
              if (view) navigateTo(view.id)
            }}>
            {views.map(view => <option key={view.id} value={view.id}>{view.title ?? view.id}</option>)}
          </select>
        </label>
        <label>
          Тема
          <select
            name="preview-theme"
            aria-label="Тема просмотра"
            value={colorScheme}
            onChange={event => setColorScheme(event.target.value === 'dark' ? 'dark' : 'light')}>
            <option value="light">Светлая</option>
            <option value="dark">Тёмная</option>
          </select>
        </label>
        <div className="actions" role="group" aria-label="Масштаб просмотра">
          <button type="button" aria-label="Уменьшить масштаб просмотра" onClick={() => viewport.current?.zoomOut()}>
            −
          </button>
          <button type="button" onClick={() => viewport.current?.fit()}>Показать всю схему</button>
          <button type="button" aria-label="Увеличить масштаб просмотра" onClick={() => viewport.current?.zoomIn()}>
            +
          </button>
        </div>
        <button ref={closeRef} type="button" onClick={onClose}>Вернуться к редактированию</button>
      </header>
      {hasDraft && (
        <p className="diagram-preview-warning" role="status">
          Показана последняя корректная версия. Неприменённые изменения и ошибки кода не включены в просмотр.
        </p>
      )}
      <div className="diagram-preview-canvas">
        {selectedView && (
          <LikeC4ModelProvider likec4model={model}>
            <ReactLikeC4
              key={`${selectedView.id}:${layoutType}`}
              viewId={selectedView.id}
              layoutType={layoutType}
              colorScheme={colorScheme}
              locale="ru"
              style={{ width: '100%', height: '100%' }}
              renderIcon={renderTechnologyIcon}
              controls={false}
              pannable
              zoomable
              nodesSelectable
              enableFocusMode
              enableElementTags
              enableNotations
              enableDynamicViewWalkthrough
              enableCompareWithLatest
              showNavigationButtons
              onNavigateTo={navigateTo}
              onLayoutTypeChange={setLayoutType}
              reactFlowProps={{
                'aria-label': 'Готовая схема LikeC4',
                nodesDraggable: false,
                'ariaLabelConfig': {
                  'node.a11yDescription.default': 'Элемент готовой схемы. Двойной щелчок — выделить связи.',
                  'node.a11yDescription.keyboardDisabled': 'Элемент готовой схемы. Перемещение отключено.',
                  'edge.a11yDescription.default': 'Связь готовой схемы.',
                },
              }}
              onInitialized={({ diagram, xyflow }) => {
                viewport.current = {
                  zoomIn: () => {
                    void xyflow.zoomIn()
                  },
                  zoomOut: () => {
                    void xyflow.zoomOut()
                  },
                  fit: () => diagram.fitDiagram(),
                }
              }} />
          </LikeC4ModelProvider>
        )}
      </div>
    </dialog>
  )
}
