import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import { EditorWorkspace } from './workspace'

const sources = [{ uri: 'model.c4', content: starterSource }]

describe('EditorWorkspace production relation path', () => {
  it('creates one source-preserving relation and undoes it byte-exactly', async () => {
    const workspace = await EditorWorkspace.create(sources, compile)
    const originalSource = workspace.state.committedSources[0]?.content
    const initialRelationIds = new Set(Object.keys(workspace.state.lastValidModel?.$data.relations ?? {}))

    const created = await workspace.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: {
        type: 'relation.create',
        input: {
          sourceId: 'customer' as Fqn,
          targetId: 'shop.web' as Fqn,
          documentUri: 'model.c4',
        },
      },
    })

    expect(created).toMatchObject({
      status: 'applied',
      command: 'relation.create',
      revision: 1,
    })
    if (created.status !== 'applied' || created.command !== 'relation.create') {
      throw new Error('Expected relation.create to apply')
    }
    expect(initialRelationIds.has(created.createdRelationId)).toBe(false)
    expect(workspace.state.committedSources[0]?.content.match(/customer -> shop\.web/g)).toHaveLength(1)
    expect(workspace.state.history.past).toHaveLength(1)

    const undone = await workspace.undo(1)

    expect(undone).toEqual({ status: 'applied', command: 'history.undo', revision: 2 })
    expect(workspace.state.committedSources[0]?.content).toBe(originalSource)
    expect(workspace.state.draftSources[0]?.content).toBe(originalSource)
    expect(Object.keys(workspace.state.lastValidModel?.$data.relations ?? {})).toEqual([...initialRelationIds])
    expect(workspace.state.history.past).toEqual([])
    expect(workspace.state.history.future).toHaveLength(1)
  })
})
