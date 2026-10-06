import type { Fqn } from '@likec4/core/types'
import { useEffect, useRef, useState } from 'react'
import type { ElementFormValues } from './element-form'
import { currentParent, localId } from './selection'
import { TagCreator } from './TagCreator'
import { technologyFields } from './technology-catalogue'
import { TechnologySelect } from './TechnologySelect'

export interface InspectorElement {
  readonly id: Fqn
  readonly title: string
  readonly description?: string | null
  readonly technology?: string | null
  readonly icon?: string | null
  readonly tags?: readonly string[]
}

export interface InspectorDraftValues extends ElementFormValues {
  readonly icon: string | null
  readonly identifier: string
  readonly parent: Fqn | null
}

export interface InspectorDraft {
  readonly base: InspectorElement
  readonly values: InspectorDraftValues
  readonly conflict: boolean
}

export function inspectorValues(element: InspectorElement): InspectorDraftValues {
  return {
    title: element.title,
    description: element.description ?? '',
    technology: element.technology ?? '',
    icon: element.icon ?? null,
    tags: [...new Set(element.tags ?? [])].sort(),
    identifier: localId(element.id),
    parent: currentParent(element.id),
  }
}

export function sameInspectorValues(left: InspectorDraftValues, right: InspectorDraftValues): boolean {
  return left.title === right.title && left.description === right.description && left.technology === right.technology &&
    (left.icon ?? null) === (right.icon ?? null) && left.identifier === right.identifier &&
    left.parent === right.parent &&
    left.tags.length === right.tags.length && left.tags.every(tag => right.tags.includes(tag))
}

export function createInspectorDraft(element: InspectorElement): InspectorDraft {
  return { base: { ...element, tags: [...(element.tags ?? [])] }, values: inspectorValues(element), conflict: false }
}

export function inspectorDraftDirty(draft: InspectorDraft): boolean {
  return !sameInspectorValues(draft.values, inspectorValues(draft.base))
}

export function reconcileInspectorDraft(
  draft: InspectorDraft | null,
  element: InspectorElement | null,
): InspectorDraft | null {
  if (!draft) return element ? createInspectorDraft(element) : null
  const changed = !element || element.id !== draft.base.id ||
    !sameInspectorValues(inspectorValues(element), inspectorValues(draft.base))
  if (!changed) return draft
  if (!inspectorDraftDirty(draft)) return element ? createInspectorDraft(element) : null
  return draft.conflict ? draft : { ...draft, conflict: true }
}

export type InspectorSelectionGuard = (nextId: Fqn | null, proceed: () => void, cancel?: () => void) => void

export function inspectorNeedsSelectionConfirmation(draft: InspectorDraft | null, nextId: Fqn | null): boolean {
  return !!draft && inspectorDraftDirty(draft) && (nextId === null || nextId !== draft.base.id)
}

type SaveSection = 'properties' | 'identifier' | 'parent'

export interface ExpectedInspectorCommit {
  readonly element: InspectorElement
  readonly section: SaveSection
}

/** A confirmed save resets only the submitted fields, preserving other local drafts. */
export function acknowledgeInspectorSave(
  draft: InspectorDraft,
  element: InspectorElement,
  section: SaveSection,
): InspectorDraft {
  const confirmed = inspectorValues(element)
  const values = section === 'properties'
    ? {
      ...draft.values,
      title: confirmed.title,
      description: confirmed.description,
      technology: confirmed.technology,
      icon: confirmed.icon,
      tags: confirmed.tags,
    }
    : section === 'identifier'
    ? { ...draft.values, identifier: confirmed.identifier }
    : { ...draft.values, parent: confirmed.parent }
  return { base: { ...element, tags: [...(element.tags ?? [])] }, values, conflict: false }
}

/** Confirm only the submitted values; an unrelated committed update remains an explicit conflict. */
export function reconcileInspectorCommit(
  draft: InspectorDraft | null,
  element: InspectorElement | null,
  expected: ExpectedInspectorCommit | null,
): { readonly draft: InspectorDraft | null; readonly expected: ExpectedInspectorCommit | null } {
  if (!expected) return { draft: reconcileInspectorDraft(draft, element), expected: null }
  if (
    draft && element && element.id === expected.element.id &&
    sameInspectorValues(inspectorValues(element), inspectorValues(expected.element))
  ) {
    return { draft: acknowledgeInspectorSave(draft, element, expected.section), expected: null }
  }
  if (
    draft && (!element || element.id !== draft.base.id ||
      !sameInspectorValues(inspectorValues(element), inspectorValues(draft.base)))
  ) {
    return { draft: reconcileInspectorDraft(draft, element), expected: null }
  }
  return { draft, expected }
}

