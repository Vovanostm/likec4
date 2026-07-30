import type { LikeC4Model } from '@likec4/core/model'
import type { ElementKind, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { starterSource } from '../document'
import type { CompilerPort, ElementEditPort, RelationEditPort } from './contracts'
import { EditorWorkspace } from './workspace'

const sources = [{ uri: 'model.c4', content: starterSource }]

function modelFor(source: string): LikeC4Model.Layouted {
  const created = [...source.matchAll(/^(actor|system|component) ([A-Za-z_][A-Za-z0-9_]*)$/gm)]
  const relationMatches = [...source.matchAll(/^([A-Za-z_][A-Za-z0-9_.]*) -> ([A-Za-z_][A-Za-z0-9_.]*)$/gm)]
  const elements = {
    customer: { id: 'customer', kind: 'actor', title: 'Customer' },
    shop: { id: 'shop', kind: 'system', title: 'Online shop' },
    'shop.web': { id: 'shop.web', kind: 'component', title: 'Web application' },
    ...Object.fromEntries(created.map(match => [match[2]!, {
      id: match[2],
      kind: match[1],
      title: match[2],
    }])),
  }
  const relations = Object.fromEntries(relationMatches.map((match, index) => [`relation-${index + 1}`, {
    id: `relation-${index + 1}`,
    source: { model: match[1] },
    target: { model: match[2] },
  }]))
  return {
    $data: {
      specification: {
        elements: { actor: {}, system: {}, component: {} },
      },
      elements,
      relations,
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

const editRelation: RelationEditPort = async (currentSources, input) => currentSources.map(source => ({
  ...source,
  content: `${source.content}\n${input.sourceId} -> ${input.targetId}\n`,
}))

function elementOperation(kind: ElementKind, expectedRevision = 0) {
  return {
    id: 1,
    expectedRevision,
    semantic: {
      type: 'element.create' as const,
      input: { kind, documentUri: 'model.c4' },
    },
  }
}

function relationOperation(expectedRevision = 0) {
  return {
    id: 2,
    expectedRevision,
    semantic: {
      type: 'relation.create' as const,
      input: {
        sourceId: 'customer' as Fqn,
        targetId: 'shop.web' as Fqn,
        documentUri: 'model.c4',
      },
    },
  }
}

function createWorkspace(customCompiler: CompilerPort = compiler) {
  return EditorWorkspace.create(sources, customCompiler, editElement, editRelation)
}

describe('EditorWorkspace', () => {
  it('initializes one valid committed and draft revision', async () => {
    const workspace = await createWorkspace()

    expect(workspace.state.revision).toBe(0)
    expect(workspace.state.compilation.status).toBe('valid')
    expect(workspace.state.committedSources).toEqual(workspace.state.draftSources)
    expect(workspace.state.history.past).toEqual([])
  })

  it.each(['actor', 'system', 'component'] as ElementKind[])(
    'creates one %s element and commits atomically',
    async kind => {
      const workspace = await createWorkspace()
      const result = await workspace.dispatch(elementOperation(kind))

      expect(result).toMatchObject({ status: 'applied', command: 'element.create', revision: 1 })
      expect(workspace.state.revision).toBe(1)
      expect(workspace.state.compilation.status).toBe('valid')
      expect(workspace.state.draftSources[0]?.content).toContain(`${kind} ${kind}`)
      expect(workspace.state.lastValidModel?.$data.elements[kind]).toBeDefined()
      expect(workspace.state.history.past).toHaveLength(1)
    },
  )

  it('creates exactly one directed relation and returns its compiled identity', async () => {
    const workspace = await createWorkspace()
    const beforeRelations = Object.keys(workspace.state.lastValidModel?.$data.relations ?? {})

    const result = await workspace.dispatch(relationOperation())

    expect(result).toEqual({
      status: 'applied',
      command: 'relation.create',
      revision: 1,
      createdRelationId: `relation-${beforeRelations.length + 1}`,
    })
    expect(workspace.state.committedSources[0]?.content.match(/customer -> shop\.web/g)).toHaveLength(1)
    expect(workspace.state.history.past).toHaveLength(1)
    expect(workspace.state.history.future).toEqual([])
  })

  it('rejects a stale operation without invoking source edits', async () => {
    let editCalls = 0
    const workspace = await EditorWorkspace.create(sources, compiler, async (current, input) => {
      editCalls += 1
      return editElement(current, input)
    }, editRelation)
    const before = workspace.state

    const result = await workspace.dispatch(elementOperation('actor' as ElementKind, 99))

    expect(result).toEqual({ status: 'conflict', revision: 0 })
    expect(workspace.state).toBe(before)
    expect(editCalls).toBe(0)
  })

  it('keeps an invalid draft separate from the committed source and model', async () => {
    const workspace = await createWorkspace()
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
    const workspace = await createWorkspace()

    const [first, second] = await Promise.all([
      workspace.dispatch(elementOperation('actor' as ElementKind)),
      workspace.dispatch({ ...elementOperation('system' as ElementKind), id: 2 }),
    ])

    expect(first.status).toBe('applied')
    expect(second).toEqual({ status: 'conflict', revision: 1 })
    expect(workspace.state.revision).toBe(1)
  })

  it('leaves every semantic field unchanged when relation editing fails', async () => {
    const workspace = await EditorWorkspace.create(sources, compiler, editElement, async () => {
      throw new Error('failed')
    })
    const before = workspace.state

    const result = await workspace.dispatch(relationOperation())

    expect(result).toMatchObject({
      status: 'rejected',
      issues: [{ code: 'relation-source-edit-failed' }],
    })
    expect(workspace.state).toBe(before)
  })

  it('undoes relation creation atomically and restores byte-exact source', async () => {
    const workspace = await createWorkspace()
    const original = workspace.state.committedSources[0]?.content
    await workspace.dispatch(relationOperation())

    const result = await workspace.undo(1)

    expect(result).toEqual({ status: 'applied', command: 'history.undo', revision: 2 })
    expect(workspace.state.committedSources[0]?.content).toBe(original)
    expect(workspace.state.draftSources[0]?.content).toBe(original)
    expect(workspace.state.revision).toBe(2)
    expect(workspace.state.history.past).toEqual([])
    expect(workspace.state.history.future).toHaveLength(1)
    expect(workspace.state.lastValidModel?.$data.relations).toEqual(modelFor(original ?? '').$data.relations)
  })

  it('rejects stale, empty and invalid-draft undo without mutation', async () => {
    const workspace = await createWorkspace()
    const initial = workspace.state

    expect(await workspace.undo(99)).toEqual({ status: 'conflict', revision: 0 })
    expect(await workspace.undo(0)).toMatchObject({ status: 'rejected', issues: [{ code: 'history-empty' }] })
    expect(workspace.state).toBe(initial)

    await workspace.updateDraft([{ uri: 'model.c4', content: 'model {' }])
    const invalid = workspace.state
    expect(await workspace.undo(0)).toMatchObject({ status: 'rejected', issues: [{ code: 'workspace-invalid' }] })
    expect(workspace.state).toBe(invalid)
  })

  it('keeps state unchanged when the undo candidate does not compile', async () => {
    const rejectingUndoCompiler: CompilerPort = async request => {
      if (request.revision === 2 && request.sources[0]?.content === starterSource) {
        return { revision: 2, diagnostics: [{ message: 'invalid history' }], model: null }
      }
      return compiler(request)
    }
    const workspace = await createWorkspace(rejectingUndoCompiler)
    await workspace.dispatch(relationOperation())
    const before = workspace.state

    const result = await workspace.undo(1)

    expect(result).toMatchObject({ status: 'rejected', issues: [{ code: 'undo-compile-rejected' }] })
    expect(workspace.state).toBe(before)
  })

  it('serializes dispatch and Undo on the same expected revision', async () => {
    const workspace = await createWorkspace()

    const [created, undo] = await Promise.all([
      workspace.dispatch(relationOperation()),
      workspace.undo(0),
    ])

    expect(created.status).toBe('applied')
    expect(undo).toEqual({ status: 'conflict', revision: 1 })
    expect(workspace.state.revision).toBe(1)
  })

  it('clears future after a new semantic operation following Undo', async () => {
    const workspace = await createWorkspace()
    await workspace.dispatch(relationOperation())
    await workspace.undo(1)
    expect(workspace.state.history.future).toHaveLength(1)

    await workspace.dispatch(elementOperation('actor' as ElementKind, 2))

    expect(workspace.state.history.future).toEqual([])
  })
})
