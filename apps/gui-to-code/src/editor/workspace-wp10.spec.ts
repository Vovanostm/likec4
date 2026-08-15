import type { ElementKind, Fqn, RelationId, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { EditorWorkspace } from './workspace'

const actorKind = 'actor' as ElementKind
const componentKind = 'component' as ElementKind

const source = `specification {
  element actor
  element system
  element component
}

model {
  user = actor 'User'
  shop = system 'Shop' {
    frontend = component 'Frontend'
  }
  user -> shop 'Uses'
}

views {
  view index of shop {
    include *
  }
}
`

async function workspace() {
  return EditorWorkspace.create([{ uri: 'model.c4', content: source }], compile)
}

function firstRelation(editor: Awaited<ReturnType<typeof workspace>>): RelationId {
  const id = Object.keys(editor.state.lastValidModel?.$data.relations ?? {})[0]
  if (!id) throw new Error('Expected relation')
  return id as RelationId
}

function nodePosition(editor: Awaited<ReturnType<typeof workspace>>, viewId: ViewId, elementId: Fqn) {
  const snapshot = editor.state.manualLayouts[viewId]
  const nodes = snapshot?.nodes as readonly {
    readonly id: string
    readonly modelRef?: string
    readonly x: number
    readonly y: number
  }[] | undefined
  const node = nodes?.find(candidate => candidate.id === elementId || candidate.modelRef === elementId)
  return node ? { x: node.x, y: node.y } : null
}

describe('EditorWorkspace WP-10 canvas entity commands', () => {
  it('patches a selected logical relation with one Undo/Redo history entry', async () => {
    const editor = await workspace()
    const relationId = firstRelation(editor)

    expect(await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: { type: 'relation.patch', input: { id: relationId, patch: { title: 'Purchases' } } },
    })).toMatchObject({ status: 'applied', command: 'relation.patch', revision: 1 })
    expect(editor.state.committedSources[0]?.content).toContain("user -> shop 'Purchases'")
    expect(editor.state.history.past).toHaveLength(1)

    expect(await editor.undo(1)).toEqual({ status: 'applied', command: 'history.undo', revision: 2 })
    expect(editor.state.committedSources[0]?.content).toBe(source)
    expect(await editor.redo(2)).toEqual({ status: 'applied', command: 'history.redo', revision: 3 })
    expect(editor.state.committedSources[0]?.content).toContain("user -> shop 'Purchases'")
  })

  it('removes exactly one selected relation and restores it with one Undo', async () => {
    const editor = await workspace()
    const relationId = firstRelation(editor)

    expect(await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: { type: 'relation.remove', input: { id: relationId } },
    })).toEqual({ status: 'applied', command: 'relation.remove', revision: 1, removedRelationId: relationId })
    expect(editor.state.lastValidModel?.$data.relations).toEqual({})
    expect(editor.state.committedSources[0]?.content).not.toContain('user -> shop')

    await editor.undo(1)
    expect(editor.state.committedSources[0]?.content).toBe(source)
    expect(Object.keys(editor.state.lastValidModel?.$data.relations ?? {})).toHaveLength(1)
  })

  it('creates a child of the scoped view and exact manual position atomically', async () => {
    const editor = await workspace()
    const viewId = 'index' as ViewId

    const result = await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: {
        type: 'element.createAt',
        input: { kind: componentKind, viewId, position: { x: 320, y: 180 } },
      },
    })
    expect(result).toMatchObject({
      status: 'applied',
      command: 'element.createAt',
      revision: 1,
      createdElementId: 'shop.component',
      viewId,
    })
    if (result.status !== 'applied' || result.command !== 'element.createAt') throw new Error('Expected createAt')
    expect(editor.state.committedSources[0]?.content).toContain('component component')
    expect(nodePosition(editor, viewId, result.createdElementId)).toEqual({ x: 320, y: 180 })
    expect(editor.state.history.past).toHaveLength(1)

    await editor.undo(1)
    expect(editor.state.committedSources[0]?.content).toBe(source)
    expect(editor.state.manualLayouts[viewId]).toBeUndefined()
    await editor.redo(2)
    expect(nodePosition(editor, viewId, result.createdElementId)).toEqual({ x: 320, y: 180 })
  })

  it('creates scoped element with initial title, directed sibling relation and placement in one transaction', async () => {
    const editor = await workspace()
    const viewId = 'index' as ViewId

    const result = await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: {
        type: 'element.createConnected',
        input: {
          sourceId: 'shop.frontend' as Fqn,
          kind: componentKind,
          title: 'Payment module',
          viewId,
          position: { x: 420, y: 240 },
        },
      },
    })
    if (result.status !== 'applied') {
      throw new Error(`Expected createConnected, got ${JSON.stringify(result)}`)
    }
    expect(result).toMatchObject({
      status: 'applied',
      command: 'element.createConnected',
      revision: 1,
      createdElementId: 'shop.component',
      viewId,
    })
    if (result.command !== 'element.createConnected') throw new Error(`Expected createConnected, got ${result.command}`)
    expect(editor.state.lastValidModel?.$data.elements[result.createdElementId]).toMatchObject({ title: 'Payment module' })
    expect(editor.state.lastValidModel?.$data.relations[result.createdRelationId]).toMatchObject({
      source: { model: 'shop.frontend' },
      target: { model: result.createdElementId },
    })
    expect(editor.state.committedSources[0]?.content).toMatch(/component component 'Payment module'/)
    expect(nodePosition(editor, viewId, result.createdElementId)).toEqual({ x: 420, y: 240 })
    expect(editor.state.history.past).toHaveLength(1)

    await editor.undo(1)
    expect(editor.state.committedSources[0]?.content).toBe(source)
    expect(editor.state.manualLayouts[viewId]).toBeUndefined()
    expect(editor.state.lastValidModel?.$data.elements[result.createdElementId]).toBeUndefined()
    expect(editor.state.lastValidModel?.$data.relations[result.createdRelationId]).toBeUndefined()

    await editor.redo(2)
    expect(editor.state.lastValidModel?.$data.elements[result.createdElementId]).toMatchObject({ title: 'Payment module' })
    expect(editor.state.lastValidModel?.$data.relations[result.createdRelationId]).toBeDefined()
    expect(nodePosition(editor, viewId, result.createdElementId)).toEqual({ x: 420, y: 240 })
  })

  it('rejects a parent-to-new-child relation without mutating workspace state', async () => {
    const editor = await workspace()
    const before = editor.state

    expect(await editor.dispatch({
      id: 1,
      expectedRevision: 0,
      semantic: {
        type: 'element.createConnected',
        input: {
          sourceId: 'shop' as Fqn,
          kind: componentKind,
          viewId: 'index' as ViewId,
          position: { x: 420, y: 240 },
        },
      },
    })).toMatchObject({ status: 'rejected', revision: 0, issues: [{ code: 'compile-rejected' }] })
    expect(editor.state).toBe(before)
  })

  it('rejects stale revision and invalid position without any mutation', async () => {
    const editor = await workspace()
    const before = editor.state
    expect(await editor.dispatch({
      id: 1,
      expectedRevision: 99,
      semantic: {
        type: 'element.createAt',
        input: { kind: actorKind, viewId: 'index' as ViewId, position: { x: 1, y: 2 } },
      },
    })).toEqual({ status: 'conflict', revision: 0 })
    expect(editor.state).toBe(before)

    expect(await editor.dispatch({
      id: 2,
      expectedRevision: 0,
      semantic: {
        type: 'element.createAt',
        input: { kind: actorKind, viewId: 'index' as ViewId, position: { x: Number.NaN, y: 2 } },
      },
    })).toMatchObject({ status: 'rejected', issues: [{ code: 'invalid-position' }] })
    expect(editor.state).toBe(before)
  })
})
