import type { Fqn } from '@likec4/core/types'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import {
  type InspectorDraft,
  type InspectorElement,
  acknowledgeInspectorSave,
  createInspectorDraft,
  ElementInspector,
  inspectorDraftDirty,
  inspectorNeedsSelectionConfirmation,
  reconcileInspectorCommit,
  reconcileInspectorDraft,
} from './ElementInspector'

const element: InspectorElement = {
  id: 'shop.web' as Fqn,
  title: 'Web application',
  description: 'Описание',
  technology: 'TypeScript',
  tags: ['public', 'web'],
}

function dirtyDraft(): InspectorDraft {
  const draft = createInspectorDraft(element)
  return { ...draft, values: { ...draft.values, title: 'Черновик', description: 'Новый текст', tags: ['web'] } }
}

describe('inspector local draft', () => {
  it('keeps dirty inputs on a new equal element object, tag ordering, status and layout renders', () => {
    const draft = dirtyDraft()
    expect(reconcileInspectorDraft(draft, { ...element, tags: ['web', 'public'] })).toBe(draft)
    expect(reconcileInspectorDraft(draft, { ...element })).toBe(draft)
    expect(inspectorDraftDirty(draft)).toBe(true)
  })

  it('treats null and absent optional committed fields as the same input value', () => {
    const draft = createInspectorDraft({ id: element.id, title: element.title })
    expect(
      reconcileInspectorDraft(draft, {
        id: element.id,
        title: element.title,
        description: null,
        technology: null,
        tags: [],
      }),
    ).toBe(draft)
  })

  it.each(['title', 'description', 'technology', 'icon', 'tags'] as const)(
    'requires explicit reload when committed %s changes during editing',
    field => {
      const draft = dirtyDraft()
      const changed = field === 'tags'
        ? { ...element, tags: ['private'] }
        : { ...element, [field]: 'Внешнее изменение' }
      const conflicted = reconcileInspectorDraft(draft, changed)
      expect(conflicted?.conflict).toBe(true)
      expect(conflicted?.values).toBe(draft.values)
      expect(conflicted?.base).toBe(draft.base)
      expect(reconcileInspectorDraft(conflicted, changed)).toBe(conflicted)
    },
  )

  it('keeps a conflict explicit even if the committed value later returns to its base', () => {
    const conflicted = reconcileInspectorDraft(dirtyDraft(), { ...element, title: 'Внешнее изменение' })
    expect(reconcileInspectorDraft(conflicted, element)?.conflict).toBe(true)
  })

  it('does not lose a dirty draft on deselection or an unguarded selection change', () => {
    const draft = dirtyDraft()
    for (const next of [null, { ...element, id: 'shop.api' as Fqn }]) {
      const result = reconcileInspectorDraft(draft, next)
      expect(result?.values).toBe(draft.values)
      expect(result?.base.id).toBe(element.id)
      expect(result?.conflict).toBe(true)
    }
  })

  it('guards another element and view/clear requests, but permits reselecting the same element', () => {
    const draft = dirtyDraft()
    expect(inspectorNeedsSelectionConfirmation(draft, 'shop.api' as Fqn)).toBe(true)
    expect(inspectorNeedsSelectionConfirmation(draft, null)).toBe(true)
    expect(inspectorNeedsSelectionConfirmation(draft, element.id)).toBe(false)
    expect(inspectorNeedsSelectionConfirmation(createInspectorDraft(element), null)).toBe(false)
    expect(inspectorNeedsSelectionConfirmation(null, element.id)).toBe(false)
  })

  it('synchronizes clean committed changes and selection changes', () => {
    const draft = createInspectorDraft(element)
    const updated = { ...element, title: 'Подтверждённое название' }
    const next = reconcileInspectorDraft(draft, updated)
    expect(next?.values.title).toBe(updated.title)
    expect(next && inspectorDraftDirty(next)).toBe(false)
    expect(reconcileInspectorDraft(draft, null)).toBeNull()
    expect(reconcileInspectorDraft(draft, { ...updated, id: 'shop.api' as Fqn })?.base.id).toBe('shop.api')
  })

  it('explicit reload replaces the conflict and input only when requested', () => {
    const updated = { ...element, title: 'Актуальное название' }
    const conflicted = reconcileInspectorDraft(dirtyDraft(), updated)
    expect(conflicted?.values.title).toBe('Черновик')
    const reloaded = createInspectorDraft(updated)
    expect(reloaded.values.title).toBe(updated.title)
    expect(reloaded.conflict).toBe(false)
    expect(inspectorDraftDirty(reloaded)).toBe(false)
  })

  it('confirmed property save synchronizes normalized values and supports clean Undo/Redo', () => {
    const draft = dirtyDraft()
    const confirmed = { ...element, title: 'Черновик', description: 'Новый текст', tags: ['web'] }
    const saved = acknowledgeInspectorSave(draft, confirmed, 'properties')
    expect(saved.values.title).toBe(confirmed.title)
    expect(inspectorDraftDirty(saved)).toBe(false)
    const undone = reconcileInspectorDraft(saved, element)
    expect(undone?.values.title).toBe(element.title)
    expect(reconcileInspectorDraft(undone, confirmed)?.values.title).toBe(confirmed.title)
  })

  it('property save preserves pending identifier and parent drafts', () => {
    const draft = dirtyDraft()
    const advanced = { ...draft, values: { ...draft.values, identifier: 'client', parent: 'other' as Fqn } }
    const saved = acknowledgeInspectorSave(advanced, {
      ...element,
      title: advanced.values.title,
      description: advanced.values.description,
      tags: advanced.values.tags,
    }, 'properties')
    expect(saved.values.identifier).toBe('client')
    expect(saved.values.parent).toBe('other')
    expect(inspectorDraftDirty(saved)).toBe(true)
  })

  it('waits for committed save acknowledgement before clearing the draft or advancing save-all', () => {
    const draft = dirtyDraft()
    const confirmed = {
      ...element,
      title: draft.values.title,
      description: draft.values.description,
      tags: draft.values.tags,
    }
    const expected = { element: confirmed, section: 'properties' as const }
    const waiting = reconcileInspectorCommit(draft, { ...element }, expected)
    expect(waiting.draft).toBe(draft)
    expect(waiting.expected).toBe(expected)
    const accepted = reconcileInspectorCommit(draft, confirmed, expected)
    expect(accepted.expected).toBeNull()
    expect(accepted.draft && inspectorDraftDirty(accepted.draft)).toBe(false)
  })

  it('external committed updates during save-all preserve inputs and stop acknowledgement as a conflict', () => {
    const draft = dirtyDraft()
    const expected = {
      element: {
        ...element,
        title: draft.values.title,
        description: draft.values.description,
        tags: draft.values.tags,
      },
      section: 'properties' as const,
    }
    const result = reconcileInspectorCommit(draft, { ...element, technology: 'Внешняя технология' }, expected)
    expect(result.expected).toBeNull()
    expect(result.draft?.conflict).toBe(true)
    expect(result.draft?.values).toBe(draft.values)
    expect(result.draft?.base).toBe(draft.base)
  })

  it('rename and move acknowledgements preserve other unsubmitted fields', () => {
    const draft = dirtyDraft()
    const advanced = { ...draft, values: { ...draft.values, identifier: 'client', parent: 'other' as Fqn } }
    const renamed = acknowledgeInspectorSave(advanced, { ...element, id: 'shop.client' as Fqn }, 'identifier')
    expect(renamed.values.title).toBe('Черновик')
    expect(renamed.values.parent).toBe('other')
    const moved = acknowledgeInspectorSave(renamed, { ...element, id: 'other.client' as Fqn }, 'parent')
    expect(moved.values.title).toBe('Черновик')
    expect(moved.values.identifier).toBe('client')
    expect(moved.values.parent).toBe('other')
  })

  it('keeps the technology and logo draft together through rename, conflicts and acknowledged property saves', () => {
    const initial = createInspectorDraft({ ...element, technology: 'React', icon: 'tech:react' })
    const draft = { ...initial, values: { ...initial.values, technology: 'PostgreSQL', icon: 'tech:postgresql' } }
    const renamed = acknowledgeInspectorSave(draft, { ...initial.base, id: 'shop.client' as Fqn }, 'identifier')
    expect(renamed.values.technology).toBe('PostgreSQL')
    expect(renamed.values.icon).toBe('tech:postgresql')
    expect(inspectorDraftDirty(renamed)).toBe(true)
    const conflicted = reconcileInspectorDraft(renamed, { ...renamed.base, icon: 'tech:redis' })
    expect(conflicted?.values).toBe(renamed.values)
    expect(conflicted?.conflict).toBe(true)
    const confirmed = { ...renamed.base, technology: 'PostgreSQL', icon: 'tech:postgresql' }
    const saved = reconcileInspectorCommit(renamed, confirmed, { element: confirmed, section: 'properties' })
    expect(saved.expected).toBeNull()
    expect(saved.draft?.values.icon).toBe('tech:postgresql')
    expect(saved.draft && inspectorDraftDirty(saved.draft)).toBe(false)
    expect(reconcileInspectorDraft(saved.draft, renamed.base)?.values.icon).toBe('tech:react')
  })
})

