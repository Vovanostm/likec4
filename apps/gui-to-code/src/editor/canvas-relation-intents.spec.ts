import type { Fqn } from '@likec4/core/types'
import type { CanvasIntentController } from '@likec4/diagram'
import { describe, expect, it, vi } from 'vitest'
import { completeRelationConnection } from './canvas-relation-intents'

function createController(): CanvasIntentController {
  let snapshot: CanvasIntentController['snapshot'] = { interaction: 'relation-create' }
  return {
    get snapshot() {
      return snapshot
    },
    startElementCreation: vi.fn(),
    requestElementCreation: vi.fn(() => false),
    startRelationCreation: vi.fn(() => {
      snapshot = { interaction: 'relation-create' }
    }),
    selectRelationSource: vi.fn(sourceId => {
      if (snapshot.interaction === 'relation-create') {
        snapshot = { interaction: 'relation-create', sourceId }
      }
    }),
    requestRelationCreation: vi.fn(targetId => {
      if (snapshot.interaction !== 'relation-create' || !snapshot.sourceId) {
        return false
      }
      const sourceId = snapshot.sourceId
      snapshot = { interaction: 'idle' }
      return sourceId !== targetId
    }),
    selectionChanged: vi.fn(),
    cancel: vi.fn(() => false),
    handleKeyDown: vi.fn(() => false),
    reset: vi.fn(() => {
      snapshot = { interaction: 'idle' }
    }),
  }
}

describe('canvas relation adapter', () => {
  it('maps one completion to one directed controller request and suppresses a duplicate callback', () => {
    const controller = createController()

    expect(completeRelationConnection(controller, 'shop' as Fqn, 'shop.web' as Fqn)).toBe(true)
    expect(completeRelationConnection(controller, 'shop' as Fqn, 'shop.web' as Fqn)).toBe(false)
    expect(controller.selectRelationSource).toHaveBeenCalledTimes(1)
    expect(controller.selectRelationSource).toHaveBeenCalledWith('shop')
    expect(controller.requestRelationCreation).toHaveBeenCalledTimes(1)
    expect(controller.requestRelationCreation).toHaveBeenCalledWith('shop.web')
  })

  it('uses the same active controller path for keyboard endpoints', () => {
    const controller = createController()

    expect(completeRelationConnection(controller, 'customer' as Fqn, 'shop' as Fqn)).toBe(true)
    expect(controller.selectRelationSource).toHaveBeenCalledWith('customer')
    expect(controller.requestRelationCreation).toHaveBeenCalledWith('shop')
  })

  it('fails closed for a self connection', () => {
    const controller = createController()

    expect(completeRelationConnection(controller, 'shop' as Fqn, 'shop' as Fqn)).toBe(false)
    expect(controller.requestRelationCreation).toHaveBeenCalledTimes(1)
  })
})
