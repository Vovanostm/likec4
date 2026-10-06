import { useRef, useState } from 'react'

/** Declares tags through the workspace; assignment stays in the inspector draft. */
export function TagCreator({ availableTags, disabled, onCreate }: {
  readonly availableTags: readonly string[]
  readonly disabled: boolean
  readonly onCreate: (name: string) => Promise<boolean>
}) {
  const [name, setName] = useState('')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const button = useRef<HTMLButtonElement>(null)
  const lock = useRef(false)
  const trimmed = name.trim()
  const valid = /^([a-zA-Z]|_+[a-zA-Z0-9])[-\w]*$/.test(trimmed)
  const duplicate = availableTags.includes(trimmed)
  return (
    <div className="tag-creator">
      <label>
        Новый тег
        <input
          aria-label="Новый тег"
          value={name}
          placeholder="Например, backend"
          disabled={disabled || pending}
          onKeyDown={event => {
            if (event.key === 'Enter') {
              event.preventDefault()
              button.current?.click()
            }
          }}
          onChange={event => {
            setName(event.target.value)
            setError(null)
          }} />
      </label>
      <p className="muted">Начните с латинской буквы; далее можно использовать цифры, дефис и подчёркивание.</p>
      {duplicate && <p role="status">Этот тег уже существует — выберите его выше.</p>}
      {error && <p role="alert">{error}</p>}
      <button
        ref={button}
        type="button"
        disabled={disabled || pending || !valid || duplicate}
        onClick={async () => {
          if (disabled || lock.current || !valid || duplicate) return
          lock.current = true
          setPending(true)
          try {
            if (await onCreate(trimmed)) setName('')
            else setError('Не удалось создать тег. Проверьте сообщение об ошибке и повторите попытку.')
          } catch {
            setError('Не удалось создать тег. Повторите попытку.')
          } finally {
            lock.current = false
            setPending(false)
          }
        }}>
        Создать тег
      </button>
    </div>
  )
}