it('discloses technical controls in Russian Details while primary fields and removal remain visible', () => {
  const markup = renderToStaticMarkup(createElement(ElementInspector, {
    element,
    availableTags: ['public', 'web'],
    parents: [],
    disabled: false,
    busy: false,
    error: null,
    onPatch: async () => true,
    onRename: async () => true,
    onMove: async () => true,
    onRemove: async () => {},
  }))
  const details = markup.slice(markup.indexOf('<details>'), markup.indexOf('</details>'))
  expect(details).toContain('<summary>Подробности</summary>')
  for (const label of ['Текущий FQN', 'Локальный ID', 'Родитель']) {
    expect(details).toContain(label)
  }
  expect(details).not.toContain('element-title')
  expect(details).not.toContain('Удалить элемент')
  expect(markup).toContain('Название')
  expect(markup).toContain('Описание')
  expect(markup.indexOf('<legend>Теги</legend>')).toBeLessThan(markup.indexOf('<details>'))
  expect(markup.indexOf('technology-select')).toBeLessThan(markup.indexOf('<details>'))
  expect(markup).toContain('role="combobox"')
  expect(markup).toContain('aria-autocomplete="list"')
  expect(markup).not.toContain('technology-catalogue')
  expect(markup).toContain('Очистить технологию')
  expect(markup).toContain('Выберите или введите технологию')
  expect(markup).toContain('Удалить элемент')
  expect(markup).not.toContain('<details open')
})

it('shows the actual read-only reason while retaining draft-capable inputs in the inspector', () => {
  const reason = 'Хранилище изменилось в другой вкладке. Сначала загрузите актуальное рабочее пространство.'
  const markup = renderToStaticMarkup(createElement(ElementInspector, {
    element,
    availableTags: [],
    parents: [],
    disabled: true,
    disabledReason: reason,
    busy: false,
    error: null,
    onPatch: async () => false,
    onRename: async () => false,
    onMove: async () => false,
    onRemove: async () => {},
  }))
  expect(markup).toContain(reason)
  expect(markup).not.toContain('Исправьте ошибки проекта')
  expect(markup).toContain('Web application')
})
