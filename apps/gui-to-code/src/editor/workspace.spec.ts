import type { LikeC4Model } from '@likec4/core/model'
import type { ElementKind } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { starterSource } from '../document'
import type { CompilerPort, ElementEditPort } from './contracts'
import { EditorWorkspace } from './workspace'

const sources = [{ uri: 'model.c4', content: starterSource }]

function modelFor(source: string): LikeC4Model.Layouted {
  const elements = Object.fromEntries(
    [...source.matchAll(/\b(actor|system|component)\s+([A-Za-z_][A-Za-z0-9_]*)/g)]
      .filter(match => match[2] !== match[1])
      .map(match => [match[2]!, { id: match[2], kind: match[1], title: match[2] }]),
  )
  return {
    $data: {
      specification: {
        elements: { actor: {}, system: {}, component: {} },
      },
      elements,
      views: {},
    },
  } as unknown as LikeC4Model.Layouted
}

const compiler: CompilerPort = async request => {
  const source = request.sources[0]?.content ?? ''
  if (source === 'model {') {
    return {
      revision: request.revision,
      diagnostics: [{ message: 'invalid' }],
      model: null,
    }
  }
  return {
    revision: request.revision,
    diagnostics: [],
    model: modelFor(source),
  }
}

const editElement: ElementEditPort = async (currentSources, input) => currentSources.map(source => ({
  ...source,
  content: `${source.content}\n${input.kind} ${input.id}\n`,
}))

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
    const workspace = await EditorWorkspace.create(sources, compiler, editElement)

    expect(workspace.state.revision).toBe(0)
    expect(workspace.state.compilation.status).toBe('valid')
    expect(workspace.state.committedSources).toEqual(workspace.state.draftSources)
    expect(workspace.state.history.past).toEqual([])
  })

  it.each(['actor', 'system', 'component'] as ElementKind[])(
    'creates one %s element and commits atomically',
    async kind => {
      const workspace = await EditorWorkspace.create(sources, compiler, editElement)
      const result = await workspace.dispatch(operation(kind))

      expect(result.status).toBe('applied')
      expect(workspace.state.revision).toBe(1)
      expect(workspace.state.compilation.status).toBe('valid')
      expect(workspace.state.draftSources[0]?.content).toContain(`${kind} ${kind}`)
      expect(workspace.state.lastValidModel?.$data.elements[kind]).toBeDefined()
      expect(workspace.state.history.past).toHaveLength(1)
    },
  )

  it('rejects a stale operation without invoking source edits', async () => {
    let editCalls = 0
    const workspace = await EditorWorkspace.create(sources, compiler, async (...args) => {
      editCalls += 1
      return editElement(...args)
    })
    const before = workspace.state

    const result = await workspace.dispatch(operation('actor' as ElementKind, 99))

    expect(result).toEqual({ status: 'conflict', revision: 0 })
    expect(workspace.state).toBe(before)
    expect(editCalls).toBe(0)
  })

  it('keeps an invalid draft separate from the committed source and model', async () => {
    const workspace = await EditorWorkspace.create(sources, compiler, editElement)
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
    const workspace = await EditorWorkspace.create(sources, compiler, editElement)

    const [first, second] = await Promise.all([
      workspace.dispatch(operation('actor' as ElementKind)),
      workspace.dispatch({ ...operation('system' as ElementKind), id: 2 }),
    ])

    expect(first.status).toBe('applied')
    expect(second).toEqual({ status: 'conflict', revision: 1 })
    expect(workspace.state.revision).toBe(1)
  })
})
