import type { ElementKind } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import { EditorWorkspace } from './workspace'

const sources = [{ uri: 'model.c4', content: starterSource }]

function operation(kind: ElementKind, expectedRevision = 0) {
  return {
    id: 1,
    expectedRevision,
    semantic: {
      type: 'element.create' as const,
      input: { kind, documentUri: 'model.c4' },
    },
  }
}

describe('EditorWorkspace', () => {
  it('initializes one valid committed and draft revision', async () => {
    const workspace = await EditorWorkspace.create(sources, compile)

    expect(workspace.state.revision).toBe(0)
    expect(workspace.state.compilation.status).toBe('valid')
    expect(workspace.state.committedSources).toEqual(workspace.state.draftSources)
    expect(workspace.state.history.past).toEqual([])
  })

  it.each(['actor', 'system', 'component'] as ElementKind[])(
    'creates one source-preserving %s element and commits atomically',
    async kind => {
      const workspace = await EditorWorkspace.create(sources, compile)
      const result = await workspace.dispatch(operation(kind))

      expect(result.status).toBe('applied')
      expect(workspace.state.revision).toBe(1)
      expect(workspace.state.compilation.status).toBe('valid')
      expect(workspace.state.draftSources[0]?.content).toContain(`${kind} ${kind}`)
      expect(workspace.state.lastValidModel?.$data.elements[kind]).toBeDefined()
      expect(workspace.state.history.past).toHaveLength(1)
    },
  )

  it('rejects a stale operation without mutating the workspace', async () => {
    const workspace = await EditorWorkspace.create(sources, compile)
    const before = workspace.state

    const result = await workspace.dispatch(operation('actor' as ElementKind, 99))

    expect(result).toEqual({ status: 'conflict', revision: 0 })
    expect(workspace.state).toBe(before)
  })

  it('keeps an invalid draft separate from the committed source and model', async () => {
    const workspace = await EditorWorkspace.create(sources, compile)
    const committed = workspace.state.committedSources[0]?.content
    const model = workspace.state.lastValidModel

    await workspace.updateDraft([{ uri: 'model.c4', content: 'model {' }])

    expect(workspace.state.compilation.status).toBe('invalid')
    expect(workspace.state.draftSources[0]?.content).toBe('model {')
    expect(workspace.state.committedSources[0]?.content).toBe(committed)
    expect(workspace.state.lastValidModel).toBe(model)
    expect(workspace.state.revision).toBe(0)
    expect(workspace.state.history.past).toEqual([])
  })

  it('serializes two operations on the same revision', async () => {
    const workspace = await EditorWorkspace.create(sources, compile)

    const [first, second] = await Promise.all([
      workspace.dispatch(operation('actor' as ElementKind)),
      workspace.dispatch({ ...operation('system' as ElementKind), id: 2 }),
    ])

    expect(first.status).toBe('applied')
    expect(second).toEqual({ status: 'conflict', revision: 1 })
    expect(workspace.state.revision).toBe(1)
  })
})
