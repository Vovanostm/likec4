import { type ElementKind, type ViewId, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import type { CreationPlacementNode } from './creation-placement'
import { snapshotFromLayout } from './layout-snapshots'
import { EditorWorkspace } from './workspace'

const kind = 'component' as ElementKind
const viewId = 'index' as ViewId
const position = { x: 150, y: 200 }

function assertSiblingSeparation(nodes: readonly CreationPlacementNode[]): void {
  for (const a of nodes) {
    for (const b of nodes) {
      if (a.id === b.id || a.parent !== b.parent) continue
      expect(
        a.x + a.width + 24 <= b.x || b.x + b.width + 24 <= a.x
          || a.y + a.height + 24 <= b.y || b.y + b.height + 24 <= a.y,
      ).toBe(true)
    }
  }
}

function geometry(node: CreationPlacementNode) {
  return { id: node.id, x: node.x, y: node.y, width: node.width, height: node.height }
}

describe('EditorWorkspace collision-free canvas creation', { timeout: 20_000 }, () => {
  it.each([
    { x: 400, y: 500 },
    { x: -300, y: 500 },
    { x: 1000, y: 100 },
  ])('creates starter children outside the current compound at $x,$y', async requested => {
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    for (const type of ['element.createAt', 'element.createConnected'] as const) {
      const result = await editor.dispatch({
        id: editor.state.revision + 1,
        expectedRevision: editor.state.revision,
        semantic: type === 'element.createAt'
          ? { type, input: { kind, viewId, position: requested } }
          : {
            type,
            input: { kind, viewId, sourceId: Fqn('shop.web'), title: 'Новый компонент', position: requested },
          },
      })
      if (result.status !== 'applied') throw new Error(JSON.stringify(result))
      expect(result).toMatchObject({ status: 'applied', command: type })
      const nodes = editor.state.manualLayouts[viewId]?.nodes
      if (!nodes) throw new Error('Expected standard snapshot')
      assertSiblingSeparation(nodes)
    }
  })

  it.each(['element.createAt', 'element.createConnected'] as const)(
    'repeats starter %s ten times outside the scope without moving retained leaves',
    async type => {
      const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
      for (let index = 0; index < 10; index++) {
        const retained = editor.state.manualLayouts[viewId]?.nodes.filter(node =>
          !node.children.length
        ).map(geometry) ?? []
        const requested = { x: 400, y: 500 }
        const result = await editor.dispatch({
          id: editor.state.revision + 1,
          expectedRevision: editor.state.revision,
          semantic: type === 'element.createAt'
            ? { type, input: { kind, viewId, position: requested } }
            : {
              type,
              input: { kind, viewId, sourceId: Fqn('shop.web'), title: 'Новый компонент', position: requested },
            },
        })
        expect(result).toMatchObject({ status: 'applied', command: type })
        const nodes = editor.state.manualLayouts[viewId]?.nodes
        if (!nodes) throw new Error('Expected standard snapshot')
        assertSiblingSeparation(nodes)
        expect(nodes.filter(node => retained.some(previous => previous.id === node.id)).map(geometry)).toEqual(retained)
        for (const parent of nodes.filter(node => node.children.length)) {
          for (const child of nodes.filter(node => node.parent === parent.id)) {
            expect(child.x).toBeGreaterThanOrEqual(parent.x + 42)
            expect(child.y).toBeGreaterThanOrEqual(parent.y + 60)
            expect(child.x + child.width).toBeLessThanOrEqual(parent.x + parent.width - 42)
            expect(child.y + child.height).toBeLessThanOrEqual(parent.y + parent.height - 42)
          }
        }
      }
    },
  )

  it.each([
    {
      scope: 'root',
      model: 'anchor = component',
      view: 'view index { include * }',
      anchorId: 'anchor',
    },
    {
      scope: 'nested',
      model: 'shop = component { anchor = component }',
      view: 'view index of shop { include * }',
      anchorId: 'shop.anchor',
    },
  ])('places ten $scope sibling creates and preserves manual geometry across reload/history', async fixture => {
    const source =
      `// Preserve source comment\nspecification { element component }\nmodel { ${fixture.model} }\nviews { ${fixture.view} }\n`
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: source }], compile)
    const auto = editor.state.lastValidModel?.$data.views[viewId]
    if (!auto) throw new Error('Expected fixture view')
    const snapshot = snapshotFromLayout(auto)
    const anchor = snapshot.nodes.find(node => node.modelRef === fixture.anchorId)
    if (!anchor) throw new Error('Expected fixture anchor')
    anchor.labelBBox.x += position.x - anchor.x
    anchor.labelBBox.y += position.y - anchor.y
    anchor.x = position.x
    anchor.y = position.y
    expect(
      (await editor.dispatch({
        id: 1,
        expectedRevision: editor.state.revision,
        layout: { type: 'layout.save', input: { viewId, snapshot } },
      })).status,
    ).toBe('applied')

    for (let index = 0; index < 10; index++) {
      const before = editor.state.manualLayouts[viewId]?.nodes.filter(node => !node.children.length).map(geometry)
      const result = await editor.dispatch({
        id: index + 2,
        expectedRevision: editor.state.revision,
        semantic: { type: 'element.createAt', input: { kind, viewId, position } },
      })
      expect(result).toMatchObject({ status: 'applied', command: 'element.createAt' })
      if (result.status !== 'applied' || result.command !== 'element.createAt') throw new Error('Expected createAt')
      const nodes = editor.state.manualLayouts[viewId]?.nodes
      if (!nodes) throw new Error('Expected standard snapshot')
      expect(nodes.filter(node => before?.some(previous => previous.id === node.id)).map(geometry)).toEqual(before)
      assertSiblingSeparation(nodes)
      expect(editor.state.history.past).toHaveLength(index + 2)
      expect(editor.state.committedSources[0]?.content).toContain('// Preserve source comment')
    }
    const committed = editor.state
    expect((await editor.undo(committed.revision)).status).toBe('applied')
    expect((await editor.redo(editor.state.revision)).status).toBe('applied')
    expect(editor.state.manualLayouts).toEqual(committed.manualLayouts)
    expect(editor.state.committedSources).toEqual(committed.committedSources)
    const reloaded = await EditorWorkspace.create(
      committed.committedSources,
      compile,
      undefined,
      'default',
      committed.manualLayouts,
      committed.entryDocumentUri,
      committed.revision,
    )
    expect(reloaded.state.manualLayouts).toEqual(committed.manualLayouts)
    assertSiblingSeparation(reloaded.state.lastValidModel?.$data.views[viewId]?.nodes ?? [])
  })

  it('commits connected creation, collision-free placement and relation in one undoable operation', async () => {
    const source =
      `specification { element component }\nmodel { anchor = component }\nviews { view index { include * } }\n`
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: source }], compile)
    const anchor = editor.state.lastValidModel?.$data.views[viewId]?.nodes[0]
    if (!anchor) throw new Error('Expected anchor')
    const before = editor.state
    const result = await editor.dispatch({
      id: 1,
      expectedRevision: before.revision,
      semantic: {
        type: 'element.createConnected',
        input: { kind, viewId, sourceId: Fqn('anchor'), title: 'Новый компонент', position: anchor },
      },
    })
    expect(result).toMatchObject({ status: 'applied', command: 'element.createConnected' })
    const after = editor.state
    expect(after.history.past).toHaveLength(1)
    assertSiblingSeparation(after.manualLayouts[viewId]?.nodes ?? [])
    expect(Object.values(after.lastValidModel?.$data.relations ?? {})).toHaveLength(1)
    expect((await editor.undo(after.revision)).status).toBe('applied')
    expect(editor.state.committedSources).toEqual(before.committedSources)
    expect(editor.state.manualLayouts).toEqual(before.manualLayouts)
    expect((await editor.redo(editor.state.revision)).status).toBe('applied')
    expect(editor.state.manualLayouts).toEqual(after.manualLayouts)
    expect(editor.state.committedSources).toEqual(after.committedSources)
  })
})
