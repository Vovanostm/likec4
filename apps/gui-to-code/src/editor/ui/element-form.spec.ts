import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import {
  moveOperation,
  patchFromForm,
  patchOperation,
  renameOperation,
} from './element-form'
import { technologyCatalogue, technologyFields } from './technology-catalogue'

describe('element form command factories', () => {
  it.each(technologyCatalogue)('patches $label and its canonical logo in one sparse command', entry => {
    const base = {
      title: 'Хранилище',
      description: 'Не менять',
      technology: 'Старая технология',
      icon: 'tech:react',
      tags: ['backend'],
    }
    expect(patchFromForm({ ...base, ...technologyFields(entry.label) }, base))
      .toEqual({ technology: entry.label, icon: entry.icon })
  })

  it('removes the old logo with custom technology or explicit clearing', () => {
    const base = { title: 'API', description: '', technology: 'React', icon: 'tech:react', tags: [] }
    expect(patchFromForm({ ...base, ...technologyFields('Свой движок') }, base))
      .toEqual({ technology: 'Свой движок', icon: null })
    expect(patchFromForm({ ...base, ...technologyFields('') }, base))
      .toEqual({ technology: null, icon: null })
    expect(patchFromForm({
      title: base.title,
      description: base.description,
      technology: 'Свой движок',
      tags: base.tags,
    }, base))
      .toEqual({ technology: 'Свой движок', icon: null })
  })

  it('preserves an unchanged custom logo and does not broaden unrelated sparse patches', () => {
    const base = { title: 'API', description: '', technology: 'Свой движок', icon: 'tech:typescript', tags: [] }
    expect(patchFromForm({ ...base, title: 'Заказы' }, base)).toEqual({ title: 'Заказы' })
    expect(patchFromForm(base, base)).toEqual({})
    expect(patchFromForm({ ...base, icon: null }, base)).toEqual({ icon: null })
    expect(patchFromForm({ ...base, ...technologyFields('React') })).toEqual({
      title: 'API',
      description: null,
      technology: 'React',
      icon: 'tech:react',
      tags: [],
    })
  })

  it('does not rewrite unchanged properties when only the title changes', () => {
    const base = { title: 'API', description: '**Описание**', technology: 'Node.js', tags: ['backend', 'ui'] }
    expect(patchFromForm({ ...base, title: 'API заказов', tags: ['ui', 'backend', 'ui'] }, base))
      .toEqual({ title: 'API заказов' })
    expect(patchFromForm({ ...base, description: '' }, base)).toEqual({ description: null })
    expect(patchFromForm({ ...base, technology: '' }, base)).toEqual({ technology: null })
    expect(patchFromForm({ ...base, tags: [] }, base)).toEqual({ tags: [] })
    expect(patchFromForm(base, base)).toEqual({})
  })

  it('creates one deterministic patch command from one form submission', () => {
    const values = {
      title: '  Storefront  ',
      description: '',
      technology: 'React',
      tags: ['ui', 'backend', 'ui'],
    }
    expect(patchFromForm(values)).toEqual({
      title: 'Storefront',
      description: null,
      technology: 'React',
      tags: ['backend', 'ui'],
    })
    expect(patchOperation('shop.web' as Fqn, 7, values)).toMatchObject({
      expectedRevision: 7,
      semantic: { type: 'element.patch', input: { id: 'shop.web' } },
    })
  })

  it('creates separate rename and move commands', () => {
    expect(renameOperation('shop.web' as Fqn, 3, ' client ')).toMatchObject({
      expectedRevision: 3,
      semantic: { type: 'element.rename', input: { id: 'shop.web', newId: 'client' } },
    })
    expect(moveOperation('shop.web' as Fqn, 4, null)).toMatchObject({
      expectedRevision: 4,
      semantic: { type: 'element.move', input: { id: 'shop.web', parentId: null } },
    })
  })
})
