import { describe, expect, it } from 'vitest'
import type { Compilation } from './compiler'
import { starterSource } from './document'
import { CompilationSequence, applyDraftCompilation, applyEditorCommand } from './editor-state'

const model = { marker: 'model' } as unknown as NonNullable<Compilation['model']>
const nextModel = { marker: 'next' } as unknown as NonNullable<Compilation['model']>
const initial = {
  source: starterSource,
  compilation: { errors: [], model },
  lastValidModel: model,
}

describe('editor state', () => {
  it('preserves the last valid model for an invalid draft', () => {
    const state = applyDraftCompilation(initial, 'invalid', { errors: ['Line 1: invalid'], model: null })
    expect(state.source).toBe('invalid')
    expect(state.compilation.model).toBeNull()
    expect(state.lastValidModel).toBe(model)
  })

  it('rejects an invalid command atomically', async () => {
    const result = await applyEditorCommand(
      initial,
      { type: 'add-element', id: 'payments', kind: 'component', title: 'Payments' },
      async () => ({ errors: ['Line 1: invalid'], model: null }),
    )
    expect(result.status).toBe('rejected')
    expect(result.state).toBe(initial)
  })

  it('commits the validated compilation once', async () => {
    let calls = 0
    const result = await applyEditorCommand(
      initial,
      { type: 'add-element', id: 'payments', kind: 'component', title: 'Payments' },
      async () => {
        calls += 1
        return { errors: [], model: nextModel }
      },
    )
    expect(result.status).toBe('applied')
    expect(result.state.lastValidModel).toBe(nextModel)
    expect(calls).toBe(1)
  })

  it('identifies stale compilation sequences', () => {
    const sequence = new CompilationSequence()
    const first = sequence.next()
    const second = sequence.next()
    expect(sequence.isCurrent(first)).toBe(false)
    expect(sequence.isCurrent(second)).toBe(true)
  })
})
