import { useState } from 'react'

interface RelationElementOption {
  readonly id: string
  readonly title: string
}

/** Filtering never clears an already chosen endpoint. */
export function filterRelationElements(
  elements: readonly RelationElementOption[],
  query: string,
  source: string,
  target: string,
): readonly RelationElementOption[] {
  const words = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean)
  return elements.filter(element => {
    if (element.id === source || element.id === target) return true
    const text = `${element.title} ${element.id}`.toLocaleLowerCase()
    return words.every(word => text.includes(word))
  })
}

export function RelationControls({
  elements,
  source,
  target,
  disabled,
  onSource,
  onTarget,
  onCreate,
}: {
  readonly elements: readonly RelationElementOption[]
  readonly source: string
  readonly target: string
  readonly disabled: boolean
  readonly onSource: (id: string) => void
  readonly onTarget: (id: string) => void
  readonly onCreate: () => void
}) {
  const [query, setQuery] = useState('')
  const options = filterRelationElements(elements, query, source, target)
  return (
    <section className="relation-controls" aria-label="Создание связи с клавиатуры">
      <p aria-live="polite">Перетащите маркер исходного элемента на целевой или выберите элементы ниже.</p>
      <label className="relation-search">
        Найти элементы для связи
        <input
          type="search"
          value={query}
          placeholder="Название или путь элемента"
          onChange={event => setQuery(event.target.value)} />
      </label>
      <label>
        Исходный элемент
        <select
          aria-label="Исходный элемент связи"
          value={source}
          disabled={disabled}
          onChange={event => onSource(event.target.value)}>
          <option value="">Выберите исходный элемент</option>
          {options.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}
        </select>
      </label>
      <label>
        Целевой элемент
        <select
          aria-label="Целевой элемент связи"
          value={target}
          disabled={disabled}
          onChange={event => onTarget(event.target.value)}>
          <option value="">Выберите целевой элемент</option>
          {options.map(element => <option key={element.id} value={element.id}>{element.title} ({element.id})</option>)}
        </select>
      </label>
      <button type="button" disabled={disabled || !source || !target || source === target} onClick={onCreate}>
        Создать связь
      </button>
    </section>
  )
}
