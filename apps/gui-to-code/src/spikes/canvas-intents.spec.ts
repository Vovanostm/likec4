import { describe, expect, it } from 'vitest'
import { beginConnection, cancelConnection, completeConnection } from './canvas-intents'

describe('canvas intent proof', () => {
  it('emits one directed relation intent', () => {
    const result = completeConnection(beginConnection('source'), 'target')
    expect(result).toEqual({
      state: { sourceId: null },
      intent: { type: 'relation.create.requested', sourceId: 'source', targetId: 'target' },
    })
  })

  it('cancels without emitting an intent', () => {
    expect(cancelConnection()).toEqual({ sourceId: null })
  })

  it('rejects self-connections deterministically', () => {
    expect(completeConnection(beginConnection('same'), 'same')).toEqual({
      state: { sourceId: null },
      intent: null,
    })
  })

  it('cannot emit a duplicate after completion', () => {
    const first = completeConnection(beginConnection('source'), 'target')
    expect(completeConnection(first.state, 'target').intent).toBeNull()
  })
})
