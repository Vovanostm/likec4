import type { Fqn } from '@likec4/core/types'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CanvasPosition } from '../contracts'

export type InlineTitleSaveReason = 'explicit' | 'blur'

/** Bound only the floating form; the requested diagram position stays unchanged. */
export function inlineTitlePlacement(
  position: CanvasPosition | null,
  canvas: { readonly width: number; readonly height: number },
  overlay: { readonly width: number; readonly height: number },
): CanvasPosition & { readonly maxWidth: number; readonly maxHeight: number } {
  const inset = Math.min(12, canvas.width / 4, canvas.height / 4)
  const maxWidth = Math.max(0, canvas.width - inset * 2)
  const maxHeight = Math.max(0, canvas.height - inset * 2)
  return {
    x: Math.max(inset, Math.min(position?.x ?? inset, canvas.width - Math.min(overlay.width, maxWidth) - inset)),
    y: Math.max(inset, Math.min(position?.y ?? 64, canvas.height - Math.min(overlay.height, maxHeight) - inset)),
    maxWidth,
    maxHeight,
  }
}

/** Observe panel toggles and form/error growth without changing focus or React drafts. */
export function observeInlineTitlePlacement(form: HTMLElement, position: CanvasPosition | null): () => void {
  const panel = form.offsetParent
  if (!(panel instanceof HTMLElement)) return () => {}
  let active = true
  const update = (): void => {
    if (!active) return
    const canvas = { width: panel.clientWidth, height: panel.clientHeight }
    const bounds = inlineTitlePlacement(position, canvas, { width: 0, height: 0 })
    form.style.maxWidth = `${bounds.maxWidth}px`
    form.style.maxHeight = `${bounds.maxHeight}px`
    const placement = inlineTitlePlacement(position, canvas, { width: form.offsetWidth, height: form.offsetHeight })
    form.style.left = `${placement.x}px`
    form.style.top = `${placement.y}px`
  }
  update()
  const observer = new ResizeObserver(update)
  observer.observe(panel, { box: 'border-box' })
  observer.observe(form, { box: 'border-box' })
  window.addEventListener('resize', update)
  return () => {
    active = false
    observer.disconnect()
    window.removeEventListener('resize', update)
  }
}

export function isTitleComposition(
  event: { readonly isComposing: boolean; readonly keyCode: number },
  composing: boolean,
): boolean {
  return composing || event.isComposing || event.keyCode === 229
}

/** Serialize saves even before the workspace busy state reaches React. */
export async function saveInlineTitleOnce(
  lock: { current: boolean },
  busy: boolean,
  value: string,
  reason: InlineTitleSaveReason,
  save: () => Promise<boolean>,
  returnFocus: () => void,
): Promise<boolean | null> {
  if (lock.current || busy || !value.trim()) return null
  lock.current = true
  try {
    const saved = await save()
    if (saved && reason === 'explicit') returnFocus()
    return saved
  } finally {
    lock.current = false
  }
}

export function InlineTitleEditor({
  id,
  value,
  screenPosition,
  busy,
  error,
  onChange,
  onSave,
  onCancel,
  onReturnFocus,
}: {
  readonly id: Fqn
  readonly value: string
  readonly screenPosition: CanvasPosition | null
  readonly busy: boolean
  readonly error?: string | null
  readonly onChange: (value: string) => void
  readonly onSave: () => Promise<boolean>
  readonly onCancel: () => void
  readonly onReturnFocus: (reason: 'save' | 'cancel') => void
}) {
  const form = useRef<HTMLFormElement | null>(null)
  const input = useRef<HTMLInputElement | null>(null)
  const submitting = useRef(false)
  const composing = useRef(false)
  const mounted = useRef(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setError] = useState<string | null>(null)
  const displayedError = error ?? saveError

  useLayoutEffect(() => {
    return form.current ? observeInlineTitlePlacement(form.current, screenPosition) : undefined
  }, [screenPosition])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
    }
  }, [])

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [id])

  const cancel = (): void => {
    if (busy || submitting.current) return
    onCancel()
    queueMicrotask(() => onReturnFocus('cancel'))
  }

  const submit = async (reason: InlineTitleSaveReason): Promise<void> => {
    if (busy || submitting.current || composing.current || !value.trim()) return
    setSaving(true)
    setError(null)
    try {
      const saved = await saveInlineTitleOnce(submitting, busy, value, reason, onSave, () => onReturnFocus('save'))
      if (mounted.current && saved === false) {
        setError('Не удалось сохранить название. Введённое название осталось в поле; повторите попытку.')
      }
    } catch {
      if (mounted.current) {
        setError('Не удалось сохранить название. Введённое название осталось в поле; повторите попытку.')
      }
    } finally {
      if (mounted.current) setSaving(false)
    }
  }

  return (
    <form
      ref={form}
      className="inline-title-editor"
      aria-label={`Изменить название элемента ${id}`}
      aria-busy={busy || saving}
      onSubmit={event => {
        event.preventDefault()
        void submit('explicit')
      }}
      onBlur={event => {
        if (event.relatedTarget instanceof Node && event.currentTarget.contains(event.relatedTarget)) return
        void submit('blur')
      }}>
      <label>
        <span className="visually-hidden">Название элемента</span>
        <input
          ref={input}
          aria-label="Название элемента на холсте"
          value={value}
          readOnly={busy || saving}
          aria-invalid={!!displayedError}
          onChange={event => {
            setError(null)
            onChange(event.target.value)
          }}
          onCompositionStart={() => {
            composing.current = true
          }}
          onCompositionEnd={() => {
            composing.current = false
          }}
          onKeyDown={event => {
            if (isTitleComposition(event.nativeEvent, composing.current)) return
            if (event.key === 'Escape') {
              event.preventDefault()
              event.stopPropagation()
              cancel()
              return
            }
            if (event.key === 'Enter') {
              event.preventDefault()
              event.stopPropagation()
              void submit('explicit')
            }
          }} />
      </label>
      <div className="actions">
        <button type="submit" disabled={busy || saving || !value.trim()}>Сохранить</button>
        <button type="button" className="secondary-button" disabled={busy || saving} onClick={cancel}>Отмена</button>
      </div>
      {displayedError && <p className="error" role="alert">{displayedError}</p>}
    </form>
  )
}
