import { describe, expect, it } from 'vitest'
import { compile } from './compiler'
import { applyCommand, emptySource, starterSource } from './document'

describe('applyCommand', () => {
  it('compiles the actual empty C4 desktop starter with actor shape and container kind', async () => {
    const result = await compile(emptySource)
    expect(result.errors).toEqual([])
    expect(result.model?.$data.specification.elements['actor']?.style?.shape).toBe('person')
    expect(result.model?.$data.specification.elements['container']).toBeDefined()
  })
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
