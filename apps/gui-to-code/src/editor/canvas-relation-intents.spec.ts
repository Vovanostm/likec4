import type { Fqn } from '@likec4/core/types'
import { createCanvasIntentController } from '@likec4/diagram'
import { describe, expect, it, vi } from 'vitest'
import { completeRelationConnection } from './canvas-relation-intents'

describe('canvas relation adapter', () => {
  it('maps one completion to one directed intent and suppresses a duplicate callback', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)
    controller.startRelationCreation()

    expect(completeRelationConnection(controller, 'shop' as Fqn, 'shop.web' as Fqn)).toBe(true)
    expect(completeRelationConnection(controller, 'shop' as Fqn, 'shop.web' as Fqn)).toBe(false)
    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onIntent).toHaveBeenCalledWith({
      type: 'relation.create.requested',
      sourceId: 'shop',
      targetId: 'shop.web',
    })
  })

  it('uses the same active controller path for keyboard endpoints', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)
    controller.startRelationCreation()

    expect(completeRelationConnection(controller, 'customer' as Fqn, 'shop' as Fqn)).toBe(true)
    expect(onIntent).toHaveBeenCalledWith({
      type: 'relation.create.requested',
      sourceId: 'customer',
      targetId: 'shop',
    })
  })

  it('fails closed for a self connection', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)
    controller.startRelationCreation()

    expect(completeRelationConnection(controller, 'shop' as Fqn, 'shop' as Fqn)).toBe(false)
    expect(onIntent).not.toHaveBeenCalled()
  })
})
