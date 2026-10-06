import { LikeC4Model } from '@likec4/core/model'
import { Fqn } from '@likec4/core/types'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { compile } from '../compiler'
import type { CompileResult, CompilerPort, EditorDocumentPort } from './contracts'
import { historySteps } from './history'
import { snapshotFromLayout } from './layout-snapshots'
import { EditorWorkspace } from './workspace'

const sources = [
  { uri: 'specification.c4', content: 'specification { element component }' },
  { uri: 'model.c4', content: '// preserved\r\nmodel { api = component \'API\' db = component \'DB\' api -> db }' },
  { uri: 'views.c4', content: 'views { view index { include * } }' },
]

let fixture: LikeC4Model.Layouted
beforeAll(async () => {
  const result = await compile({ revision: 0, sources })
  if (!result.model) throw new Error('Expected compiled history fixture')
  fixture = result.model
})

// Isolate the history owner from repeated parser/layout work. Browser acceptance uses the real ports.
const historyCompiler: CompilerPort = async request => {
  const content = request.sources.find(source => source.uri === 'model.c4')?.content ?? ''
  const title = /api = component '([^']*)'/.exec(content)?.[1]
  const api = fixture.$data.elements[Fqn('api')]
  if (!title || !api) return { revision: request.revision, diagnostics: [{ message: 'Invalid source' }], model: null }
  return {
    revision: request.revision,
    diagnostics: [],
    model: LikeC4Model.create({
      ...fixture.$data,
      elements: { ...fixture.$data.elements, [api.id]: { ...api, title } },
    }),
  }
}

function unused(): never {
  throw new Error('Unexpected document command in history fixture')
}

const documents: EditorDocumentPort = {
  createElement: unused,
  createRelation: unused,
  createView: unused,
  createDynamicView: unused,
  createDynamicStep: unused,
  createDeploymentView: unused,
  createDeploymentNode: unused,
  createDeploymentInstance: unused,
  createDeploymentRelation: unused,
  moveElement: unused,
  renameElement: unused,
  inspectRemoveElement: unused,
  removeElement: unused,
  patchElement: async (current, input) =>
    current.map(source => ({
      ...source,
      content: source.content.replace(/api = component '[^']*'/, `api = component '${input.patch.title}'`),
    })),
}

async function patch(editor: EditorWorkspace, title: string) {
  const result = await editor.dispatch({
    id: editor.state.revision + 1,
    expectedRevision: editor.state.revision,
    semantic: { type: 'element.patch', input: { id: Fqn('api'), patch: { title } } },
  })
  expect(result.status).toBe('applied')
}

