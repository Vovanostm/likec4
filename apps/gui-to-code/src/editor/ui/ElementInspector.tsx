import type { Fqn } from '@likec4/core/types'
import { useEffect, useState } from 'react'
import type { ElementFormValues } from './element-form'
import { currentParent, localId } from './selection'

export interface InspectorElement {
  readonly id: Fqn
  readonly title: string
  readonly description?: string | null
  readonly technology?: string | null
  readonly tags?: readonly string[]
}

export interface ElementInspectorProps {
  readonly element: InspectorElement | null
  readonly availableTags: readonly string[]
  readonly parents: readonly { readonly id: Fqn; readonly title: string }[]
  readonly disabled: boolean
  readonly busy: boolean
  readonly error: string | null
  readonly onPatch: (values: ElementFormValues) => Promise<void>
  readonly onRename: (newId: string) => Promise<void>
  readonly onMove: (parentId: Fqn | null) => Promise<void>
  readonly onRemove: () => Promise<void>
}

export function ElementInspector({
  element,
  availableTags,
  parents,
  disabled,
  busy,
  error,
  onPatch,
  onRename,
  onMove,
  onRemove,
}: ElementInspectorProps) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [technology, setTechnology] = useState('')
  const [tags, setTags] = useState<readonly string[]>([])
  const [identifier, setIdentifier] = useState('')
  const [parent, setParent] = useState('')

  useEffect(() => {
    setTitle(element?.title ?? '')
    setDescription(element?.description ?? '')
    setTechnology(element?.technology ?? '')
    setTags(element?.tags ?? [])
    setIdentifier(element ? localId(element.id) : '')
    setParent(element ? currentParent(element.id) ?? '' : '')
  }, [element])

  if (!element) {
    return (
      <section className="inspector" aria-label="Инспектор элемента">
        <h2>Инспектор</h2>
        <p className="empty">Выберите логический элемент на диаграмме или в структуре.</p>
      </section>
    )
  }

  const controlsDisabled = disabled || busy
  return (
    <section className="inspector" aria-label="Инспектор элемента">
      <h2>Инспектор</h2>
      <p><strong>{element.title}</strong></p>
      <p><code>{element.id}</code></p>
      {error && <p className="error" role="alert">{error}</p>}

      <form
        aria-label="Основные свойства"
        onSubmit={event => {
          event.preventDefault()
          void onPatch({ title, description, technology, tags })
        }}>
        <h3>Основные свойства</h3>
        <label>
          Название
          <input
            id="element-title"
            value={title}
            disabled={controlsDisabled}
            required
            onChange={event => setTitle(event.target.value)} />
        </label>
        <label>
          Описание
          <textarea
            className="compact-textarea"
            value={description}
            disabled={controlsDisabled}
            onChange={event => setDescription(event.target.value)} />
        </label>
        <label>
          Технология
          <input
            value={technology}
            disabled={controlsDisabled}
            onChange={event => setTechnology(event.target.value)} />
        </label>
        <fieldset disabled={controlsDisabled}>
          <legend>Теги</legend>
          {availableTags.length === 0
            ? <p className="empty">В спецификации нет тегов.</p>
            : availableTags.map(tag => (
              <label className="tag-option" key={tag}>
                <input
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={event => {
                    setTags(event.target.checked
                      ? [...tags, tag]
                      : tags.filter(candidate => candidate !== tag))
                  }} />
                #{tag}
              </label>
            ))}
        </fieldset>
        <button type="submit" disabled={controlsDisabled || !title.trim()}>Сохранить свойства</button>
      </form>

      <form
        aria-label="Идентификатор элемента"
        onSubmit={event => {
          event.preventDefault()
          void onRename(identifier)
        }}>
        <h3>Идентификатор</h3>
        <label>
          Текущий FQN
          <input value={element.id} readOnly />
        </label>
        <label>
          Локальный ID
          <input
            id="element-local-id"
            value={identifier}
            disabled={controlsDisabled}
            required
            onChange={event => setIdentifier(event.target.value)} />
        </label>
        <button type="submit" disabled={controlsDisabled || !identifier.trim() || identifier === localId(element.id)}>
          Переименовать
        </button>
      </form>

      <form
        aria-label="Родитель элемента"
        onSubmit={event => {
          event.preventDefault()
          void onMove(parent ? parent as Fqn : null)
        }}>
        <h3>Родитель</h3>
        <label>
          Родитель
          <select value={parent} disabled={controlsDisabled} onChange={event => setParent(event.target.value)}>
            <option value="">Без родителя</option>
            {parents.map(option => (
              <option key={option.id} value={option.id}>{option.title} ({option.id})</option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={controlsDisabled || parent === (currentParent(element.id) ?? '')}>
          Переместить
        </button>
      </form>

      <section className="danger-zone" aria-label="Опасная зона">
        <h3>Опасная зона</h3>
        <button
          type="button"
          className="danger-button"
          disabled={controlsDisabled}
          onClick={() => void onRemove()}>
          Удалить элемент
        </button>
      </section>
      {disabled && <p className="empty">Исправьте ошибки проекта, чтобы изменить элемент.</p>}
    </section>
  )
}
