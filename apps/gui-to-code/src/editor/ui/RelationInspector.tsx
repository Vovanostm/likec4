import type { RelationId } from '@likec4/core/types'
import { useEffect, useState } from 'react'
import type { CanvasEntityRef, EditableEdgeDetails } from '../use-canvas-entity-editor'

interface InspectorConfig {
  readonly heading: string
  readonly sourceLabel: string
  readonly targetLabel: string
  readonly deleteLabel: string
  readonly details: EditableEdgeDetails
  readonly onPatch: (title: string) => Promise<boolean>
  readonly onRemove: () => Promise<boolean>
}

export function RelationInspector({
  selection,
  relation,
  dynamicStep,
  deploymentRelation,
  alternatives,
  busy,
  onSelectAlternative,
  onPatch,
  onRemove,
  onPatchDynamicStep,
  onRemoveDynamicStep,
  onPatchDeploymentRelation,
  onRemoveDeploymentRelation,
}: {
  readonly selection: CanvasEntityRef | null
  readonly relation: EditableEdgeDetails | null
  readonly dynamicStep: EditableEdgeDetails | null
  readonly deploymentRelation: EditableEdgeDetails | null
  readonly alternatives: readonly RelationId[]
  readonly busy: boolean
  readonly onSelectAlternative: (id: RelationId) => void
  readonly onPatch: (title: string) => Promise<boolean>
  readonly onRemove: () => Promise<boolean>
  readonly onPatchDynamicStep: (title: string) => Promise<boolean>
  readonly onRemoveDynamicStep: () => Promise<boolean>
  readonly onPatchDeploymentRelation: (title: string) => Promise<boolean>
  readonly onRemoveDeploymentRelation: () => Promise<boolean>
}) {
  const config = inspectorConfig({
    selection,
    relation,
    dynamicStep,
    deploymentRelation,
    onPatch,
    onRemove,
    onPatchDynamicStep,
    onRemoveDynamicStep,
    onPatchDeploymentRelation,
    onRemoveDeploymentRelation,
  })
  const [title, setTitle] = useState(config?.details.title ?? '')

  useEffect(() => {
    setTitle(config?.details.title ?? '')
  }, [config?.details.id, config?.details.title])

  if (!config) return null

  const isLogical = selection?.family === 'logical-relation'
  return (
    <section
      className="relation-inspector"
      aria-label={`${config.heading}: ${config.details.sourceId} → ${config.details.targetId}`}
      tabIndex={-1}>
      <h2>{config.heading}</h2>
      <dl>
        <div>
          <dt>{config.sourceLabel}</dt>
          <dd><code>{config.details.sourceId}</code></dd>
        </div>
        <div>
          <dt>{config.targetLabel}</dt>
          <dd><code>{config.details.targetId}</code></dd>
        </div>
      </dl>
      {isLogical && alternatives.length > 1 && (
        <fieldset>
          <legend>Связи на выбранном ребре</legend>
          <div className="actions">
            {alternatives.map((id, index) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === config.details.id}
                onClick={() => onSelectAlternative(id)}>
                Связь {index + 1}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <form onSubmit={event => {
        event.preventDefault()
        void config.onPatch(title)
      }}>
        <label>
          Название
          <input
            data-relation-title-input
            aria-label={`Название: ${config.heading.toLocaleLowerCase('ru-RU')}`}
            value={title}
            disabled={busy}
            onChange={event => setTitle(event.target.value)} />
        </label>
        <div className="actions">
          <button
            type="submit"
            disabled={busy || !title.trim() || title.trim() === config.details.title}>
            Сохранить
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy}
            onClick={() => void config.onRemove()}>
            {config.deleteLabel}
          </button>
        </div>
      </form>
    </section>
  )
}

function inspectorConfig(input: {
  readonly selection: CanvasEntityRef | null
  readonly relation: EditableEdgeDetails | null
  readonly dynamicStep: EditableEdgeDetails | null
  readonly deploymentRelation: EditableEdgeDetails | null
  readonly onPatch: (title: string) => Promise<boolean>
  readonly onRemove: () => Promise<boolean>
  readonly onPatchDynamicStep: (title: string) => Promise<boolean>
  readonly onRemoveDynamicStep: () => Promise<boolean>
  readonly onPatchDeploymentRelation: (title: string) => Promise<boolean>
  readonly onRemoveDeploymentRelation: () => Promise<boolean>
}): InspectorConfig | null {
  switch (input.selection?.family) {
    case 'logical-relation':
      return input.relation
        ? {
          heading: 'Связь',
          sourceLabel: 'Исходный элемент',
          targetLabel: 'Целевой элемент',
          deleteLabel: 'Удалить связь',
          details: input.relation,
          onPatch: input.onPatch,
          onRemove: input.onRemove,
        }
        : null
    case 'dynamic-step':
      return input.dynamicStep
        ? {
          heading: 'Направленный шаг',
          sourceLabel: 'Исходный элемент',
          targetLabel: 'Целевой элемент',
          deleteLabel: 'Удалить шаг',
          details: input.dynamicStep,
          onPatch: input.onPatchDynamicStep,
          onRemove: input.onRemoveDynamicStep,
        }
        : null
    case 'deployment-relation':
      return input.deploymentRelation
        ? {
          heading: 'Связь развёртывания',
          sourceLabel: 'Исходная сущность',
          targetLabel: 'Целевая сущность',
          deleteLabel: 'Удалить связь',
          details: input.deploymentRelation,
          onPatch: input.onPatchDeploymentRelation,
          onRemove: input.onRemoveDeploymentRelation,
        }
        : null
    case 'logical-element':
    case 'deployment-element':
    case undefined:
      return null
  }
}
