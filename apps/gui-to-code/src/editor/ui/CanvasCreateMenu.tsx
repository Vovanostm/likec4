import type { ElementKind } from '@likec4/core/types'
import { useEffect, useRef, useState } from 'react'
import type { CanvasPosition } from '../contracts'

export interface CanvasCreationRequest {
  readonly kind: ElementKind
  readonly title?: string
}

export function CanvasCreateMenu({
  screenPosition,
  connected,
  availableKinds,
  busy,
  onCreate,
  onCancel,
}: {
  readonly screenPosition: CanvasPosition
  readonly connected: boolean
  readonly availableKinds: ReadonlySet<string>
  readonly busy: boolean
  readonly onCreate: (request: CanvasCreationRequest) => void
  readonly onCancel: () => void
}) {
  const menu = useRef<HTMLElement | null>(null)
  const titleInput = useRef<HTMLInputElement | null>(null)
  const [selectedKind, setSelectedKind] = useState<ElementKind | null>(null)
  const [title, setTitle] = useState('')

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])

  useEffect(() => {
    if (connected && selectedKind) titleInput.current?.focus()
  }, [connected, selectedKind])

  const kinds = [
    ['actor' as ElementKind, 'Актор'],
    ['system' as ElementKind, 'Система'],
    ['component' as ElementKind, 'Компонент'],
  ] as const

  return (
    <section
      ref={menu}
      className="canvas-create-menu"
      aria-label="Создать элемент на холсте"
      style={{ left: screenPosition.x, top: screenPosition.y }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          onCancel()
        }
      }}>
      <h3>{connected ? 'Создать и связать' : 'Создать элемент'}</h3>
      <p>{connected ? 'Выберите тип и задайте название нового целевого элемента.' : 'Выберите тип элемента.'}</p>
      <div className="actions" role="group" aria-label="Тип нового элемента">
        {kinds.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            aria-pressed={connected ? selectedKind === kind : undefined}
            disabled={busy || !availableKinds.has(kind)}
            onClick={() => {
              if (connected) {
                setSelectedKind(kind)
              } else {
                onCreate({ kind })
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
              disabled={busy}
              onChange={event => setTitle(event.target.value)}
              onKeyDown={event => {
                if (event.key === 'Enter' && selectedKind && title.trim() && !busy) {
                  event.preventDefault()
                  onCreate({ kind: selectedKind, title: title.trim() })
                }
              }} />
          </label>
          <button
            type="button"
            disabled={busy || !selectedKind || !title.trim()}
            onClick={() => {
              if (selectedKind) onCreate({ kind: selectedKind, title: title.trim() })
            }}>
            Создать и связать
          </button>
        </>
      )}
      <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Отмена</button>
    </section>
  )
}
