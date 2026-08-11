import type { Fqn } from '@likec4/core/types'
import { useEffect, useRef } from 'react'
import type { CanvasPosition } from '../contracts'

export function InlineTitleEditor({
  id,
  value,
  screenPosition,
  busy,
  onChange,
  onSave,
  onCancel,
  onReturnFocus,
}: {
  readonly id: Fqn
  readonly value: string
  readonly screenPosition: CanvasPosition | null
  readonly busy: boolean
  readonly onChange: (value: string) => void
  readonly onSave: () => void
  readonly onCancel: () => void
  readonly onReturnFocus: () => void
}) {
  const input = useRef<HTMLInputElement | null>(null)
  const submitting = useRef(false)
  const previousBusy = useRef(busy)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [id])

  useEffect(() => {
    if (previousBusy.current && !busy && submitting.current) {
      submitting.current = false
      queueMicrotask(() => input.current?.focus())
    }
    previousBusy.current = busy
  }, [busy])

  const cancel = (): void => {
    submitting.current = false
    onCancel()
    queueMicrotask(onReturnFocus)
  }

  const submit = (): void => {
    if (!busy && value.trim()) {
      submitting.current = true
      onSave()
    }
  }

  return (
    <form
      className="inline-title-editor"
      aria-label={`Изменить название элемента ${id}`}
      style={screenPosition ? { left: screenPosition.x, top: screenPosition.y } : undefined}
      onSubmit={event => {
        event.preventDefault()
        submit()
      }}>
      <label>
        <span className="visually-hidden">Название элемента</span>
        <input
          ref={input}
          aria-label="Название элемента на холсте"
          value={value}
          disabled={busy}
          onChange={event => onChange(event.target.value)}
          onBlur={() => {
            if (!submitting.current) cancel()
          }}
          onKeyDown={event => {
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              submit()
            }
          }} />
      </label>
      <div className="actions">
        <button type="submit" disabled={busy || !value.trim()} onMouseDown={event => event.preventDefault()}>Сохранить</button>
        <button type="button" className="secondary-button" disabled={busy} onMouseDown={event => event.preventDefault()} onClick={cancel}>Отмена</button>
      </div>
    </form>
  )
}
