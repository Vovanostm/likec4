import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import {
  moveOperation,
  patchFromForm,
  patchOperation,
  renameOperation,
} from './element-form'

describe('element form command factories', () => {
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