describe('command history navigation', () => {
  it('jumps across multiple states in one revision and preserves labels through Undo/Redo', async () => {
    const compiler = vi.fn<CompilerPort>(historyCompiler)
    const editor = await EditorWorkspace.create(sources, compiler, documents)
    await patch(editor, 'First')
    const first = editor.state.committedSources
    await patch(editor, 'Second')
    await editor.updateDraft(
      editor.state.committedSources.map(source =>
        source.uri === 'views.c4'
          ? { ...source, content: source.content.replace('include *', 'title \'Overview\' include *') }
          : source
      ),
    )
    const final = editor.state.committedSources
    const labels = historySteps(editor.state.history).map(step => step.action)
    expect(labels.map(action => action.type)).toEqual([
      'workspace.open',
      'element.patch',
      'element.patch',
      'source.edit',
    ])
    expect(labels.at(-1)?.label).toContain('views.c4')
    compiler.mockClear()
    const revision = editor.state.revision
    expect(await editor.goToHistory(0, revision)).toMatchObject({ status: 'applied', revision: revision + 1 })
    expect(compiler).toHaveBeenCalledTimes(1)
    expect(editor.state.committedSources).toEqual(sources)
    expect(editor.state.history.past).toHaveLength(0)
    expect(editor.state.history.future).toHaveLength(3)
    expect(historySteps(editor.state.history).map(step => step.action)).toEqual(labels)
    await editor.redo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(first)
    await editor.undo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(sources)
    await editor.goToHistory(3, editor.state.revision)
    expect(editor.state.committedSources).toEqual(final)
    expect(editor.state.history.future).toHaveLength(0)
    expect(historySteps(editor.state.history).map(step => step.action)).toEqual(labels)
  })

  it('branches at the selected state only after a successful new command', async () => {
    const editor = await EditorWorkspace.create(sources, historyCompiler, documents)
    await patch(editor, 'First')
    await patch(editor, 'Second')
    await patch(editor, 'Third')
    await editor.goToHistory(1, editor.state.revision)
    const before = editor.state
    expect(
      (await editor.dispatch({
        id: 20,
        expectedRevision: before.revision,
        semantic: { type: 'element.patch', input: { id: Fqn('missing'), patch: { title: 'Rejected' } } },
      })).status,
    ).toBe('rejected')
    expect(editor.state).toBe(before)
    await patch(editor, 'Branch')
    expect(editor.state.history.past).toHaveLength(2)
    expect(editor.state.history.future).toHaveLength(0)
    expect((await editor.redo(editor.state.revision)).status).toBe('rejected')
    await editor.undo(editor.state.revision)
    expect(editor.state.lastValidModel?.element('api').title).toBe('First')
    await editor.redo(editor.state.revision)
    expect(editor.state.lastValidModel?.element('api').title).toBe('Branch')
  })

  it('restores semantic sources and exact standard geometry together', async () => {
    const compiler = vi.fn<CompilerPort>(historyCompiler)
    const editor = await EditorWorkspace.create(sources, compiler, documents)
    const view = editor.state.lastValidModel!.view('index').$layouted
    const snapshot = snapshotFromLayout(view)
    snapshot.nodes[0]!.x += 80
    snapshot.nodes[0]!.y += 40
    expect(
      (await editor.dispatch({
        id: 1,
        expectedRevision: editor.state.revision,
        layout: { type: 'layout.save', input: { viewId: view.id, snapshot } },
      })).status,
    ).toBe('applied')
    const positioned = editor.state
    await patch(editor, 'Renamed')
    const renamed = editor.state
    await editor.goToHistory(0, editor.state.revision)
    expect(editor.state.manualLayouts).toEqual({})
    expect(editor.state.committedSources).toEqual(sources)
    await editor.goToHistory(2, editor.state.revision)
    expect(editor.state.manualLayouts).toEqual(renamed.manualLayouts)
    expect(editor.state.committedSources).toEqual(renamed.committedSources)
    await editor.goToHistory(1, editor.state.revision)
    expect(editor.state.manualLayouts).toEqual(positioned.manualLayouts)
    expect(editor.state.committedSources).toEqual(sources)
    compiler.mockClear()
    await editor.goToHistory(0, editor.state.revision)
    expect(compiler).not.toHaveBeenCalled()
    expect(editor.state.manualLayouts).toEqual({})
  })

  it('rejects invalid positions and stale requests and leaves current-state clicks unchanged', async () => {
    const editor = await EditorWorkspace.create(sources, historyCompiler, documents)
    await patch(editor, 'Changed')
    const before = editor.state
    for (const index of [-1, 2, 0.5, NaN, Infinity]) {
      expect((await editor.goToHistory(index, before.revision)).status).toBe('rejected')
      expect(editor.state).toBe(before)
    }
    expect((await editor.goToHistory(0, before.revision - 1)).status).toBe('conflict')
    expect((await editor.goToHistory(1, before.revision)).status).toBe('applied')
    expect(editor.state).toBe(before)
  })

  it('keeps sources, layout and history intact when target compilation fails or throws', async () => {
    let failure: 'none' | 'invalid' | 'throw' | 'stale' = 'none'
    const compiler: CompilerPort = async request => {
      if (failure === 'throw') throw new Error('Unavailable')
      if (failure === 'invalid') return { revision: request.revision, diagnostics: [], model: null }
      const result = await historyCompiler(request)
      return failure === 'stale' ? { ...result, revision: request.revision - 1 } : result
    }
    const editor = await EditorWorkspace.create(sources, compiler, documents)
    await patch(editor, 'Changed')
    const before = editor.state
    for (const mode of ['invalid', 'throw', 'stale'] as const) {
      failure = mode
      expect((await editor.goToHistory(0, before.revision)).status).toBe('rejected')
      expect(editor.state).toBe(before)
    }
  })

  it('ignores an in-flight history result after a newer source draft starts', async () => {
    const initial = await historyCompiler({ revision: 0, sources })
    let release: ((result: CompileResult) => void) | undefined
    let delay = false
    const compiler: CompilerPort = request =>
      delay
        ? new Promise(resolve => {
          release = resolve
        })
        : historyCompiler(request)
    const editor = await EditorWorkspace.create(sources, compiler, documents)
    await patch(editor, 'Changed')
    delay = true
    const pending = editor.goToHistory(0, editor.state.revision)
    await vi.waitFor(() => expect(release).toBeDefined())
    const releaseHistory = release!
    delay = false
    await editor.updateDraft(
      editor.state.committedSources.map(source =>
        source.uri === 'views.c4'
          ? { ...source, content: source.content.replace('include *', 'title \'New draft\' include *') }
          : source
      ),
    )
    const newest = editor.state
    releaseHistory({ ...initial, revision: 2 })
    expect((await pending).status).toBe('conflict')
    expect(editor.state).toBe(newest)
  })

  it('retains an invalid draft and its last valid history instead of navigating', async () => {
    const editor = await EditorWorkspace.create(sources, historyCompiler, documents)
    await patch(editor, 'Changed')
    await editor.updateDraft([{ uri: 'model.c4', content: 'invalid {' }])
    const before = editor.state
    expect((await editor.goToHistory(0, before.revision)).status).toBe('rejected')
    expect(editor.state).toBe(before)
  })
})
