import type { RelationId } from '@likec4/core/types'
import { useEffect, useState } from 'react'
import type { CanvasEntityRef } from '../use-canvas-entity-editor'

interface LogicalRelationDetails {
  readonly id: RelationId
  readonly title: string
  readonly sourceId: string
  readonly targetId: string
}

export function RelationInspector({
  selection,
  relation,
  alternatives,
  busy,
  onSelectAlternative,
  onPatch,
  onRemove,
}: {
  readonly selection: CanvasEntityRef | null
  readonly relation: LogicalRelationDetails | null
  readonly alternatives: readonly RelationId[]
  readonly busy: boolean
  readonly onSelectAlternative: (id: RelationId) => void
  readonly onPatch: (title: string) => Promise<boolean>
  readonly onRemove: () => Promise<boolean>
}) {
  const [title, setTitle] = useState(relation?.title ?? '')

  useEffect(() => {
    setTitle(relation?.title ?? '')
  }, [relation?.id, relation?.title])

  if (!selection || selection.family === 'logical-element' || selection.family === 'deployment-element') return null

  if (selection.family !== 'logical-relation' || !relation) {
    const family = selection.family === 'dynamic-step' ? 'dynamic step' : 'deployment relation'
    return (
      <section className="relation-inspector" aria-label={`Выбран ${family}`} tabIndex={-1}>
        <h2>Связь на холсте</h2>
        <p><code>{selection.id}</code></p>
        <p>Выбранный {family} доступен для навигации и контекстного создания. Изменение metadata и удаление source-preserving planner пока не поддерживает.</p>
      </section>
    )
  }

  return (
    <section
      className="relation-inspector"
      aria-label={`Связь ${relation.sourceId} → ${relation.targetId}`}
      tabIndex={-1}>
      <h2>Связь</h2>
      <p><code>{relation.sourceId}</code> → <code>{relation.targetId}</code></p>
      {alternatives.length > 1 && (
        <fieldset>
          <legend>Связи на выбранном ребре</legend>
          <div className="actions">
            {alternatives.map((id, index) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === relation.id}
                onClick={() => onSelectAlternative(id)}>
                Связь {index + 1}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <form onSubmit={event => {
        event.preventDefault()
        void onPatch(title)
      }}>
        <label>
          Название связи
          <input
            aria-label="Название выбранной связи"
            value={title}
            disabled={busy}
            onChange={event => setTitle(event.target.value)} />
        </label>
        <div className="actions">
          <button type="submit" disabled={busy || !title.trim() || title.trim() === relation.title}>Сохранить</button>
          <button type="button" className="danger" disabled={busy} onClick={() => void onRemove()}>Удалить связь</button>
        </div>
      </form>
    </section>
  )
}
