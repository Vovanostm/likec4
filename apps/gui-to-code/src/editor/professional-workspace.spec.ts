import type { Fqn, ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import { describe, expect, it, vi } from 'vitest'
import type { CompileResult, EditorWorkspaceState, SourceFile } from './contracts'
import type { CanvasClipboard, PasteSubgraphPlan } from './professional-clipboard'
import type { ProfessionalSourceEditPort } from './professional-source-edits'
import { applyPasteSubgraph } from './professional-workspace'

const viewId = 'index' as ViewId
const documentUri = 'file:///workspace/model.c4'

function view(nodes: readonly string[]) {
  return {
    _stage: 'layouted',
    _type: 'element',
    id: viewId,
    hash: 'fixture',
    nodes: nodes.map((id, index) => ({
      id,
      x: index * 120,
      y: index * 80,
      width: 100,
      height: 60,
      children: [],
    })),
    edges: [],
    bounds: { x: 0, y: 0, width: Math.max(100, nodes.length * 120), height: Math.max(60, nodes.length * 80) },
    autoLayout: {},
  }
}

function compiled(elements: readonly string[], relations: readonly [string, string, string][] = []) {
  return {
    $data: {
      specification: { elements: { system: {} }, tags: {} },
      elements: Object.fromEntries(elements.map(id => [id, {
        id,
        kind: 'system',
        title: id === 'A2' ? 'A' : id === 'B2' ? 'B' : id,
        tags: [],
      }])),
      relations: Object.fromEntries(relations.map(([id, source, target]) => [id, {
        id,
        source: { model: source },
        target: { model: target },
      }])),
      views: { index: view(elements) },
      deployments: { elements: {}, relations: {} },
    },
  }
}

function stateFixture(): EditorWorkspaceState {
  const model = compiled(['A', 'B'], [['r1', 'A', 'B']])
  return {
    version: 2,
    projectId: 'fixture',
    revision: 3,
    committedSources: [{ uri: 'model.c4', content: 'before' }],
    draftSources: [{ uri: 'model.c4', content: 'before' }],
    manualLayouts: { [viewId]: view(['A', 'B']) as unknown as ViewManualLayoutSnapshot },
    compilation: { revision: 3, status: 'valid', diagnostics: [], model },
    lastValidModel: model,
    history: { past: [], future: [] },
  } as unknown as EditorWorkspaceState
}

const clipboard: CanvasClipboard = {
  version: 1,
  capturedRevision: 3,
  sourceViewId: viewId,
  elements: [
    { id: 'A' as Fqn, kind: 'system' as never, title: 'A', description: null, technology: null, tags: [], parentId: null, position: { x: 10, y: 20 } },
    { id: 'B' as Fqn, kind: 'system' as never, title: 'B', description: null, technology: null, tags: [], parentId: null, position: { x: 210, y: 120 } },
  ],
  relations: [{ id: 'r1' as never, sourceId: 'A' as Fqn, targetId: 'B' as Fqn }],
}

function sourceEdits(): ProfessionalSourceEditPort {
  return {
    async createSubgraph(_sources: readonly SourceFile[], _plan: PasteSubgraphPlan) {
      return [{ uri: 'model.c4', content: 'after' }]
    },
  }
}

function successCompiler(): (revision: number, sources: readonly SourceFile[]) => Promise<CompileResult> {
  return async revision => ({
    revision,
    diagnostics: [],
    model: compiled(['A', 'B', 'A2', 'B2'], [
      ['r1', 'A', 'B'],
      ['r2', 'A2', 'B2'],
    ]) as never,
  })
}

describe('professional workspace transaction', () => {
  it('commits the complete semantic and layout delta exactly once', async () => {
    const state = stateFixture()
    const commitCandidate = vi.fn()
    const result = await applyPasteSubgraph({
      state,
      sourceEdits: sourceEdits(),
      compileCandidate: successCompiler(),
      commitCandidate,
      isCurrent: () => true,
      currentRevision: () => state.revision,
    }, { clipboard, viewId, documentUri }, state.revision)

    expect(result).toMatchObject({
      status: 'applied',
      revision: 4,
      createdElementIds: ['A2', 'B2'],
    })
    expect(commitCandidate).toHaveBeenCalledTimes(1)
    const [revision, sources, , layouts] = commitCandidate.mock.calls[0]!
    expect(revision).toBe(4)
    expect(sources).toEqual([{ uri: 'model.c4', content: 'after' }])
    const layout = (layouts as Record<ViewId, ViewManualLayoutSnapshot>)[viewId]!
    expect(layout.nodes.find(node => node.id === 'A2')).toMatchObject({ x: 34, y: 44 })
    expect(layout.nodes.find(node => node.id === 'B2')).toMatchObject({ x: 234, y: 144 })
  })

  it('rejects stale expected revision before source planning or compilation', async () => {
    const state = stateFixture()
    const createSubgraph = vi.fn(sourceEdits().createSubgraph)
    const compileCandidate = vi.fn(successCompiler())
    const commitCandidate = vi.fn()
    const result = await applyPasteSubgraph({
      state,
      sourceEdits: { createSubgraph },
      compileCandidate,
      commitCandidate,
      isCurrent: () => true,
      currentRevision: () => state.revision,
    }, { clipboard, viewId, documentUri }, state.revision - 1)

    expect(result).toEqual({ status: 'conflict', revision: 3 })
    expect(createSubgraph).not.toHaveBeenCalled()
    expect(compileCandidate).not.toHaveBeenCalled()
    expect(commitCandidate).not.toHaveBeenCalled()
  })

  it('rolls back completely when the candidate does not compile', async () => {
    const state = stateFixture()
    const commitCandidate = vi.fn()
    const result = await applyPasteSubgraph({
      state,
      sourceEdits: sourceEdits(),
      compileCandidate: async revision => ({ revision, diagnostics: [{ message: 'invalid' }], model: null }),
      commitCandidate,
      isCurrent: () => true,
      currentRevision: () => state.revision,
    }, { clipboard, viewId, documentUri }, state.revision)

    expect(result).toMatchObject({ status: 'rejected', revision: 3, issues: [{ code: 'clipboard-compile-rejected' }] })
    expect(commitCandidate).not.toHaveBeenCalled()
  })

  it('rejects an unexpected semantic delta without committing', async () => {
    const state = stateFixture()
    const commitCandidate = vi.fn()
    const result = await applyPasteSubgraph({
      state,
      sourceEdits: sourceEdits(),
      compileCandidate: async revision => ({
        revision,
        diagnostics: [],
        model: compiled(['A', 'B', 'A2', 'B2', 'unexpected']) as never,
      }),
      commitCandidate,
      isCurrent: () => true,
      currentRevision: () => state.revision,
    }, { clipboard, viewId, documentUri }, state.revision)

    expect(result).toMatchObject({ status: 'rejected', issues: [{ code: 'clipboard-verification-failed' }] })
    expect(commitCandidate).not.toHaveBeenCalled()
  })
})
