import type { DiagramEdge, DiagramNode, ElementKind, LayoutedView } from '@likec4/core/types'
import { Fqn } from '@likec4/core/types'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { compile } from '../compiler'
import { snapshotFromLayout } from './layout-snapshots'
import { envelopeFromState } from './persisted-workspace'
import { EditorWorkspace } from './workspace'
import { exportWorkspaceBundle, importWorkspaceBundle } from './workspace-bundle'

const source = `// Keep routing changes out of source
specification { element component }
model { api = component 'API' db = component 'Database' api -> db 'queries' }
views { view index { include * } }
`

function borderDistance(point: readonly [number, number], node: DiagramNode): number {
  const [x, y] = point
  const left = Math.max(node.x - x, 0, x - node.x - node.width)
  const top = Math.max(node.y - y, 0, y - node.y - node.height)
  if (left || top) return Math.hypot(left, top)
  return Math.min(x - node.x, node.x + node.width - x, y - node.y, node.y + node.height - y)
}

function attached(view: LayoutedView, edge: DiagramEdge): void {
  const start = view.nodes.find(node => node.id === (edge.dir === 'back' ? edge.target : edge.source))
  const end = view.nodes.find(node => node.id === (edge.dir === 'back' ? edge.source : edge.target))
  if (!start || !end || !edge.points[0] || !edge.points.at(-1)) throw new Error('Missing route endpoint')
  expect(borderDistance(edge.points[0], start)).toBeLessThanOrEqual(12)
  expect(borderDistance(edge.points.at(-1)!, end)).toBeLessThanOrEqual(12)
}

describe('standard snapshot routing integration', { timeout: 20_000 }, () => {
  it('repairs the reported saved workspace on reload without moving its nodes', async () => {
    const reported = readFileSync(
      new URL('../../tasks/c4-connection-readability/user-model-before.c4', import.meta.url),
      'utf8',
    )
    const initial = await EditorWorkspace.create([{ uri: 'model.c4', content: reported }], compile)
    const auto = initial.state.lastValidModel?.view('index').$layouted
    if (!auto) throw new Error('Missing reported view')
    const snapshot = snapshotFromLayout(auto)
    const positions: Record<string, { x: number; y: number }> = {
      shop: { x: 97, y: -129 },
      customer: { x: 48, y: 392 },
      'shop.actor': { x: 730, y: 431 },
      'shop.system': { x: 253, y: 224 },
      'shop.web': { x: 139, y: -69 },
      'shop.component': { x: 882, y: -30 },
    }
    for (const node of snapshot.nodes) {
      const pos = positions[node.id]
      if (!pos) throw new Error(`Unexpected reported node ${node.id}`)
      node.x = pos.x
      node.y = pos.y
      if (node.id === 'shop') {
        node.width = 1147
        node.height = 782
      }
    }
    const reloaded = await EditorWorkspace.create(initial.state.committedSources, compile, undefined, 'default', {
      [auto.id]: snapshot,
    })
    const repaired = reloaded.state.lastValidModel?.view('index').$layouted
    if (!repaired) throw new Error('Missing repaired view')
    expect(repaired.nodes.map(node => ({ id: node.id, x: node.x, y: node.y }))).toEqual(
      snapshot.nodes.map(node => ({ id: node.id, x: node.x, y: node.y })),
    )
    for (const edge of repaired.edges) attached(repaired, edge)
    expect(reloaded.state.committedSources).toEqual(initial.state.committedSources)
    const secondReload = await EditorWorkspace.create(
      reloaded.state.committedSources,
      compile,
      undefined,
      'default',
      reloaded.state.manualLayouts,
    )
    expect(secondReload.state.manualLayouts).toEqual(reloaded.state.manualLayouts)
  })

  it('repairs a moved endpoint without changing source or other nodes; history, reload and ZIP retain routes', async () => {
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: source }], compile)
    const before = editor.state.lastValidModel?.view('index').$layouted
    if (!before) throw new Error('Missing fixture view')
    const snapshot = snapshotFromLayout(before)
    const api = snapshot.nodes.find(node => node.id === 'api')
    if (!api) throw new Error('Missing API')
    api.x -= 180
    api.y += 280
    expect(
      (await editor.dispatch({
        id: 1,
        expectedRevision: editor.state.revision,
        layout: { type: 'layout.save', input: { viewId: before.id, snapshot } },
      })).status,
    ).toBe('applied')
    const saved = editor.state
    const view = saved.lastValidModel?.view('index').$layouted
    if (!view) throw new Error('Missing saved view')
    attached(view, view.edges[0]!)
    expect(saved.manualLayouts[before.id]?.nodes.find(node => node.id === 'db')).toEqual(
      before.nodes.find(node => node.id === 'db'),
    )
    expect(saved.committedSources[0]?.content).toBe(source)
    await editor.undo(saved.revision)
    await editor.redo(editor.state.revision)
    expect(editor.state.manualLayouts).toEqual(saved.manualLayouts)
    const reloaded = await EditorWorkspace.create(
      saved.committedSources,
      compile,
      undefined,
      'default',
      saved.manualLayouts,
    )
    expect(reloaded.state.manualLayouts).toEqual(saved.manualLayouts)
    const decoded = importWorkspaceBundle(
      new Uint8Array(await exportWorkspaceBundle(envelopeFromState(saved)).arrayBuffer()),
    )
    expect(decoded.manualLayouts).toEqual(saved.manualLayouts)
  })

  it('routes connected creation only after final collision-free placement', async () => {
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: source }], compile)
    const view = editor.state.lastValidModel?.view('index').$layouted
    const api = view?.nodes.find(node => node.id === 'api')
    if (!view || !api) throw new Error('Missing fixture view')
    const result = await editor.dispatch({
      id: 1,
      expectedRevision: editor.state.revision,
      semantic: {
        type: 'element.createConnected',
        input: {
          kind: 'component' as ElementKind,
          viewId: view.id,
          sourceId: Fqn('api'),
          position: { x: api.x, y: api.y },
          title: 'Worker',
        },
      },
    })
    expect(result.status).toBe('applied')
    const final = editor.state.lastValidModel?.view('index').$layouted
    if (!final) throw new Error('Missing created view')
    for (const edge of final.edges) attached(final, edge)
    expect(editor.state.history.past).toHaveLength(1)
    expect(editor.state.committedSources[0]?.content).toContain('// Keep routing changes out of source')
  })
})
