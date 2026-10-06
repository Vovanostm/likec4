import { scalar } from '@likec4/core'
import type { EdgeChange, InternalNode, NodeChange } from '@xyflow/react'
import { type NodeLookup, type ParentLookup, adoptUserNodes } from '@xyflow/system'
import { describe, expect, it, vi } from 'vitest'
import { prepareFixtures } from '../editor/__tests__/fixture'
import { createLayoutConstraints } from './layout-constraints'
import type { Types } from './types'

function node(id: string, x: number, y: number, parentId?: string): Types.ElementNode {
  return {
    id,
    type: 'element',
    position: { x, y },
    ...(parentId === undefined ? {} : { parentId }),
    initialWidth: 120,
    initialHeight: 80,
    data: {
      id: scalar.NodeId(id),
      viewId: scalar.ViewId('test'),
      modelFqn: scalar.Fqn(id),
      title: id,
      technology: null,
      description: null,
      notes: undefined,
      icon: null,
      drifts: null,
      navigateTo: null,
      color: 'primary',
      shape: 'rectangle',
      width: 120,
      height: 80,
      x,
      y,
      level: 0,
      style: {},
      tags: [],
    },
  }
}

function store(nodes: Types.ElementNode[], edges: Types.AnyEdge[] = []) {
  const nodeLookup: NodeLookup<InternalNode<Types.AnyNode>> = new Map()
  const parentLookup: ParentLookup<InternalNode<Types.AnyNode>> = new Map()
  adoptUserNodes(nodes, nodeLookup, parentLookup)
  const triggerNodeChanges = vi.fn<(changes: NodeChange<Types.AnyNode>[]) => void>()
  const edgeLookup = new Map(edges.map(edge => [edge.id, edge]))
  const triggerEdgeChanges = vi.fn<(changes: EdgeChange<Types.AnyEdge>[]) => void>(changes => {
    for (const change of changes) if (change.type === 'replace') edgeLookup.set(change.id, change.item)
  })
  return {
    nodeLookup,
    edgeLookup,
    triggerEdgeChanges,
    triggerNodeChanges,
    api: {
      getState: () => ({
        nodeLookup,
        parentLookup,
        edges,
        edgeLookup,
        triggerNodeChanges,
        triggerEdgeChanges,
      }),
    },
  }
}

function relationship(): Types.RelationshipEdge {
  const prototype = prepareFixtures({}).layouted.edges[0]!
  return {
    id: 'relation',
    source: 'a',
    target: 'b',
    type: 'relationship',
    data: {
      ...prototype,
      technology: prototype.technology,
      drifts: prototype.drifts,
      navigateTo: prototype.navigateTo,
      head: prototype.head,
      tail: prototype.tail,
      astPath: prototype.astPath,
      id: scalar.EdgeId('relation'),
      dir: 'forward',
      notes: null,
      labelXY: null,
      controlPoints: null,
      points: [[126, 40], [190, 40], [300, 40], [394, 40]],
      labelBBox: { x: 240, y: 10, width: 70, height: 20 },
    },
  }
}

