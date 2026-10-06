import { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { snapshotFromLayout } from './layout-snapshots'
import { EditorWorkspace } from './workspace'

const source = `specification { element component }
model {
  api = component 'API'
  db = component 'DB'
  api -> db
}
views { view index { include * } }
`

describe('current semantics with retained manual geometry', () => {
  it('places newly visible relation endpoints outside retained manual compounds and preserves history', async () => {
    const initial = `specification { element component }
model {
  root = component { child = component 'Child' }
  external = component 'External'
}
views { view index of root { include * } }
`
    const linked = initial.replace(
      '  external = component \'External\'',
      '  external = component \'External\'\n  root.child -> external',
    )
    const automatic = await EditorWorkspace.create([{ uri: 'model.c4', content: linked }], compile)
    const incoming = automatic.state.lastValidModel?.view('index').$layouted.nodes.find(node => node.id === 'external')
    if (!incoming) throw new Error('Expected new external endpoint')
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: initial }], compile)
    const view = editor.state.lastValidModel?.view('index').$layouted
    if (!view) throw new Error('Expected scoped view')
    const snapshot = snapshotFromLayout(view)
    const child = snapshot.nodes.find(node => node.id === 'root.child')
    const compound = snapshot.nodes.find(node => node.id === 'root')
    if (!child || !compound) throw new Error('Expected retained compound and child')
    child.x = incoming.x + 20
    child.y = incoming.y + 20
    Object.assign(compound, {
      x: child.x - 42,
      y: child.y - 60,
      width: child.width + 84,
      height: child.height + 102,
    })
    expect(
      (await editor.dispatch({
        id: 1,
        expectedRevision: editor.state.revision,
        layout: { type: 'layout.save', input: { viewId: view.id, snapshot } },
      })).status,
    ).toBe('applied')
    const before = editor.state
    expect(
      (await editor.dispatch({
        id: 2,
        expectedRevision: editor.state.revision,
        semantic: { type: 'relation.create', input: { sourceId: Fqn('root.child'), targetId: Fqn('external') } },
      })).status,
    ).toBe('applied')
    const result = editor.state.lastValidModel?.view('index').$layouted
    if (!result) throw new Error('Expected linked view')
    const external = result.nodes.find(node => node.id === 'external')!
    for (const retained of [child, compound]) {
      expect(result.nodes.find(node => node.id === retained.id)).toMatchObject({ x: retained.x, y: retained.y })
      expect(
        external.x >= retained.x + retained.width + 24 || external.x + external.width + 24 <= retained.x
          || external.y >= retained.y + retained.height + 24 || external.y + external.height + 24 <= retained.y,
      )
        .toBe(true)
    }
    const after = editor.state
    await editor.undo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(before.committedSources)
    expect(editor.state.manualLayouts).toEqual(before.manualLayouts)
    await editor.redo(editor.state.revision)
    expect(editor.state.manualLayouts).toEqual(after.manualLayouts)
    const restored = await EditorWorkspace.create(
      after.committedSources,
      compile,
      undefined,
      'default',
      after.manualLayouts,
    )
    expect(restored.state.manualLayouts).toEqual(after.manualLayouts)
  })
  it(
    'renders current titles and labels, removes ghosts, and restores geometry through history and reload',
    async () => {
      const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: source }], compile)
      const autoView = editor.state.lastValidModel?.$data.views['index']
      if (!autoView) throw new Error('Expected fixture view')
      const snapshot = snapshotFromLayout(autoView)
      const api = snapshot.nodes.find(node => node.modelRef === 'api')
      if (!api) throw new Error('Expected API node')
      api.x += 120
      api.y += 75
      api.labelBBox.x += 120
      api.labelBBox.y += 75
      const position = { x: api.x, y: api.y }
      expect(
        (await editor.dispatch({
          id: 1,
          expectedRevision: editor.state.revision,
          layout: { type: 'layout.save', input: { viewId: autoView.id, snapshot } },
        })).status,
      ).toBe('applied')
      const relation = Object.values(editor.state.lastValidModel?.$data.relations ?? {})[0]
      if (!relation) throw new Error('Expected fixture relation')
      const patched = await editor.dispatch({
        id: 2,
        expectedRevision: editor.state.revision,
        semantic: { type: 'relation.patch', input: { id: relation.id, patch: { title: 'Заказы' } } },
      })
      expect(patched).toMatchObject({ status: 'applied' })
      expect(editor.state.lastValidModel?.view(autoView.id).$layouted.edges[0]?.label).toBe('Заказы')
      expect(
        (await editor.dispatch({
          id: 3,
          expectedRevision: editor.state.revision,
          semantic: { type: 'element.patch', input: { id: Fqn('api'), patch: { title: 'Сервис оформления заказов' } } },
        })).status,
      ).toBe('applied')
      const updated = editor.state.lastValidModel?.view(autoView.id).$layouted
      expect(updated?.nodes.find(node => node.modelRef === 'api')).toMatchObject({
        ...position,
        title: 'Сервис оформления заказов',
      })
      const beforeRemoval = editor.state
      const inspected = await editor.inspectElementRemoval(Fqn('db'), editor.state.revision)
      if (inspected.status !== 'ready') throw new Error('Expected dependency report')
      expect(
        (await editor.dispatch({
          id: 4,
          expectedRevision: editor.state.revision,
          semantic: {
            type: 'element.remove',
            input: {
              id: Fqn('db'),
              dependencyRevision: inspected.report.revision,
              approvedDependencyIds: inspected.report.dependencies.map(dependency => dependency.id),
            },
          },
        })).status,
      ).toBe('applied')
      const afterRemoval = editor.state
      const removedView = editor.state.lastValidModel?.view(autoView.id).$layouted
      expect(removedView?.nodes.map(node => node.modelRef)).toEqual(['api'])
      expect(removedView?.edges).toHaveLength(0)
      expect(removedView?.nodes[0]).toMatchObject(position)
      const restored = await EditorWorkspace.create(
        afterRemoval.committedSources,
        compile,
        undefined,
        'default',
        afterRemoval.manualLayouts,
        afterRemoval.entryDocumentUri,
        afterRemoval.revision,
      )
      expect(restored.state.lastValidModel?.view(autoView.id).$layouted.nodes.map(node => node.modelRef)).toEqual([
        'api',
      ])
      expect(restored.state.lastValidModel?.view(autoView.id).$layouted.edges).toHaveLength(0)
      expect(restored.state.lastValidModel?.view(autoView.id).$layouted.nodes[0]).toMatchObject(position)
      await editor.undo(editor.state.revision)
      expect(editor.state.committedSources).toEqual(beforeRemoval.committedSources)
      expect(editor.state.manualLayouts).toEqual(beforeRemoval.manualLayouts)
      await editor.redo(editor.state.revision)
      expect(editor.state.committedSources).toEqual(afterRemoval.committedSources)
      expect(editor.state.manualLayouts).toEqual(afterRemoval.manualLayouts)
    },
    15_000,
  )
})
