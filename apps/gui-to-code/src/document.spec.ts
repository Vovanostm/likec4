import { describe, expect, it } from 'vitest'
import { applyCommand, starterSource } from './document'

describe('applyCommand', () => {
  it('adds semantic commands to their canonical DSL blocks', () => {
    const withElement = applyCommand(starterSource, {
      type: 'add-element',
      id: 'payments',
      kind: 'component',
      title: 'Payments\' API',
    })
    const withRelation = applyCommand(withElement, {
      type: 'add-relation',
      source: 'shop.web',
      target: 'payments',
      title: 'uses',
    })
    const result = applyCommand(withRelation, { type: 'add-view', id: 'paymentsView', of: 'payments' })

    expect(result).toContain('payments = component \'Payments\\\' API\'')
    expect(result).toContain('shop.web -> payments \'uses\'')
    expect(result).toContain('view paymentsView of payments { include * }')
  })

  it('rejects invalid identifiers before changing the source', () => {
    expect(() =>
      applyCommand(starterSource, {
        type: 'add-element',
        id: 'not valid',
        kind: 'component',
        title: 'Invalid',
      })
    ).toThrow('Element ID must be an identifier.')
  })
})