export interface ElementInspectorProps {
  readonly element: InspectorElement | null
  readonly availableTags: readonly string[]
  readonly parents: readonly { readonly id: Fqn; readonly title: string }[]
  readonly disabled: boolean
  readonly disabledReason?: string | null
  readonly busy: boolean
  readonly error: string | null
  readonly onCreateTag?: (name: string) => Promise<boolean>
  readonly onPatch: (values: ElementFormValues) => Promise<boolean>
  readonly onRename: (newId: string) => Promise<boolean>
  readonly onMove: (parentId: Fqn | null) => Promise<boolean>
  readonly onRemove: () => Promise<void>
  /** Guard every selection/view request and keep this inspector mounted until it resolves. */
  readonly onSelectionGuardChange?: (guard: InspectorSelectionGuard | null) => void
  readonly onDirtyChange?: (dirty: boolean) => void
  readonly onRequestCanvasSelection?: () => void
  readonly emptyMessage?: string | undefined
}

export function ElementInspector({
  element,
  availableTags,
  parents,
  disabled,
  disabledReason,
  busy,
  error,
  onCreateTag,
  onPatch,
  onRename,
  onMove,
  onRemove,
  onSelectionGuardChange,
  onDirtyChange,
  onRequestCanvasSelection,
  emptyMessage,
}: ElementInspectorProps) {
  const [draft, setDraft] = useState<InspectorDraft | null>(() => element ? createInspectorDraft(element) : null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [pending, setPending] = useState<{ readonly proceed: () => void; readonly cancel?: () => void } | null>(null)
  const [saveAll, setSaveAll] = useState(false)
  const expectedCommit = useRef<ExpectedInspectorCommit | null>(null)
  const saveLock = useRef(false)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const draftFocusRef = useRef<HTMLElement | null>(null)
  const stayInDraft = () => {
    dialogRef.current?.close()
    setSaveAll(false)
    pending?.cancel?.()
    setPending(null)
    queueMicrotask(() => {
      const target = draftFocusRef.current ?? document.getElementById('element-title')
      target?.focus()
    })
  }

  // Compare values rather than the parent's freshly allocated element object.
  let currentDraft = draft
  if (!saving) {
    const reconciled = reconcileInspectorCommit(draft, element, expectedCommit.current)
    currentDraft = reconciled.draft
    expectedCommit.current = reconciled.expected
    if (currentDraft !== draft) setDraft(currentDraft)
  }
  const dirty = !!currentDraft && inspectorDraftDirty(currentDraft)
  useEffect(() => {
    onDirtyChange?.(dirty)
  }, [dirty, onDirtyChange])
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange])
  const guardRef = useRef<InspectorSelectionGuard>(() => {})
  guardRef.current = (nextId, proceed, cancel) => {
    if (saveLock.current || expectedCommit.current || pending) {
      cancel?.()
      return
    }
    if (!inspectorNeedsSelectionConfirmation(currentDraft, nextId)) {
      proceed()
    } else {
      setSaveError(null)
      if (!draftFocusRef.current) draftFocusRef.current = document.getElementById('element-title')
      setPending({ proceed, ...(cancel ? { cancel } : {}) })
    }
  }

  useEffect(() => {
    onSelectionGuardChange?.((nextId, proceed, cancel) => guardRef.current(nextId, proceed, cancel))
    return () => onSelectionGuardChange?.(null)
  }, [onSelectionGuardChange])

  useEffect(() => {
    if (!pending) return
    const dialog = dialogRef.current
    if (dialog && !dialog.open) dialog.showModal()
    return () => {
      if (dialog?.open) dialog.close()
    }
  }, [pending])

  const saveRef = useRef<(section: SaveSection) => Promise<void>>(async () => {})
  useEffect(() => {
    if (!saveAll || disabled || busy || saving || expectedCommit.current || !currentDraft || currentDraft.conflict) {
      return
    }
    const baseValues = inspectorValues(currentDraft.base)
    const values = currentDraft.values
    switch (true) {
      case !sameInspectorValues(values, { ...baseValues, identifier: values.identifier, parent: values.parent }):
        void saveRef.current('properties')
        break
      case values.identifier !== baseValues.identifier:
        void saveRef.current('identifier')
        break
      case values.parent !== baseValues.parent:
        void saveRef.current('parent')
        break
      default: {
        const proceed = pending?.proceed
        dialogRef.current?.close()
        setSaveAll(false)
        setPending(null)
        proceed?.()
      }
    }
  }, [saveAll, disabled, busy, saving, currentDraft, pending])

  if (!currentDraft) {
    return (
      <section
        className="inspector"
        aria-label="Инспектор элемента"
        onFocusCapture={event => {
          if (event.target instanceof HTMLElement && !event.target.closest('dialog')) {
            draftFocusRef.current = event.target
          }
        }}>
        <h2>Свойства элемента</h2>
        <p className="empty">{emptyMessage ?? 'Выберите логический элемент на диаграмме или в структуре.'}</p>
        {onRequestCanvasSelection && (
          <button type="button" onClick={onRequestCanvasSelection}>Выбрать на холсте</button>
        )}
      </section>
    )
  }

  const { base, values, conflict } = currentDraft
  const { title, description, technology, icon, tags, identifier } = values
  const parent = values.parent ?? ''
  const controlsDisabled = disabled || busy || saving || !!expectedCommit.current || element?.id !== base.id
  const mutationDisabled = controlsDisabled || conflict
  const baseValues = inspectorValues(base)
  const propertiesDirty = !sameInspectorValues(values, { ...baseValues, identifier, parent: values.parent })
  const change = (patch: Partial<InspectorDraftValues>) => {
    setSaveError(null)
    setDraft(previous => previous ? { ...previous, values: { ...previous.values, ...patch } } : previous)
  }
  const save = async (section: SaveSection) => {
    if (mutationDisabled || saveLock.current || (section === 'properties' && !title.trim())) return
    saveLock.current = true
    setSaving(true)
    setSaveError(null)
    const expectedElement: InspectorElement = section === 'properties'
      ? { ...base, title: title.trim(), description, technology, icon, tags }
      : {
        ...base,
        id: (section === 'identifier'
          ? `${currentParent(base.id) ? `${currentParent(base.id)}.` : ''}${identifier.trim()}`
          : `${parent ? `${parent}.` : ''}${localId(base.id)}`) as Fqn,
      }
    expectedCommit.current = { element: expectedElement, section }
    try {
      const success = section === 'properties' ?
        await onPatch(values)
        : section === 'identifier'
        ? await onRename(identifier)
        : await onMove(values.parent)
      if (success !== true) {
        expectedCommit.current = null
        setSaveAll(false)
        setSaveError('Изменения не подтверждены. Введённые данные сохранены в форме.')
      }
    } catch {
      expectedCommit.current = null
      setSaveAll(false)
      setSaveError('Не удалось сохранить изменения. Введённые данные сохранены в форме.')
    } finally {
      saveLock.current = false
      setSaving(false)
    }
  }
  saveRef.current = save
  return (
    <section
      className="inspector"
      aria-label="Инспектор элемента"
      onFocusCapture={event => {
        if (event.target instanceof HTMLElement && !event.target.closest('dialog')) draftFocusRef.current = event.target
      }}>
      <h2>Свойства элемента</h2>
      <p>
        <strong>{base.title}</strong>
      </p>
      {error && <p className="error" role="alert">{error}</p>}
      {saveError && <p className="error" role="alert">{saveError}</p>}
      {dirty && <p role="status">Есть несохранённые изменения.</p>}
      {conflict && (
        <section aria-label="Конфликт изменений">
          <p className="error" role="alert">
            Элемент изменился после начала редактирования. Ваш ввод сохранён. Загрузите актуальные значения перед
            сохранением.
          </p>
          <button
            type="button"
            disabled={busy || saving}
            onClick={() => {
              if (!window.confirm('Отбросить введённые изменения и загрузить актуальные значения?')) return
              expectedCommit.current = null
              setSaveError(null)
              setDraft(element ? createInspectorDraft(element) : null)
            }}>
            Загрузить актуальные значения
          </button>
        </section>
      )}

      <form
        aria-label="Основные свойства"
        onSubmit={event => {
          event.preventDefault()
          void save('properties')
        }}>
        <h3>Основные свойства</h3>
        <label>
          Название
          <input
            id="element-title"
            value={title}
            disabled={controlsDisabled}
            required
            onChange={event => change({ title: event.target.value })} />
        </label>
        <label>
          Описание
          <textarea
            className="compact-textarea"
            aria-label="Описание"
            value={description}
            disabled={controlsDisabled}
            onChange={event => change({ description: event.target.value })} />
        </label>
        <TechnologySelect
          value={technology}
          icon={icon}
          disabled={controlsDisabled}
          onChange={value => change(technologyFields(value))} />
        <fieldset className="inspector-section" disabled={controlsDisabled}>
          <legend>Теги</legend>
          {availableTags.length === 0
            ? <p className="empty">Создайте тег, чтобы назначить его элементу.</p>
            : availableTags.map(tag => (
              <label className="tag-option" key={tag}>
                <input
                  type="checkbox"
                  checked={tags.includes(tag)}
                  onChange={event => {
                    change({
                      tags: event.target.checked
                        ? [...tags, tag]
                        : tags.filter(candidate => candidate !== tag),
                    })
                  }} />
                #{tag}
              </label>
            ))}
          {onCreateTag && (
            <TagCreator availableTags={availableTags} disabled={controlsDisabled} onCreate={onCreateTag} />
          )}
        </fieldset>
        <details>
          <summary>Подробности</summary>
          <h3>Идентификатор</h3>
          <label>
            Текущий FQN
            <input value={base.id} readOnly />
          </label>
          <label>
            Локальный ID
            <input
              id="element-local-id"
              value={identifier}
              disabled={controlsDisabled}
              onChange={event => change({ identifier: event.target.value })} />
          </label>
          <button
            type="button"
            disabled={mutationDisabled || !identifier.trim() || identifier === localId(base.id)}
            onClick={() => void save('identifier')}>
            Переименовать
          </button>
          <h3>Родитель</h3>
          <label>
            Родитель
            <select
              value={parent}
              disabled={controlsDisabled}
              onChange={event => {
                const option = parents.find(candidate => candidate.id === event.target.value)
                change({ parent: option?.id ?? null })
              }}>
              <option value="">Без родителя</option>
              {parents.map(option => <option key={option.id} value={option.id}>{option.title} ({option.id})</option>)}
            </select>
          </label>
          <button
            type="button"
            onClick={() => void save('parent')}
            disabled={mutationDisabled || parent === (currentParent(base.id) ?? '')}>
            Переместить
          </button>
        </details>
        <button type="submit" disabled={mutationDisabled || !title.trim() || !propertiesDirty}>
          Сохранить свойства
        </button>
      </form>

      <section className="danger-zone" aria-label="Опасная зона">
        <h3>Опасная зона</h3>
        <button
          type="button"
          className="danger-button"
          disabled={mutationDisabled || dirty}
          onClick={() => void onRemove()}>
          Удалить элемент
        </button>
        {dirty && <p className="empty">Сохраните изменения перед удалением элемента.</p>}
      </section>
      {disabled && <p className="empty">{disabledReason ?? 'Исправьте ошибки проекта, чтобы изменить элемент.'}</p>}
      {pending && (
        <dialog
          ref={dialogRef}
          className="remove-dialog"
          aria-labelledby="inspector-draft-title"
          onCancel={event => {
            event.preventDefault()
            if (!saving && !busy && !expectedCommit.current) {
              stayInDraft()
            }
          }}>
          <h2 id="inspector-draft-title">Сохранить изменения элемента?</h2>
          <p>В элементе «{base.title}» есть несохранённые изменения.</p>
          {disabled && (
            <p className="empty">{disabledReason ?? 'Исправьте ошибки проекта, чтобы сохранить изменения.'}</p>
          )}
          {conflict && <p className="error">Сначала разрешите конфликт в инспекторе.</p>}
          {saveError && <p className="error" role="alert">{saveError}</p>}
          <div className="dialog-actions">
            <button
              type="button"
              autoFocus
              disabled={busy || saving || !!expectedCommit.current}
              onClick={() => {
                stayInDraft()
              }}>
              Остаться
            </button>
            <button
              type="button"
              disabled={busy || saving || !!expectedCommit.current}
              onClick={() => {
                const proceed = pending.proceed
                dialogRef.current?.close()
                setDraft(element ? createInspectorDraft(element) : null)
                setPending(null)
                setSaveAll(false)
                proceed()
              }}>
              Отбросить и перейти
            </button>
            <button
              type="button"
              disabled={mutationDisabled || !title.trim() || !identifier.trim()}
              onClick={() => setSaveAll(true)}>
              Сохранить и перейти
            </button>
          </div>
        </dialog>
      )}
    </section>
  )
}
