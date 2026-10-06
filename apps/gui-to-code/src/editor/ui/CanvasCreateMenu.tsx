import type { ElementKind } from '@likec4/core/types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CanvasPosition } from '../contracts'
import { availableCanvasElementKinds } from './canvas-element-kinds'
import { type CanvasMenuDismissReason, canvasMenuFocusIndex, dismissCanvasMenu } from './CanvasQuickCreateMenu'
import { isTitleComposition, observeInlineTitlePlacement } from './InlineTitleEditor'

export interface CanvasCreationRequest {
  readonly kind: ElementKind
  readonly title?: string
}

export async function submitCanvasCreation(
  lock: { current: boolean },
  request: CanvasCreationRequest,
  create: (request: CanvasCreationRequest) => Promise<boolean>,
): Promise<boolean | null> {
  if (lock.current) return null
  lock.current = true
  try {
    return await create(request)
  } finally {
    lock.current = false
  }
}

export function CanvasCreateMenu({
  screenPosition,
  connected,
  availableKinds,
  kindTitles,
  busy,
  onCreate,
  onCancel,
}: {
  readonly screenPosition: CanvasPosition
  readonly connected: boolean
  readonly availableKinds: ReadonlySet<string>
  readonly kindTitles?: ReadonlyMap<string, string>
  readonly busy: boolean
  readonly onCreate: (request: CanvasCreationRequest) => Promise<boolean>
  readonly onCancel: (reason: CanvasMenuDismissReason) => void
}) {
  const menu = useRef<HTMLElement | null>(null)
  const titleInput = useRef<HTMLInputElement | null>(null)
  const composing = useRef(false)
  const submitting = useRef(false)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<ElementKind | null>(null)
  const [title, setTitle] = useState('')

  useLayoutEffect(() => {
    const element = menu.current
    if (!element) return
    return observeInlineTitlePlacement(element, screenPosition)
  }, [screenPosition])

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])

  useEffect(() => {
    if (connected && selectedKind) titleInput.current?.focus()
  }, [connected, selectedKind])

  useEffect(() => {
    const dismiss = (event: PointerEvent): void => {
      if (busy || submitting.current) return
      if (event.target instanceof Node && menu.current?.contains(event.target)) return
      dismissCanvasMenu(menu.current, 'outside', onCancel)
    }
    document.addEventListener('pointerdown', dismiss)
    return () => document.removeEventListener('pointerdown', dismiss)
  }, [busy, onCancel])

  const create = async (request: CanvasCreationRequest): Promise<void> => {
    if (busy || submitting.current || composing.current || !availableKinds.has(request.kind)) return
    setPending(true)
    setError(null)
    try {
      const saved = await submitCanvasCreation(submitting, request, onCreate)
      if (saved === false) setError('Элемент не создан. Введённые данные сохранены; повторите попытку.')
    } catch {
      setError('Не удалось создать элемент. Введённые данные сохранены; повторите попытку.')
    } finally {
      setPending(false)
    }
  }

  return (
    <section
      ref={menu}
      className="canvas-create-menu"
      aria-busy={busy || pending}
      aria-label="Создать элемент на холсте"
      style={{ left: screenPosition.x, top: screenPosition.y, transform: 'none', overflowY: 'auto' }}
      onKeyDown={event => {
        if (isTitleComposition(event.nativeEvent, composing.current)) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          if (!busy && !submitting.current) dismissCanvasMenu(menu.current, 'escape', onCancel)
        } else if (!connected && event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          dismissCanvasMenu(menu.current, 'tab', onCancel, event.shiftKey)
        } else if (!connected) {
          const items = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button:not(:disabled)') ?? [])
          const current = items.findIndex(item => item === document.activeElement)
          const next = canvasMenuFocusIndex(current, items.length, event.key)
          if (next !== null) {
            event.preventDefault()
            event.stopPropagation()
            items[next]?.focus()
          }
        }
      }}>
      <h3>{connected ? 'Создать и связать' : 'Создать элемент'}</h3>
      <p>{connected ? 'Выберите тип и задайте название нового целевого элемента.' : 'Выберите тип элемента.'}</p>
      <div className="actions" role="group" aria-label="Тип нового элемента">
        {availableCanvasElementKinds(availableKinds, kindTitles).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            tabIndex={connected ? 0 : -1}
            aria-pressed={connected ? selectedKind === kind : undefined}
            disabled={busy || pending || !availableKinds.has(kind)}
            onClick={() => {
              if (connected) {
                setSelectedKind(kind)
              } else {
                void create({ kind })
              }
            }}>
            {label}
          </button>
        ))}
      </div>
      {connected && (
        <>
          <label>
            Название
            <input
              ref={titleInput}
              aria-label="Название нового элемента"
              value={title}
              disabled={busy || pending}
              onChange={event => setTitle(event.target.value)}
              onCompositionStart={() => {
                composing.current = true
              }}
              onCompositionEnd={() => {
                composing.current = false
              }}
              onKeyDown={event => {
                if (isTitleComposition(event.nativeEvent, composing.current)) return
                const currentTitle = event.currentTarget.value.trim()
                if (event.key === 'Enter' && selectedKind && currentTitle && !busy) {
                  event.preventDefault()
                  event.stopPropagation()
                  void create({ kind: selectedKind, title: currentTitle })
                }
              }} />
          </label>
          <button
            type="button"
            disabled={busy || pending || !selectedKind || !title.trim()}
            onClick={() => {
              if (selectedKind && title.trim()) void create({ kind: selectedKind, title: title.trim() })
            }}>
            Создать и связать
          </button>
        </>
      )}
      <button
        type="button"
        tabIndex={connected ? 0 : -1}
        className="secondary-button"
        disabled={busy || pending}
        onClick={() => {
          if (!submitting.current) dismissCanvasMenu(menu.current, 'cancel', onCancel)
        }}>
        Отмена
      </button>
      {error && <p className="error" role="alert">{error}</p>}
    </section>
  )
}
