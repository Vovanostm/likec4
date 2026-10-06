import { describe, expect, it } from 'vitest'
import { type CreationPlacementNode, placeCreatedNode, placeNewlyVisibleNodes } from './creation-placement'

function node(id: string, x = 100, y = 100, parent: string | null = null): CreationPlacementNode {
  return {
    id,
    x,
    y,
    width: 160,
    height: 100,
    parent,
    children: [],
    labelBBox: { x: 10, y: 20, width: 140, height: 60 },
  }
}

function separated(a: CreationPlacementNode, b: CreationPlacementNode): boolean {
  return a.x + a.width + 24 <= b.x || b.x + b.width + 24 <= a.x
    || a.y + a.height + 24 <= b.y || b.y + b.height + 24 <= a.y
}

describe('newly visible nodes in manual views', () => {
  it('moves a newly visible external endpoint away from a retained compound and leaf', () => {
    const leaf = node('scope.leaf', 140, 160, 'scope')
    const scope = { ...node('scope', 98, 100), width: 244, height: 202, children: [leaf.id] }
    const external = node('external', 180, 150)
    const placed = placeNewlyVisibleNodes([scope, leaf, external], [scope, leaf])!
    expect(placed.slice(0, 2)).toEqual([scope, leaf])
    expect(separated(placed[0]!, placed[2]!)).toBe(true)
    expect(separated(placed[1]!, placed[2]!)).toBe(true)
  })
  it('translates an entirely new compound with its descendants, retaining internal geometry', () => {
    const existing = node('existing')
    const child = node('new.child', 142, 160, 'new')
    const compound = { ...node('new'), width: 244, height: 202, children: [child.id] }
    const placed = placeNewlyVisibleNodes([existing, compound, child], [existing])!
    expect(placed[0]).toEqual(existing)
    expect(separated(placed[0]!, placed[1]!)).toBe(true)
    expect(placed[2]!.x - placed[1]!.x).toBe(child.x - compound.x)
    expect(placed[2]!.y - placed[1]!.y).toBe(child.y - compound.y)
  })
})

function contained(parent: CreationPlacementNode, child: CreationPlacementNode): boolean {
  return child.x >= parent.x + 42 && child.y >= parent.y + 60
    && child.x + child.width <= parent.x + parent.width - 42
    && child.y + child.height <= parent.y + parent.height - 42
}

describe('collision-free creation placement', () => {
  it('retains a safe requested position and leaves input geometry untouched', () => {
    const nodes = [node('existing', 800, 900), node('created')]
    const before = structuredClone(nodes)
    const placed = placeCreatedNode(nodes, 'created', { x: 12.5, y: -45 })
    expect(placed?.[1]).toMatchObject({ x: 12.5, y: -45, labelBBox: { x: 10, y: 20 } })
    expect(placed?.[0]).toEqual(before[0])
    expect(nodes).toEqual(before)
    expect(placed).not.toBe(nodes)
  })

  it('places ten sibling creations at the same point deterministically without moving existing nodes', () => {
    let nodes: CreationPlacementNode[] = []
    for (let index = 0; index < 10; index++) {
      const before = structuredClone(nodes)
      const candidate = [...nodes, node(`n${index}`)]
      const first = placeCreatedNode(candidate, `n${index}`, { x: 100, y: 100 })
      const second = placeCreatedNode(candidate, `n${index}`, { x: 100, y: 100 })
      expect(first).not.toBeNull()
      expect(first).toEqual(second)
      nodes = first!
      expect(nodes.slice(0, -1)).toEqual(before)
      for (const a of nodes) {
        for (const b of nodes.filter(node => node !== a)) expect(separated(a, b)).toBe(true)
      }
    }
  })

  it('treats a sibling compound including its empty interior as an obstacle', () => {
    const compound = { ...node('other', 0, 0), width: 600, height: 400, children: ['other.child'] }
    const nodes = [compound, node('other.child', 50, 100, 'other'), node('created')]
    const placed = placeCreatedNode(nodes, 'created', { x: 300, y: 150 })
    expect(placed).not.toBeNull()
    expect(separated(placed![0]!, placed![2]!)).toBe(true)
    expect(placed?.slice(0, 2)).toEqual(nodes.slice(0, 2))
  })

  it('keeps node-local labels in their coordinate frame when placing far from the origin', () => {
    const existing = node('existing', 1000, 1000)
    const created = node('created', 800, 800)
    const placed = placeCreatedNode([existing, created], 'created', { x: 100, y: 100 })
    expect(placed).not.toBeNull()
    expect(placed?.[0]).toEqual(existing)
    expect(placed?.[1]).toMatchObject({ x: 100, y: 100, labelBBox: created.labelBBox })
    expect(separated(existing, placed![1]!)).toBe(true)
  })

  it('excludes ancestors from collisions and grows nested compounds without displacing siblings', () => {
    let nodes: CreationPlacementNode[] = [
      { ...node('root', 0, 0), width: 800, height: 650, children: ['inner'] },
      { ...node('inner', 42, 60, 'root'), width: 500, height: 420, children: ['existing'] },
      node('existing', 100, 150, 'inner'),
      { ...node('external', 1000, 0), width: 700, height: 800, children: ['external.child'] },
      node('external.child', 1100, 100, 'external'),
    ]
    for (let index = 0; index < 10; index++) {
      const id = `created${index}`
      const leaves = nodes.filter(n => !n.children.length)
      const inner = nodes[1]!
      nodes = nodes.map(n => n.id === inner.id ? { ...n, children: [...n.children, id] } : n)
      const before = structuredClone(nodes)
      const placed = placeCreatedNode([...nodes, node(id, 100, 150, 'inner')], id, { x: 100, y: 150 })
      expect(placed).not.toBeNull()
      nodes = placed!
      expect(nodes.filter(n => leaves.some(leaf => leaf.id === n.id))).toEqual(leaves)
      expect(nodes[3]).toEqual(before[3])
      expect(separated(nodes[0]!, nodes[3]!)).toBe(true)
      expect(contained(nodes[0]!, nodes[1]!)).toBe(true)
      const children = nodes.filter(n => n.parent === 'inner')
      for (const child of children) expect(contained(nodes[1]!, child)).toBe(true)
      for (const a of children) {
        for (const b of children.filter(node => node !== a)) expect(separated(a, b)).toBe(true)
      }
    }
  })

  it('does not turn an existing narrow compound gap into a new overlap during expansion', () => {
    const nodes = [
      { ...node('parent', 0, 0), width: 500, height: 400, children: ['existing', 'created'] },
      node('existing', 100, 150, 'parent'),
      { ...node('external', 510, 0), height: 400 },
      node('created', 400, 200, 'parent'),
    ]
    const placed = placeCreatedNode(nodes, 'created', { x: 400, y: 200 })
    expect(placed).not.toBeNull()
    expect(placed![0]!.x + placed![0]!.width).toBeLessThanOrEqual(nodes[2]!.x)
    expect(contained(placed![0]!, placed![3]!)).toBe(true)
    expect(placed?.[1]).toEqual(nodes[1])
    expect(placed?.[2]).toEqual(nodes[2])
  })

  it('fails closed for missing nodes, non-finite positions and cyclic containment', () => {
    expect(placeCreatedNode([node('a')], 'missing', { x: 0, y: 0 })).toBeNull()
    expect(placeCreatedNode([node('a')], 'a', { x: Infinity, y: 0 })).toBeNull()
    expect(placeCreatedNode([node('a', 0, 0, 'b'), node('b', 0, 0, 'a')], 'a', { x: 0, y: 0 })).toBeNull()
  })
})
