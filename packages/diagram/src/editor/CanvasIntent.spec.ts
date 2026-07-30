import type { ElementKind, Fqn } from '@likec4/core/types'
import { describe, expect, it, vi } from 'vitest'
import { createCanvasIntentController } from './CanvasIntent'

describe('CanvasIntentController', () => {
  it('emits one element creation request', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)

    controller.startElementCreation('system' as ElementKind)

    expect(controller.requestElementCreation({ x: 10, y: 20 })).toBe(true)
    expect(controller.requestElementCreation({ x: 30, y: 40 })).toBe(false)
    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onIntent).toHaveBeenCalledWith({
      type: 'element.create.requested',
      elementKind: 'system',
      point: { x: 10, y: 20 },
    })
  })

  it('preserves directed relation endpoints and suppresses duplicate completion', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)

    controller.startRelationCreation()
    controller.selectRelationSource('shop' as Fqn)

    expect(controller.requestRelationCreation('backend' as Fqn)).toBe(true)
    expect(controller.requestRelationCreation('backend' as Fqn)).toBe(false)
    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onIntent).toHaveBeenCalledWith({
      type: 'relation.create.requested',
      sourceId: 'shop',
      targetId: 'backend',
    })
  })

  it('rejects self-connect deterministically', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)

    controller.startRelationCreation()
    controller.selectRelationSource('shop' as Fqn)

    expect(controller.requestRelationCreation('shop' as Fqn)).toBe(false)
    expect(controller.snapshot).toEqual({ interaction: 'idle' })
    expect(onIntent).not.toHaveBeenCalled()
  })

  it('reports pointer cancellation without a relation request', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)

    controller.startRelationCreation()
    controller.selectRelationSource('shop' as Fqn)

    expect(controller.cancel('pointer-cancel')).toBe(true)
    expect(onIntent).toHaveBeenCalledTimes(1)
    expect(onIntent).toHaveBeenCalledWith({
      type: 'interaction.cancelled',
      interaction: 'relation-create',
      reason: 'pointer-cancel',
    })
  })

  it('uses the shared cancellation path for Escape', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)

    controller.startElementCreation('system' as ElementKind)

    expect(controller.handleKeyDown('Escape')).toBe(true)
    expect(controller.requestElementCreation({ x: 1, y: 2 })).toBe(false)
    expect(onIntent).toHaveBeenCalledWith({
      type: 'interaction.cancelled',
      interaction: 'element-create',
      reason: 'escape',
    })
  })

  it('cancels the previous interaction when the tool changes', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)

    controller.startElementCreation('system' as ElementKind)
    controller.startRelationCreation()

    expect(onIntent).toHaveBeenCalledWith({
      type: 'interaction.cancelled',
      interaction: 'element-create',
      reason: 'tool-change',
    })
    expect(controller.snapshot).toEqual({ interaction: 'relation-create' })
  })

  it('emits selection only when the effective ordered selection changes', () => {
    const onIntent = vi.fn()
    const controller = createCanvasIntentController(onIntent)

    controller.selectionChanged(['shop' as Fqn])
    controller.selectionChanged(['shop' as Fqn])
    controller.selectionChanged(['shop' as Fqn, 'backend' as Fqn])

    expect(onIntent).toHaveBeenCalledTimes(2)
    expect(onIntent).toHaveBeenLastCalledWith({
      type: 'selection.changed',
      elementIds: ['shop', 'backend'],
    })
  })

  it('preserves existing behavior when no callback is supplied', () => {
    const controller = createCanvasIntentController()

    controller.startRelationCreation()
    controller.selectRelationSource('shop' as Fqn)

    expect(controller.requestRelationCreation('backend' as Fqn)).toBe(true)
    expect(controller.snapshot).toEqual({ interaction: 'idle' })
  })
})