describe('renderer layout movement constraints', () => {
  it('accumulates repeated movement from one baseline without touching unselected nodes', () => {
    const state = store([node('a', 0, 0), node('b', 300, 0)])
    const constraints = createLayoutConstraints(state.api, ['a'])
    constraints.moveBy({ x: 5, y: 0 })
    constraints.moveBy({ x: 5, y: 0 })
    expect(constraints.rects.get('a')?.positionAbsolute).toEqual({ x: 10, y: 0 })
    expect(constraints.rects.get('b')?.positionAbsolute).toEqual({ x: 300, y: 0 })
    expect(constraints.hasChanges()).toBe(true)
    constraints.moveBy({ x: -10, y: 0 })
    expect(constraints.hasChanges()).toBe(false)
  })

  it('moves a selected parent once even if a descendant is also selected', () => {
    const state = store([node('parent', 0, 0), node('parent.child', 42, 60, 'parent')])
    const constraints = createLayoutConstraints(state.api, ['parent', 'parent.child'])
    constraints.moveBy({ x: 20, y: 10 })
    expect(constraints.rects.get('parent')?.positionAbsolute).toEqual({ x: 20, y: 10 })
    expect(constraints.rects.has('parent.child')).toBe(false)
    expect(state.triggerNodeChanges).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({ id: 'parent', type: 'position', position: { x: 20, y: 10 } }),
    ]))
  })

  it('adjusts parent bounds and relative child coordinates while preserving the unmoved sibling in world space', () => {
    const state = store([
      node('parent', 0, 0),
      node('parent.a', 42, 60, 'parent'),
      node('parent.b', 200, 60, 'parent'),
    ])
    const constraints = createLayoutConstraints(state.api, ['parent.a'])
    constraints.moveBy({ x: -20, y: -10 })
    expect(constraints.rects.get('parent')?.positionAbsolute).toEqual({ x: -20, y: -10 })
    expect(constraints.rects.get('parent.a')?.position).toEqual({ x: 42, y: 60 })
    expect(constraints.rects.get('parent.b')?.positionAbsolute).toEqual({ x: 200, y: 60 })
    expect(constraints.rects.get('parent.b')?.position).toEqual({ x: 220, y: 70 })
  })

  it('flushes the final native position before deciding whether a drag changed the layout', () => {
    const state = store([node('a', 0, 0)])
    const constraints = createLayoutConstraints(state.api, ['a'])
    const internal = state.nodeLookup.get('a')
    if (!internal) throw new Error('Fixture node is missing')
    internal.internals.positionAbsolute = { x: 10, y: 20 }
    expect(constraints.hasChanges()).toBe(false)
    constraints.flushPending()
    expect(constraints.hasChanges()).toBe(true)
    expect(constraints.rects.get('a')?.positionAbsolute).toEqual({ x: 10, y: 20 })
  })
  it('reroutes unrelated edges when native movement places an obstacle in their path', () => {
    const original = relationship()
    const state = store([node('a', 0, 0), node('b', 400, 0), node('c', 200, 200)], [original])
    const constraints = createLayoutConstraints(state.api, ['c'])
    constraints.moveBy({ x: 0, y: -200 })
    const route = state.edgeLookup.get('relation')!
    expect(route.data.points).not.toEqual(original.data.points)
    expect(route.data.controlPoints).toBeNull()
    for (let i = 0; i + 3 < route.data.points.length; i += 3) {
      const a = route.data.points[i]!, b = route.data.points[i + 3]!
      expect(
        (a[1] <= 0 && b[1] <= 0) || (a[1] >= 80 && b[1] >= 80)
          || (a[0] <= 200 && b[0] <= 200) || (a[0] >= 320 && b[0] >= 320),
      ).toBe(true)
    }
    expect(constraints.rects.get('a')?.positionAbsolute).toEqual({ x: 0, y: 0 })
    expect(constraints.rects.get('b')?.positionAbsolute).toEqual({ x: 400, y: 0 })
  })

  it('retains safe relative controls across cumulative native endpoint movement', () => {
    const customized = relationship()
    customized.data.controlPoints = [{ x: 200, y: -100 }, { x: 320, y: -80 }]
    const state = store([node('a', 0, 0), node('b', 400, 0)], [customized])
    const constraints = createLayoutConstraints(state.api, ['b'])
    constraints.moveBy({ x: 100, y: 160 })
    constraints.moveBy({ x: 100, y: 0 })
    const route = state.edgeLookup.get('relation')!
    expect(route.data.controlPoints).not.toBeNull()
    expect(route.data.controlPoints).not.toEqual(relationship().data.controlPoints)
    expect(constraints.rects.get('b')?.positionAbsolute).toEqual({ x: 600, y: 160 })
    const firstStep = state.triggerEdgeChanges.mock.calls[0]![0][0]!
    if (firstStep.type !== 'replace') throw new Error('Expected updated relationship')
    expect(route.data.controlPoints).not.toEqual(firstStep.item.data.controlPoints)
  })

  it('keeps automatic routes automatic and attaches to side midpoints after a diagonal move', () => {
    const original = relationship()
    original.data.labelBBox = null
    const state = store([node('a', 0, 0), node('b', 400, 0)], [original])
    const constraints = createLayoutConstraints(state.api, ['b'])
    constraints.moveBy({ x: 0, y: 160 })
    const route = state.edgeLookup.get('relation')!
    expect(route.data.controlPoints).toBeNull()
    expect(route.data.points[0]).toEqual([126, 40])
    expect(route.data.points.at(-1)).toEqual([394, 200])
  })
  it('preserves untouched fractional geometry while moving another node', () => {
    const retained = { ...node('retained', 123.375, 456.625), initialWidth: 120.5, initialHeight: 80.25 }
    const state = store([node('moving', 0.25, 0.75), retained])
    const constraints = createLayoutConstraints(state.api, ['moving'])
    expect(constraints.hasChanges()).toBe(false)
    expect(constraints.rects.get('retained')?.initial).toEqual({
      x: 123.375,
      y: 456.625,
      width: 120.5,
      height: 80.25,
    })
    constraints.moveBy({ x: 5, y: 10 })
    expect(constraints.rects.get('moving')?.positionAbsolute).toEqual({ x: 5.25, y: 10.75 })
    expect(constraints.rects.get('retained')?.positionAbsolute).toEqual({ x: 123.375, y: 456.625 })
    expect(constraints.rects.get('retained')?.dimensions).toEqual({ width: 120.5, height: 80.25 })
    expect(state.triggerNodeChanges).toHaveBeenLastCalledWith(expect.arrayContaining([
      expect.objectContaining({
        id: 'retained',
        type: 'position',
        position: { x: 123.375, y: 456.625 },
        positionAbsolute: { x: 123.375, y: 456.625 },
      }),
    ]))
  })
})
