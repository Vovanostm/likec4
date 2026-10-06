import { type DiagramEdge, type DiagramNode, type LayoutedElementView, EdgeId, Fqn, NodeId } from '@likec4/core/types'
import { Bezier } from 'bezier-js'
import { describe, expect, it } from 'vitest'
import { prepareFixtures } from './__tests__/fixture'
import { reconcileEdgeRoute, reconcileEdgeRoutes } from './reconcileEdgeRoutes'

const prototype = prepareFixtures({}).layouted

function node(id: string, x: number, y: number): DiagramNode {
  return {
    ...prototype.nodes[0]!,
    id: NodeId(id),
    modelRef: Fqn(id),
    parent: null,
    children: [],
    x,
    y,
    width: 100,
    height: 80,
    labelBBox: { x: 10, y: 20, width: 80, height: 30 },
  }
}

function edge(): DiagramEdge {
  return {
    ...prototype.edges[0]!,
    id: EdgeId('route'),
    parent: null,
    source: NodeId('source'),
    target: NodeId('target'),
    dir: 'forward',
    points: [[106, 40], [190, 40], [300, 40], [394, 40]],
    controlPoints: null,
    labelBBox: { x: 250, y: 40, width: 80, height: 20 },
  }
}

function view(nodes: readonly DiagramNode[], route = edge()): LayoutedElementView {
  return { ...prototype, nodes, edges: [route] }
}

function assertAvoids(route: DiagramEdge, obstacle: DiagramNode): void {
  expect((route.points.length - 1) % 3).toBe(0)
  for (let i = 0; i + 3 < route.points.length; i += 3) {
    const a = route.points[i]!, b = route.points[i + 1]!, c = route.points[i + 2]!, d = route.points[i + 3]!
    const spline = new Bezier(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])
    const hitsBody = spline.getLUT(80).some(point =>
      point.x > obstacle.x && point.x < obstacle.x + obstacle.width
      && point.y > obstacle.y && point.y < obstacle.y + obstacle.height
    )
    expect(hitsBody).toBe(false)
  }
}

function assertAttached(point: readonly number[] | undefined, node: DiagramNode): void {
  if (!point) throw new Error('Expected route endpoint')
  const [x, y] = point
  expect(x).toBeGreaterThanOrEqual(node.x - 6)
  expect(x).toBeLessThanOrEqual(node.x + node.width + 6)
  expect(y).toBeGreaterThanOrEqual(node.y - 6)
  expect(y).toBeLessThanOrEqual(node.y + node.height + 6)
}

