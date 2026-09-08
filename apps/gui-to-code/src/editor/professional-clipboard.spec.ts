import type { ElementKind, Fqn, RelationId, ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import type { EditorWorkspaceState } from './contracts'
import {
  captureCanvasClipboard,
  planSubgraphPaste,
  refreshClipboardRevision,
} from './professional-clipboard'

const viewId = 'index' as ViewId

function stateFixture(): EditorWorkspaceState {
  const layout = {
    _stage: 'layouted',
    _type: 'element',
    id: viewId,
    hash: 'fixture',
    nodes: [
      { id: 'A', x: 10, y: 20, width: 100, height: 60, children: [] },
      { id: 'B', x: 210, y: 120, width: 100, height: 60, children: [] },
      { id: 'C', x: 410, y: 220, width: 100, height: 60, children: [] },
      { id: 'A.child', x: 12, y: 14, width: 60, height: 40, children: [] },
    ],
    edges: [],
    bounds: { x: 0, y: 0, width: 520, height: 300 },
    autoLayout: {},
  } as unknown as ViewManualLayoutSnapshot
  const model = {
    $data: {
      specification: { elements: { system: {}, component: {} }, tags: { ui: {} } },
      elements: {
        A: { id: 'A', kind: 'system', title: 'A', description: 'alpha', technology: 'TS', tags: ['ui'] },
        B: { id: 'B', kind: 'system', title: 'B', tags: [] },
        C: { id: 'C', kind: 'system', title: 'C', tags: [] },
        'A.child': { id: 'A.child', kind: 'component', title: 'Child', tags: [] },
      },
      relations: {
        r1: { id: 'r1', source: { model: 'A' }, target: { model: 'B' } },
        r2: { id: 'r2', source: { model: 'B' }, target: { model: 'C' } },
        r3: { id: 'r3', source: { model: 'A.child' }, target: { model: 'B' } },
      },
      views: { index: { id: viewId, _type: 'element' } },
      deployments: { elements: {}, relations: {} },
    },
  }
  return {
    version: 2,
    projectId: 'fixture',
    revision: 7,
    committedSources: [{ uri: 'model.c4', content: 'fixture' }],
    draftSources: [{ uri: 'model.c4', content: 'fixture' }],
    manualLayouts: { [viewId]: layout },
    compilation: { revision: 7, status: 'valid', diagnostics: [], model },
    lastValidModel: model,
    history: { past: [], future: [] },
  } as unknown as EditorWorkspaceState
}

describe('professional clipboard', () => {
  it('captures selected elements and only relations whose both endpoints are selected', () => {
    const state = stateFixture()
    const before = structuredClone(state.committedSources)
    const clipboard = captureCanvasClipboard(state, viewId, new Set(['A', 'B']))

    expect(clipboard?.elements.map(element => element.id)).toEqual(['A', 'B'])
    expect(clipboard?.relations).toEqual([{
      id: 'r1' as RelationId,
      sourceId: 'A' as Fqn,
      targetId: 'B' as Fqn,
    }])
    expect(state.revision).toBe(7)
    expect(state.history.past).toHaveLength(0)
    expect(state.committedSources).toEqual(before)
  })

  it('allocates deterministic fresh ids, remaps internal relations, metadata and visual offset', () => {
    const state = stateFixture()
    const clipboard = captureCanvasClipboard(state, viewId, new Set(['A', 'B']))!
    const plan = planSubgraphPaste(state, {
      clipboard,
      viewId,
      documentUri: 'file:///workspace/model.c4',
    })

    expect('code' in plan).toBe(false)
    if ('code' in plan) return
    expect(plan.elements.map(element => ({
      sourceId: element.sourceId,
      createdId: element.createdId,
      kind: element.kind,
      description: element.description,
      technology: element.technology,
      tags: element.tags,
      position: element.position,
    }))).toEqual([
      {
        sourceId: 'A',
        createdId: 'A2',
        kind: 'system' as ElementKind,
        description: 'alpha',
        technology: 'TS',
        tags: ['ui'],
        position: { x: 34, y: 44 },
      },
      {
        sourceId: 'B',
        createdId: 'B2',
        kind: 'system' as ElementKind,
        description: null,
        technology: null,
        tags: [],
        position: { x: 234, y: 144 },
      },
    ])
    expect(plan.relations).toEqual([{ sourceId: 'A2', targetId: 'B2' }])
  })

  it('remaps copied nesting without applying the root offset twice to child-local geometry', () => {
    const state = stateFixture()
    const clipboard = captureCanvasClipboard(state, viewId, new Set(['A', 'A.child']))!
    const plan = planSubgraphPaste(state, {
      clipboard,
      viewId,
      documentUri: 'file:///workspace/model.c4',
    })

    expect('code' in plan).toBe(false)
    if ('code' in plan) return
    expect(plan.elements.map(element => [element.createdId, element.parentId, element.position])).toEqual([
      ['A2', null, { x: 34, y: 44 }],
      ['A2.child', 'A2', { x: 12, y: 14 }],
    ])
  })

  it('rejects a stale clipboard and allows an explicitly refreshed revision for repeated paste planning', () => {
    const state = stateFixture()
    const clipboard = captureCanvasClipboard(state, viewId, new Set(['A']))!
    const staleState = { ...state, revision: 8 } as EditorWorkspaceState

    expect(planSubgraphPaste(staleState, {
      clipboard,
      viewId,
      documentUri: 'file:///workspace/model.c4',
    })).toMatchObject({ code: 'clipboard-stale' })

    expect(planSubgraphPaste(staleState, {
      clipboard: refreshClipboardRevision(clipboard, 8),
      viewId,
      documentUri: 'file:///workspace/model.c4',
    })).not.toHaveProperty('code')
  })

  it('fails closed when the explicit target document is missing', () => {
    const state = stateFixture()
    const clipboard = captureCanvasClipboard(state, viewId, new Set(['A']))!
    expect(planSubgraphPaste(state, { clipboard, viewId, documentUri: '' }))
      .toMatchObject({ code: 'clipboard-target-document-missing' })
  })
})
