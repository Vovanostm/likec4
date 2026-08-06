import type { ElementKind } from '@likec4/core/types'
import { useEffect, useRef } from 'react'
import type { CanvasPosition } from '../contracts'

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
  readonly onCreate: (kind: ElementKind) => void
  readonly onCancel: () => void
}) {
  const menu = useRef<HTMLElement | null>(null)

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [])

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
      <p>{connected ? 'Выберите тип нового целевого элемента.' : 'Выберите тип элемента.'}</p>
      <div className="actions" role="group" aria-label="Тип нового элемента">
        {kinds.map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            disabled={busy || !availableKinds.has(kind)}
            onClick={() => onCreate(kind)}>
            {label}
          </button>
        ))}
      </div>
      <button type="button" className="secondary-button" disabled={busy} onClick={onCancel}>Отмена</button>
    </section>
  )
}
