import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { deriveLayerPresentation, isLayerEdgeHidden, layerAncestors, visibleLayerIds } from './layer-presentation'
import type { StructureNode } from './selection'

const parent = 'shop' as Fqn
const child = 'shop.api' as Fqn
const grandchild = 'shop.api.worker' as Fqn
const other = 'shopfront' as Fqn
const nodes: readonly StructureNode[] = [
  {
    id: parent,
    title: 'Магазин',
    children: [
      { id: child, title: 'API', children: [{ id: grandchild, title: 'Обработчик', children: [] }] },
    ],
  },
  { id: other, title: 'Витрина', children: [] },
]

describe('transient layer presentation', () => {
  it('inherits hiding and locking across the complete subtree without changing source sets or the tree', () => {
    const hidden = new Set([parent])
    const locked = new Set([child])
    const original = JSON.stringify(nodes)
    const effective = deriveLayerPresentation(nodes, hidden, locked)
    expect([...effective.hiddenIds]).toEqual([parent, child, grandchild])
    expect([...effective.lockedIds]).toEqual([child, grandchild])
    expect([...effective.inheritedHiddenIds]).toEqual([child, grandchild])
    expect([...effective.inheritedLockedIds]).toEqual([grandchild])
    expect([...hidden]).toEqual([parent])
    expect([...locked]).toEqual([child])
    expect(JSON.stringify(nodes)).toBe(original)
  })

  it('restores a parent while retaining the explicit child preference', () => {
    const both = deriveLayerPresentation(nodes, new Set([parent, grandchild]), new Set([parent, child]))
    expect(both.hiddenIds.has(child)).toBe(true)
    const restored = deriveLayerPresentation(nodes, new Set([grandchild]), new Set([child]))
    expect([...restored.hiddenIds]).toEqual([grandchild])
    expect([...restored.lockedIds]).toEqual([child, grandchild])
  })

  it('omits removed IDs and follows the current tree after a child is reparented', () => {
    const moved = [{ ...nodes[0]!, children: [] }, { ...nodes[1]!, children: nodes[0]!.children }]
    const effective = deriveLayerPresentation(moved, new Set([parent, 'deleted' as Fqn]), new Set([other]))
    expect([...effective.hiddenIds]).toEqual([parent])
    expect([...effective.lockedIds]).toEqual([other, child, grandchild])
  })

  it('hides incident edges in both directions while leaving unrelated edges visible', () => {
    const { hiddenIds } = deriveLayerPresentation(nodes, new Set([child]), new Set())
    expect(isLayerEdgeHidden(other, grandchild, hiddenIds)).toBe(true)
    expect(isLayerEdgeHidden(child, other, hiddenIds)).toBe(true)
    expect(isLayerEdgeHidden(parent, other, hiddenIds)).toBe(false)
  })

  it('resets presentation without removing any structure row', () => {
    const effective = deriveLayerPresentation(nodes, new Set(), new Set())
    expect(effective.hiddenIds.size).toBe(0)
    expect(effective.lockedIds.size).toBe(0)
    expect(visibleLayerIds(nodes, new Set())).toEqual([parent, child, grandchild, other])
  })

  it('collapses descendants and restores their original preorder independently of layer flags', () => {
    expect(visibleLayerIds(nodes, new Set([child]))).toEqual([parent, child, other])
    expect(visibleLayerIds(nodes, new Set([parent, child]))).toEqual([parent, other])
    expect(visibleLayerIds(nodes, new Set([child]))).toEqual([parent, child, other])
    expect(visibleLayerIds(nodes, new Set())).toEqual([parent, child, grandchild, other])
  })

  it('returns semantic ancestry and distinguishes roots from missing selections', () => {
    expect(layerAncestors(nodes, grandchild)).toEqual([parent, child])
    expect(layerAncestors(nodes, other)).toEqual([])
    expect(layerAncestors(nodes, 'missing' as Fqn)).toBeNull()
  })
})
