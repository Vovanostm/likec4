import type { ViewManualLayoutSnapshot } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { snapGridStep, transformSelectedNodes } from './professional-layout'

function snapshot(): ViewManualLayoutSnapshot {
  return {
    _stage: 'layouted',
    _type: 'element',
    id: 'index',
    hash: 'hash',
    autoLayout: { direction: 'TB' },
    bounds: { x: 0, y: 0, width: 500, height: 500 },
    nodes: [
      { id: 'a', parent: null, children: [], inEdges: [], outEdges: [], title: 'A', x: 10, y: 20, width: 40, height: 20 },
      { id: 'b', parent: null, children: [], inEdges: [], outEdges: [], title: 'B', x: 100, y: 80, width: 60, height: 30 },
      { id: 'c', parent: null, children: [], inEdges: [], outEdges: [], title: 'C', x: 240, y: 160, width: 50, height: 40 },
      { id: 'outside', parent: null, children: [], inEdges: [], outEdges: [], title: 'Outside', x: 400, y: 400, width: 50, height: 50 },
    ],
    edges: [],
  } as unknown as ViewManualLayoutSnapshot
}

const selected = new Set(['a', 'b', 'c'])

function node(result: ViewManualLayoutSnapshot, id: string) {
  return result.nodes.find(candidate => candidate.id === id)!
}

describe('professional multi-node layout', () => {
  it('aligns selected nodes while preserving unselected geometry', () => {
    const original = snapshot()
    const result = transformSelectedNodes(original, selected, 'align-left')

    expect(node(result, 'a').x).toBe(10)
    expect(node(result, 'b').x).toBe(10)
    expect(node(result, 'c').x).toBe(10)
    expect(node(result, 'outside')).toEqual(node(original, 'outside'))
    expect(original).not.toBe(result)
  })

  it('aligns centers using node dimensions', () => {
    const result = transformSelectedNodes(snapshot(), selected, 'align-center-horizontal')
    const centers = ['a', 'b', 'c'].map(id => node(result, id).x + node(result, id).width / 2)
    expect(new Set(centers).size).toBe(1)
  })

  it('distributes horizontally with equal gaps and stable outer bounds', () => {
    const result = transformSelectedNodes(snapshot(), selected, 'distribute-horizontal')
    const a = node(result, 'a')
    const b = node(result, 'b')
    const c = node(result, 'c')

    expect(a.x).toBe(10)
    expect(c.x + c.width).toBe(290)
    expect(b.x - (a.x + a.width)).toBeCloseTo(c.x - (b.x + b.width))
  })

  it('requires enough selected nodes and returns the original snapshot for a no-op', () => {
    const original = snapshot()
    expect(transformSelectedNodes(original, new Set(['a']), 'align-left')).toBe(original)
    expect(transformSelectedNodes(original, new Set(['a', 'b']), 'distribute-vertical')).toBe(original)
  })

  it('normalizes grid steps to safe presentation bounds', () => {
    expect(snapGridStep(Number.NaN)).toBe(16)
    expect(snapGridStep(1)).toBe(4)
    expect(snapGridStep(23.7)).toBe(24)
    expect(snapGridStep(500)).toBe(128)
  })
})