describe('post-placement route reconciliation', () => {
  it('preserves an unchanged safe Graphviz route and both input identities', () => {
    const layout = view([node('source', 0, 0), node('target', 400, 0)])
    const before = structuredClone(layout)
    expect(reconcileEdgeRoutes(layout)).toBe(layout)
    expect(layout).toEqual(before)
  })

  it('repairs a disconnected old snapshot without requiring previous node geometry', () => {
    const source = node('source', 0, 0), target = node('target', 600, 240)
    const old = edge()
    const result = reconcileEdgeRoute(old, [source, target])
    expect(result).not.toBe(old)
    assertAttached(result.points[0], source)
    assertAttached(result.points.at(-1), target)
    expect(result.controlPoints).toBeNull()
    expect(result.labelBBox).not.toEqual(old.labelBBox)
    expect(result.source).toBe(old.source)
    expect(result.target).toBe(old.target)
  })

  it('reroutes around a newly placed unrelated leaf without moving any node', () => {
    const obstacle = node('obstacle', 200, 0)
    const layout = view([node('source', 0, 0), node('target', 400, 0), obstacle])
    const before = structuredClone(layout)
    const result = reconcileEdgeRoutes(layout)
    expect(result.edges[0]?.points).not.toEqual(layout.edges[0]?.points)
    assertAvoids(result.edges[0]!, obstacle)
    expect(result.nodes).toBe(layout.nodes)
    expect(layout).toEqual(before)
    expect(reconcileEdgeRoutes(layout)).toEqual(result)
    expect(reconcileEdgeRoutes(result)).toBe(result)
  })

  it('keeps a safe customized control-point route and its user-positioned label', () => {
    const customized = {
      ...edge(),
      controlPoints: [{ x: 250, y: -100 }] satisfies [{ x: number; y: number }],
      isLabelCustomized: true,
    }
    const nodes = [node('source', 0, 0), node('target', 400, 100), node('unrelated', 900, 900)]
    expect(reconcileEdgeRoute(customized, nodes, [node('source', 0, 0), node('target', 400, 0)]))
      .toBe(customized)
  })

  it('checks the actual customized curve and clears unsafe control points', () => {
    const obstacle = node('obstacle', 200, 0)
    const customized = {
      ...edge(),
      controlPoints: [{ x: 250, y: 40 }] satisfies [{ x: number; y: number }],
    }
    const result = reconcileEdgeRoute(customized, [node('source', 0, 0), node('target', 400, 0), obstacle])
    expect(result).not.toBe(customized)
    expect(result.controlPoints).toBeNull()
    assertAvoids(result, obstacle)
  })

  it('repairs a retained curve that doubles back through its own endpoint after a large move', () => {
    const source = node('source', 0, 0), target = node('target', 0, 400)
    const customized: DiagramEdge = {
      ...edge(),
      controlPoints: [{ x: 50, y: -200 }, { x: 50, y: -400 }],
    }
    const before = structuredClone(customized)
    const result = reconcileEdgeRoute(customized, [source, target], [source, node('target', 0, -600)])
    expect(result).not.toBe(customized)
    expect(result.controlPoints).toBeNull()
    assertAvoids(result, source)
    assertAvoids(result, target)
    expect(customized).toEqual(before)
    expect(reconcileEdgeRoute(result, [source, target])).toBe(result)
  })

  it.each(['back', 'both'] as const)('preserves %s semantics while attaching final endpoints', dir => {
    const source = node('source', 0, 0), target = node('target', 600, 240)
    const reversed = { ...edge(), dir, head: 'normal' as const, tail: 'dot' as const }
    const result = reconcileEdgeRoute(reversed, [source, target])
    expect(result).toMatchObject({
      id: reversed.id,
      source: reversed.source,
      target: reversed.target,
      dir,
      head: reversed.head,
      tail: reversed.tail,
    })
    assertAttached(result.points[0], dir === 'back' ? target : source)
    assertAttached(result.points.at(-1), dir === 'back' ? source : target)
  })

  it('allows a child relation to cross its own containing compound', () => {
    const parent = { ...node('parent', -40, -60), width: 220, height: 220, children: [NodeId('source')] }
    const source = { ...node('source', 0, 0), parent: parent.id }
    const layout = view([parent, source, node('target', 400, 0)])
    expect(reconcileEdgeRoutes(layout)).toBe(layout)
  })

  it('repairs a moved self-loop without reducing it to a zero-length route', () => {
    const source = node('source', 500, 400)
    const loop = { ...edge(), target: source.id }
    const result = reconcileEdgeRoute(loop, [source])
    expect(result.points[0]).not.toEqual(result.points.at(-1))
    assertAttached(result.points[0], source)
    assertAttached(result.points.at(-1), source)
    assertAvoids(result, source)
  })

  it('detects movement even when an old endpoint remains near the new node border', () => {
    const source = node('source', 0, 0), target = node('target', 405, 0)
    const original = edge()
    const result = reconcileEdgeRoute(original, [source, target], [source, node('target', 400, 0)])
    expect(result).not.toBe(original)
    assertAttached(result.points.at(-1), target)
  })
  it('separates duplicate and reverse parallel routes deterministically', () => {
    const original = edge()
    const reverse = {
      ...original,
      id: EdgeId('reverse'),
      source: original.target,
      target: original.source,
      points: [...original.points].reverse() as DiagramEdge['points'],
    }
    const layout = { ...view([node('source', 0, 0), node('target', 400, 0)]), edges: [original, reverse] }
    const result = reconcileEdgeRoutes(layout)
    expect(result.edges[0]!.points).not.toEqual([...result.edges[1]!.points].reverse())
    expect(reconcileEdgeRoutes(result)).toBe(result)
  })

  it('routes with cardinal outward and inward tangents around the top obstacle', () => {
    const source = { ...node('source', 0, 0), height: 100 }
    const target = { ...node('target', 300, 0), height: 100 }
    const obstacle = { ...node('obstacle', 150, 20), height: 60 }
    const result = reconcileEdgeRoute(edge(), [source, target, obstacle])
    const tangent = (point: readonly number[], handle: readonly number[], box: DiagramNode) => {
      const [x, y] = point, [hx, hy] = handle
      const normal = y === box.y - 6 ?
        [0, -1]
        : y === box.y + box.height + 6 ?
        [0, 1]
        : x === box.x - 6
        ? [-1, 0]
        : [1, 0]
      const dx = hx! - x!, dy = hy! - y!
      expect(dx * normal[1]! - dy * normal[0]!).toBe(0)
      expect(dx * normal[0]! + dy * normal[1]!).toBeGreaterThan(0)
    }
    tangent(result.points[0]!, result.points[1]!, source)
    tangent(result.points.at(-1)!, result.points.at(-2)!, target)
    assertAvoids(result, obstacle)
  })

  it('relocates unsafe labels even when the route is safe and expands bounds', () => {
    const source = node('source', 0, 0), target = node('target', 400, 0)
    const route = { ...edge(), isLabelCustomized: true, labelBBox: { x: 0, y: 0, width: 600, height: 30 } }
    const layout = view([source, target], route)
    const result = reconcileEdgeRoutes(layout)
    const label = result.edges[0]!.labelBBox!
    expect(result.edges[0]!.points).not.toBe(route.points)
    expect(label).not.toEqual(route.labelBBox)
    for (const box of [source, target]) {
      expect(
        label.x >= box.x + box.width || label.x + label.width <= box.x
          || label.y >= box.y + box.height || label.y + label.height <= box.y,
      ).toBe(true)
    }
    expect(result.bounds.x).toBeLessThanOrEqual(label.x)
    expect(result.bounds.y).toBeLessThanOrEqual(label.y)
    expect(result.bounds.x + result.bounds.width).toBeGreaterThanOrEqual(label.x + label.width)
    expect(reconcileEdgeRoutes(result)).toBe(result)
  })

  it('keeps non-overlapping label boxes for multiple relations', () => {
    const first = edge(), second = { ...edge(), id: EdgeId('second') }
    const result = reconcileEdgeRoutes({
      ...view([node('source', 0, 0), node('target', 400, 0)]),
      edges: [first, second],
    })
    const a = result.edges[0]!.labelBBox!, b = result.edges[1]!.labelBBox!
    expect(
      a.x >= b.x + b.width || a.x + a.width <= b.x
        || a.y >= b.y + b.height || a.y + a.height <= b.y,
    ).toBe(true)
    expect(reconcileEdgeRoutes(result)).toBe(result)
  })

  it('separates repaired fan-out ports even for relations with different targets', () => {
    const source = node('source', 0, 0), target = node('target', 400, 0), other = node('other', 400, 160)
    const first = edge(), second = { ...edge(), id: EdgeId('second'), target: other.id }
    const previous = [node('source', -100, 0), target, other]
    const result = reconcileEdgeRoutes({ ...view([source, target, other]), edges: [first, second] }, previous)
    expect(result.edges[0]!.points[0]).not.toEqual(result.edges[1]!.points[0])
    expect(reconcileEdgeRoutes(result)).toBe(result)
  })

  it('centers independent connections on their facing sides instead of ranking all incident IDs', () => {
    const source = node('source', 0, 0), right = node('target', 400, 0), below = node('below', 0, 400)
    const routes = [
      { ...edge(), labelBBox: null },
      { ...edge(), id: EdgeId('below'), target: below.id, labelBBox: null },
    ]
    const result = reconcileEdgeRoutes({ ...view([source, right, below]), edges: routes }, [node('source', -300, -300)])
    expect(result.edges[0]!.points[0]).toEqual([106, 40])
    expect(result.edges[0]!.points.at(-1)).toEqual([394, 40])
    expect(result.edges[1]!.points[0]).toEqual([50, 86])
    expect(result.edges[1]!.points.at(-1)).toEqual([50, 394])
  })

  it('orders fan-out by neighboring geometry and produces the same routes after ID renaming', () => {
    const source = node('source', 0, 160), upper = node('upper', 400, 0), lower = node('lower', 400, 320)
    const routes = [
      { ...edge(), id: EdgeId('z-upper'), target: upper.id, labelBBox: null },
      { ...edge(), id: EdgeId('a-lower'), target: lower.id, labelBBox: null },
    ]
    const nodes = [source, upper, lower], previous = [node('source', -300, -300)]
    const result = reconcileEdgeRoutes({ ...view(nodes), edges: routes }, previous)
    expect(result.edges[0]!.points[0][1]).toBeLessThan(result.edges[1]!.points[0][1])
    const renamed = reconcileEdgeRoutes({
      ...view(nodes),
      edges: routes.map((route, i) => ({ ...route, id: EdgeId(`renamed-${i}`) })),
    }, previous)
    expect(renamed.edges.map(route => route.points)).toEqual(result.edges.map(route => route.points))
  })

  it('routes a connected 120-node grid without crossing bodies or changing its model/geometry', () => {
    const nodes = Array.from({ length: 120 }, (_, i) => node(`n${i}`, (i % 12) * 240, Math.floor(i / 12) * 200))
    const edges = nodes.flatMap((source, i) =>
      [
        ...(i % 12 < 11 ? [nodes[i + 1]!] : []),
        ...(i + 12 < nodes.length ? [nodes[i + 12]!] : []),
      ].map(target => ({
        ...edge(),
        id: EdgeId(`${source.id}-${target.id}`),
        source: source.id,
        target: target.id,
        labelBBox: null,
      }))
    )
    const input = { ...view(nodes), edges }, before = structuredClone(input)
    const result = reconcileEdgeRoutes(input)
    expect(result.edges).toHaveLength(218)
    const crossed: string[] = []
    for (const route of result.edges) {
      assertAttached(route.points[0], nodes.find(node => node.id === route.source)!)
      assertAttached(route.points.at(-1), nodes.find(node => node.id === route.target)!)
      const samples = []
      for (let i = 0; i + 3 < route.points.length; i += 3) {
        const a = route.points[i]!, b = route.points[i + 1]!, c = route.points[i + 2]!, d = route.points[i + 3]!
        samples.push(...new Bezier(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1]).getLUT(80))
      }
      for (const obstacle of nodes) {
        if (
          samples.some(p =>
            p.x > obstacle.x && p.x < obstacle.x + obstacle.width
            && p.y > obstacle.y && p.y < obstacle.y + obstacle.height
          )
        ) crossed.push(`${route.id}:${obstacle.id}`)
      }
    }
    expect(crossed).toEqual([])
    expect(result.nodes).toBe(input.nodes)
    expect(input).toEqual(before)
    expect(reconcileEdgeRoutes(result)).toBe(result)
  })
  it('uses a clear selectable route in the standard 24px creation gap', () => {
    const source = node('source', 0, 0), target = node('target', 124, 0)
    const result = reconcileEdgeRoute({ ...edge(), labelBBox: null }, [source, target])
    const length = result.points.slice(1).reduce(
      (sum, point, i) => sum + Math.hypot(point[0] - result.points[i]![0], point[1] - result.points[i]![1]),
      0,
    )
    expect(length).toBeGreaterThanOrEqual(64)
    expect(reconcileEdgeRoute(result, [source, target])).toBe(result)
    assertAvoids(result, source)
    assertAvoids(result, target)
  })

  it('reserves preserved midpoint routes when a repaired lane would otherwise duplicate them', () => {
    const source = node('source', 0, 0), target = node('target', 400, 0)
    const original = {
      ...edge(),
      id: EdgeId('a'),
      labelBBox: null,
      points: [[106, 40], [202, 40], [298, 40], [394, 40]] satisfies DiagramEdge['points'],
    }
    const second = {
      ...original,
      id: EdgeId('b'),
      points: [[106, 140], [202, 140], [298, 140], [394, 140]] satisfies DiagramEdge['points'],
    }
    const third = {
      ...original,
      id: EdgeId('c'),
      points: [[106, 240], [202, 240], [298, 240], [394, 240]] satisfies DiagramEdge['points'],
    }
    const layout = { ...view([source, target]), edges: [original, second, third] }
    const result = reconcileEdgeRoutes(layout)
    expect(result.edges[0]).toBe(original)
    expect(new Set(result.edges.map(edge => JSON.stringify(edge.points))).size).toBe(3)
    expect(new Set(result.edges.map(edge => JSON.stringify(edge.points[0]))).size).toBe(3)
    expect(reconcileEdgeRoutes(result)).toBe(result)
    expect(reconcileEdgeRoutes(layout)).toEqual(result)
  })
  it.each([24, 72])('gives a wide %ipx-high automatic label a nearby clear segment on a short connection', height => {
    const source = node('source', 0, 0), target = node('target', 124, 0)
    const original = { ...edge(), labelBBox: { x: 250, y: 850, width: 100, height } }
    const result = reconcileEdgeRoute(original, [source, target])
    const label = result.labelBBox!
    expect(result.points.length).toBeGreaterThan(4)
    const center = { x: label.x + label.width / 2, y: label.y + label.height / 2 }
    let distance = Infinity
    for (let i = 0; i + 3 < result.points.length; i += 3) {
      const a = result.points[i]!, b = result.points[i + 1]!, c = result.points[i + 2]!, d = result.points[i + 3]!
      const spline = new Bezier(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])
      distance = Math.min(distance, ...spline.getLUT(200).map(p => Math.hypot(p.x - center.x, p.y - center.y)))
    }
    expect(distance).toBeLessThanOrEqual(36)
    for (const box of [source, target]) {
      expect(
        label.x >= box.x + box.width + 14 || label.x + label.width <= box.x - 14
          || label.y >= box.y + box.height + 14 || label.y + label.height <= box.y - 14,
      ).toBe(true)
    }
    expect(reconcileEdgeRoute(result, [source, target])).toBe(result)
  })
  it('preserves safe wide Graphviz labels whose box stays beside the path', () => {
    const source = node('source', 150, 0), target = node('target', 150, 400)
    const original = {
      ...edge(),
      points: [[200, 86], [200, 188], [200, 292], [200, 394]] satisfies DiagramEdge['points'],
      labelBBox: { x: 201, y: 302, width: 87, height: 20 },
    }
    const layout = view([source, target], original)
    expect(original.labelBBox.x + original.labelBBox.width / 2 - original.points[0][0]).toBeGreaterThan(36)
    expect(reconcileEdgeRoutes(layout)).toBe(layout)
    expect(reconcileEdgeRoute(original, [source, target])).toBe(original)
  })
  it('repairs restored routes with tangential top-port arrows', () => {
    const source = { ...node('source', 0, 0), height: 100 }
    const target = { ...node('target', 300, 0), height: 100 }
    const original = {
      ...edge(),
      labelBBox: null,
      points: [[50, -6], [150, -6], [250, -6], [350, -6]] satisfies DiagramEdge['points'],
    }
    const result = reconcileEdgeRoute(original, [source, target])
    expect(result).not.toBe(original)
    expect(result.points).toEqual([[106, 50], [168.66666666666666, 50], [231.33333333333331, 50], [294, 50]])
    expect(reconcileEdgeRoute(result, [source, target])).toBe(result)
  })

  it('retains valid diagonal Graphviz endpoint directions', () => {
    const source = node('source', 0, 0), target = node('target', 400, 200)
    const original = {
      ...edge(),
      labelBBox: null,
      points: [[106, 40], [190, 80], [300, 190], [394, 240]] satisfies DiagramEdge['points'],
    }
    expect(reconcileEdgeRoute(original, [source, target])).toBe(original)
  })
  it('replaces tiny unlabeled diagonal paths with a selectable detour', () => {
    const source = node('source', 0, 0), target = node('target', 116, 90)
    const original = {
      ...edge(),
      labelBBox: null,
      points: [[104, 84], [106, 85], [110, 85], [112, 86]] satisfies DiagramEdge['points'],
    }
    const result = reconcileEdgeRoute(original, [source, target])
    expect(result).not.toBe(original)
    let length = 0
    for (let i = 0; i + 3 < result.points.length; i += 3) {
      const a = result.points[i]!, b = result.points[i + 1]!, c = result.points[i + 2]!, d = result.points[i + 3]!
      const spline = new Bezier(a[0], a[1], b[0], b[1], c[0], c[1], d[0], d[1])
      length += spline.length()
    }
    expect(length).toBeGreaterThanOrEqual(64)
    assertAttached(result.points[0], source)
    assertAttached(result.points.at(-1), target)
    assertAvoids(result, source)
    assertAvoids(result, target)
    expect(reconcileEdgeRoute(result, [source, target])).toBe(result)
  })
})
