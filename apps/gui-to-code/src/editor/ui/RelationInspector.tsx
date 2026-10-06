import type { RelationId } from '@likec4/core/types'
import { useEffect, useRef, useState } from 'react'
import type { RelationPatch } from '../contracts'
import type { CanvasEntityRef, EditableEdgeDetails } from '../use-canvas-entity-editor'
import type { InspectorSelectionGuard } from './ElementInspector'
import { TagCreator } from './TagCreator'
import { TechnologySelect } from './TechnologySelect'

interface InspectorConfig {
  readonly heading: string
  readonly sourceLabel: string
  readonly targetLabel: string
  readonly deleteLabel: string
  readonly details: EditableEdgeDetails
  readonly onPatch: (title: string, patch?: RelationPatch) => Promise<boolean>
  readonly onRemove: () => Promise<boolean>
}

export function RelationInspector({
  selection,
  relation,
  dynamicStep,
  deploymentRelation,
  alternatives,
  busy,
  disabledReason,
  onSelectionGuardChange,
  onDirtyChange,
  onSelectAlternative,
  availableTags = [],
  onCreateTag,
  onPatch,
  onRemove,
  onPatchDynamicStep,
  onRemoveDynamicStep,
  onPatchDeploymentRelation,
  onRemoveDeploymentRelation,
}: {
  readonly availableTags?: readonly string[]
  readonly onCreateTag?: (name: string) => Promise<boolean>
  readonly selection: CanvasEntityRef | null
  readonly relation: EditableEdgeDetails | null
  readonly dynamicStep: EditableEdgeDetails | null
  readonly deploymentRelation: EditableEdgeDetails | null
  readonly alternatives: readonly RelationId[]
  readonly busy: boolean
  readonly disabledReason?: string | null
  readonly onSelectionGuardChange?: (guard: InspectorSelectionGuard | null) => void
  readonly onDirtyChange?: (dirty: boolean) => void
  readonly onSelectAlternative: (id: RelationId) => void
  readonly onPatch: (title: string, patch?: RelationPatch) => Promise<boolean>
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
  const [description, setDescription] = useState(config?.details.description ?? '')
  const [technology, setTechnology] = useState(config?.details.technology ?? '')
  const [tags, setTags] = useState<readonly string[]>(config?.details.tags ?? [])
  const [saving, setSaving] = useState(false)
  const saveLock = useRef(false)
  const baseTags = [...(config?.details.tags ?? [])].sort().join('\n')
  const dirty = !!config && (title.trim() !== config.details.title
    || description !== (config.details.description ?? '')
    || technology !== (config.details.technology ?? '')
    || [...tags].sort().join('\n') !== baseTags)
  const resetDraft = () => {
    setTitle(config?.details.title ?? '')
    setDescription(config?.details.description ?? '')
    setTechnology(config?.details.technology ?? '')
    setTags(config?.details.tags ?? [])
  }
  const validTitle = !!title.trim() || !config?.details.title
  const active = !!config
  const guardRef = useRef<InspectorSelectionGuard>(() => {})
  guardRef.current = (_nextId, proceed, cancel) => {
    if (saveLock.current) {
      cancel?.()
      return
    }
    if (dirty && !window.confirm('Свойства не сохранены. Отбросить изменения и продолжить?')) {
      cancel?.()
      return
    }
    if (dirty) resetDraft()
    proceed()
  }

  useEffect(() => {
    if (!active) return
    onSelectionGuardChange?.((nextId, proceed, cancel) => guardRef.current(nextId, proceed, cancel))
    return () => onSelectionGuardChange?.(null)
  }, [active, onSelectionGuardChange])
  useEffect(() => {
    if (active) onDirtyChange?.(dirty)
  }, [active, dirty, onDirtyChange])
  useEffect(() => {
    if (!active) return
    return () => onDirtyChange?.(false)
  }, [active, onDirtyChange])

  useEffect(() => {
    setTitle(config?.details.title ?? '')
    setDescription(config?.details.description ?? '')
    setTechnology(config?.details.technology ?? '')
    setTags(baseTags ? baseTags.split('\n') : [])
  }, [config?.details.id, config?.details.title, config?.details.description, config?.details.technology, baseTags])

  if (!config) return null

  const isLogical = selection?.family === 'logical-relation'
  return (
    <section
      className="relation-inspector"
      aria-label={`${config.heading}: ${config.details.sourceId} → ${config.details.targetId}`}
      tabIndex={-1}>
      <h2>{config.heading}</h2>
      {disabledReason && <p className="muted" role="status">{disabledReason}</p>}
      <dl>
        <div>
          <dt>{config.sourceLabel}</dt>
          <dd>
            <code>{config.details.sourceId}</code>
          </dd>
        </div>
        <div>
          <dt>{config.targetLabel}</dt>
          <dd>
            <code>{config.details.targetId}</code>
          </dd>
        </div>
      </dl>
      {isLogical && alternatives.length > 1 && (
        <fieldset className="inspector-section">
          <legend>Связи на выбранном ребре</legend>
          <div className="actions">
            {alternatives.map((id, index) => (
              <button
                key={id}
                type="button"
                aria-pressed={id === config.details.id}
                disabled={busy || saving}
                onClick={() => {
                  if (id === config.details.id) return
                  guardRef.current(null, () => onSelectAlternative(id))
                }}>
                Связь {index + 1}
              </button>
            ))}
          </div>
        </fieldset>
      )}
      <form
        onSubmit={event => {
          event.preventDefault()
          if (busy || saveLock.current || !validTitle || !dirty) return
          const patch: RelationPatch = {
            ...(title.trim() !== config.details.title ? { title: title.trim() } : {}),
            ...(description !== (config.details.description ?? '') ? { description: description || null } : {}),
            ...(technology !== (config.details.technology ?? '') ? { technology: technology || null } : {}),
            ...([...tags].sort().join('\n') !== baseTags ? { tags } : {}),
          }
          saveLock.current = true
          setSaving(true)
          void (isLogical ? config.onPatch(title, patch) : config.onPatch(title)).finally(() => {
            saveLock.current = false
            setSaving(false)
          })
        }}>
        <label>
          Название
          <input
            data-relation-title-input
            aria-label={`Название: ${config.heading.toLocaleLowerCase('ru-RU')}`}
            value={title}
            disabled={busy || saving}
            onChange={event => setTitle(event.target.value)} />
        </label>
        {isLogical && (
          <>
            <label>
              Описание связи
              <textarea
                className="compact-textarea"
                aria-label="Описание связи"
                value={description}
                disabled={busy || saving}
                onChange={event => setDescription(event.target.value)} />
            </label>
            <TechnologySelect
              label="Технология связи"
              value={technology}
              disabled={busy || saving}
              onChange={setTechnology} />
            <fieldset className="inspector-section" disabled={busy || saving}>
              <legend>Теги связи</legend>
              {availableTags.length === 0 && <p className="empty">Создайте тег, чтобы назначить его связи.</p>}
              {availableTags.map(tag => (
                <label className="tag-option" key={tag}>
                  <input
                    type="checkbox"
                    checked={tags.includes(tag)}
                    onChange={event =>
                      setTags(
                        event.target.checked ? [...tags, tag] : tags.filter(value => value !== tag),
                      )} />#{tag}
                </label>
              ))}
              {onCreateTag && (
                <TagCreator availableTags={availableTags} disabled={busy || saving} onCreate={onCreateTag} />
              )}
            </fieldset>
          </>
        )}
        <div className="actions">
          <button
            type="submit"
            disabled={busy || saving || !validTitle || !dirty}>
            Сохранить
          </button>
          <button
            type="button"
            className="danger"
            disabled={busy || saving}
            onClick={() => guardRef.current(null, () => void config.onRemove())}>
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
  readonly onPatch: (title: string, patch?: RelationPatch) => Promise<boolean>
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
