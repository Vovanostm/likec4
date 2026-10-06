import type { ElementKind, Fqn, ViewId } from '@likec4/core/types'
import type { ChangeEvent } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import type { CommandResult } from './contracts'
import * as elementSource from './element-source'
import type { SourceLocation } from './source-documents'
import { useDurableWorkspace } from './use-durable-workspace'
import { useSemanticEditor } from './use-semantic-editor'
import { useWorkspaceRuntime } from './use-workspace-runtime'
import { EditorWorkspace } from './workspace'

const runtimeUi = vi.hoisted(() => ({ setters: [] as ReturnType<typeof vi.fn<(value: unknown) => void>>[] }))

// Exercise production callbacks without mounting a browser or invoking startup effects.
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: () => undefined,
  useCallback: <T>(callback: T) => callback,
  useRef: <T>(current: T) => ({ current }),
  useState: <T>(initial: T) => {
    const setter = vi.fn<(value: unknown) => void>()
    runtimeUi.setters.push(setter)
    return [initial, setter]
  },
}))
vi.mock('@likec4/diagram', async importOriginal => ({
  ...await importOriginal<typeof import('@likec4/diagram')>(),
  createLikeC4Editor: (callbacks: unknown) => callbacks,
  createCanvasIntentController: () => ({ cancel: () => {} }),
}))

afterEach(() => {
  runtimeUi.setters = []
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('runtime mutation boundary', () => {
  it('edits only the selected non-entry file, retains invalid drafts across navigation and restores exact history', async () => {
    const runtime = useWorkspaceRuntime()
    const sources = [
      { uri: 'specification.c4', content: 'specification { element service }' },
      { uri: 'landscape.c4', content: '// entry\r\nmodel { shop = service \'Shop\' }' },
      { uri: 'views/overview.c4', content: '// view\nviews { view overview { title \'Overview\' include * } }' },
    ]
    const editor = await EditorWorkspace.create(sources, compile, undefined, 'default', {}, 'landscape.c4')
    runtime.workspace.current = editor
    const before = editor.state
    expect(runtime.selectDocument('views/overview.c4')).toBe(true)
    expect(runtime.selectDocument('missing.c4')).toBe(false)
    expect(editor.state).toBe(before)
    runtime.updateDraftSource(sources[2]!.content.replace('Overview', 'New overview'))
    await vi.waitFor(() => expect(editor.state.compilation.status).toBe('valid'))
    const saved = editor.state
    expect(saved.entryDocumentUri).toBe('landscape.c4')
    expect(saved.committedSources.slice(0, 2)).toEqual(sources.slice(0, 2))
    expect(saved.committedSources[2]?.content).toContain('New overview')
    expect(saved.history.past).toHaveLength(1)
    await editor.undo(saved.revision)
    expect(editor.state.committedSources).toEqual(sources)
    await editor.redo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(saved.committedSources)
    runtime.selectDocument('landscape.c4')
    runtime.updateDraftSource('model { broken !!! }')
    await vi.waitFor(() => expect(editor.state.compilation.status).toBe('invalid'))
    const lastValid = editor.state.lastValidModel
    runtime.selectDocument('views/overview.c4')
    runtime.updateDraftSource(sources[2]!.content.replace('Overview', 'Draft overview'))
    await vi.waitFor(() => expect(editor.state.compilation.status).toBe('invalid'))
    expect(editor.state.draftSources[1]?.content).toBe('model { broken !!! }')
    expect(editor.state.draftSources[2]?.content).toContain('Draft overview')
    expect(editor.state.lastValidModel).toBe(lastValid)
    expect(editor.state.committedSources).toEqual(saved.committedSources)
    runtime.selectDocument('landscape.c4')
    runtime.updateDraftSource(sources[1]!.content)
    await vi.waitFor(() => expect(editor.state.compilation.status).toBe('valid'))
    expect(editor.state.committedSources[2]?.content).toContain('Draft overview')
    expect(editor.state.entryDocumentUri).toBe('landscape.c4')
  })

  it.each(['replacement', 'draft', 'navigation', 'selection'] as const)(
    'ignores a pending source lookup after %s changes',
    async change => {
      const runtime = useWorkspaceRuntime()
      const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
      runtime.workspace.current = editor
      let finish!: (location: SourceLocation | null) => void
      vi.spyOn(elementSource, 'locateElementSource').mockImplementationOnce(() =>
        new Promise(resolve => {
          finish = resolve
        })
      )
      let selected = true
      const pending = runtime.openElementSource('shop.web' as Fqn, () => selected)
      switch (change) {
        case 'replacement':
          runtime.workspace.current = await EditorWorkspace.create(
            [{ uri: 'model.c4', content: starterSource }],
            compile,
          )
          break
        case 'draft':
          await editor.updateDraft([{ uri: 'model.c4', content: `${starterSource}\n// next revision` }])
          break
        case 'navigation':
          runtime.selectDocument('model.c4')
          break
        case 'selection':
          selected = false
          break
      }
      for (const setter of runtimeUi.setters) setter.mockClear()
      finish({ uri: 'model.c4', range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } } })
      expect(await pending).toBe(false)
      for (const setter of runtimeUi.setters) expect(setter).not.toHaveBeenCalled()
    },
  )

  it('creates a child through the semantic owner without an intermediate view and undoes it atomically', async () => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    runtime.workspace.current = editor
    const before = editor.state.committedSources
    const semantic = useSemanticEditor(runtime)
    const child = await semantic.createChildElement('shop.web' as Fqn, 'component' as ElementKind)
    expect(child).toBe('shop.web.component')
    expect(editor.state.lastValidModel?.$data.elements[child!]?.title).toBe('Новый элемент')
    expect(editor.state.history.past).toHaveLength(1)
    await editor.undo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(before)
    await editor.redo(editor.state.revision)
    expect(editor.state.lastValidModel?.$data.elements[child!]?.title).toBe('Новый элемент')
    const confirmed = editor.state
    const missingParent = await editor.dispatch({
      id: confirmed.revision + 1,
      expectedRevision: confirmed.revision,
      semantic: { type: 'element.create', input: { kind: 'component' as ElementKind, parentId: 'missing' as Fqn } },
    })
    expect(missingParent).toMatchObject({ status: 'rejected', issues: [{ code: 'element-not-found' }] })
    expect(editor.state).toBe(confirmed)
    expect(await semantic.createChildElement('shop.web' as Fqn, 'component' as ElementKind))
      .toBe('shop.web.component2')
    await editor.undo(editor.state.revision)
    expect(editor.state.committedSources).toEqual(confirmed.committedSources)
  })
  it.each(['applied', 'rejected', 'throw'] as const)(
    'does not publish %s view completion after same-revision workspace replacement',
    async outcome => {
      const runtime = useWorkspaceRuntime()
      const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
      const replacement = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
      runtime.workspace.current = editor
      let finish!: (result: CommandResult) => void
      let fail!: (reason: Error) => void
      vi.spyOn(editor, 'dispatch').mockImplementationOnce(() =>
        new Promise<CommandResult>((resolve, reject) => {
          finish = resolve
          fail = reject
        })
      )
      const pending = runtime.createView('shop' as Fqn, '', 'Старый вид')
      runtime.workspace.current = replacement
      runtime.selectView('index' as ViewId)
      runtime.setCommandError('Ошибка новой версии')
      runtime.setFeedback('Новая версия загружена')
      for (const setter of runtimeUi.setters) setter.mockClear()
      if (outcome === 'throw') fail(new Error('Old command failed'))
      else {finish(
          outcome === 'applied'
            ? { status: 'applied', command: 'view.create', revision: 1, createdViewId: 'view1' as ViewId }
            : { status: 'rejected', revision: 0, issues: [{ code: 'compile-rejected', message: 'Старая ошибка' }] },
        )}
      expect(await pending).toBe(false)
      // State, active view, layout mode, error and feedback belong to the replacement.
      for (const index of [0, 2, 3, 6, 7]) expect(runtimeUi.setters[index]).not.toHaveBeenCalled()
      expect(replacement.state.revision).toBe(0)
      expect(runtime.assertMutationAvailable()).toBe(true)
    },
  )

  it('starts the first diagram via the real semantic/runtime command boundary with one history entry', async () => {
    const runtime = useWorkspaceRuntime()
    const source = '// User source\nspecification { element service }\nmodel {}\nviews {}'
    const editor = await EditorWorkspace.create(
      [{ uri: 'empty.c4', content: source }],
      compile,
      undefined,
      'default',
      {},
      'empty.c4',
    )
    runtime.workspace.current = editor
    const select = vi.spyOn(runtime, 'selectView')
    const semantic = useSemanticEditor(runtime)
    const created = await semantic.createFirstDiagram('service' as ElementKind)
    if (!created) throw new Error('Expected initial diagram')
    expect(created.workspace).toBe(editor)
    expect(created.revision).toBe(1)
    expect(editor.state.lastValidModel?.$data.elements[created.id]?.title).toBe('Новый элемент')
    expect(editor.state.history.past).toHaveLength(1)
    expect(select).toHaveBeenCalledOnce()
    expect(select).toHaveBeenCalledWith(created.viewId)
    expect(editor.state.lastValidModel?.$data.views[created.viewId]?.nodes.some(node => node.modelRef === created.id))
      .toBe(true)
    await editor.undo(1)
    expect(editor.state.committedSources).toEqual([{ uri: 'empty.c4', content: source }])
  })

  it('generates a view ID when the user submits only a display title', async () => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create(
      [{ uri: 'imported.c4', content: starterSource }],
      compile,
      undefined,
      'default',
      {},
      'imported.c4',
    )
    runtime.workspace.current = editor
    expect(await runtime.createView('shop' as Fqn, '', 'Магазин')).toBe(true)
    const created = Object.values(editor.state.lastValidModel?.$data.views ?? {})
      .find(view => view.title === 'Магазин')
    expect(created?.id).toBeTruthy()
    expect(created?._type).toBe('element')
    expect(editor.state.committedSources[0]?.content).toContain('title \'Магазин\'')
    expect(editor.state.history.past).toHaveLength(1)
  })

  it('does not select or open a bootstrap result from a replaced workspace', async () => {
    const source = 'specification { element service }\nmodel {}\nviews {}'
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const started = new Promise<void>(resolve => {
      entered = resolve
    })
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: source }], async request => {
      if (request.revision === 1) {
        entered()
        await gate
      }
      return compile(request)
    })
    const replacement = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    const runtime = useWorkspaceRuntime()
    runtime.workspace.current = editor
    const select = vi.spyOn(runtime, 'selectView')
    const semantic = useSemanticEditor(runtime)
    const pending = semantic.createFirstDiagram('service' as ElementKind)
    await started
    runtime.workspace.current = replacement
    release()
    expect(await pending).toBeNull()
    expect(select).not.toHaveBeenCalled()
    expect(editor.state.revision).toBe(1)
    expect(replacement.state.revision).toBe(0)
  })

  it('retained renderer save/reset callbacks see later read-only and busy changes', async () => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    runtime.workspace.current = editor
    const before = editor.state
    const dispatch = vi.spyOn(editor, 'dispatch')
    const view = editor.state.lastValidModel?.$data.views['index']
    if (!view) throw new Error('Expected initial view')
    runtime.setReadOnly(true)
    await runtime.editor.handleChange('index' as ViewId, { op: 'reset-manual-layout' })
    await expect(runtime.editor.handleChange('index' as ViewId, { op: 'save-view-snapshot', layout: view })).rejects
      .toThrow('Не удалось сохранить ручную раскладку.')
    runtime.setReadOnly(false)
    runtime.setBusy(true)
    await runtime.editor.handleChange('index' as ViewId, { op: 'reset-manual-layout' })
    await expect(runtime.editor.handleChange('index' as ViewId, { op: 'save-view-snapshot', layout: view })).rejects
      .toThrow('Не удалось сохранить ручную раскладку.')
    expect(dispatch).not.toHaveBeenCalled()
    expect(editor.state).toBe(before)
  })
  it('old captured callbacks consult the current read-only flag, keeping exportable local state', async () => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    runtime.workspace.current = editor
    const before = editor.state
    const captured = runtime.dispatchSemantic
    runtime.setReadOnly(true)
    expect(await captured({ type: 'element.create', input: { kind: 'component' as ElementKind } }, 'Ошибка')).toBeNull()
    runtime.updateDraftSource('invalid')
    expect(editor.state).toBe(before)
    expect(await runtime.undo()).toBeNull()
    expect(await runtime.goToHistory(0, before.revision)).toBeNull()
    runtime.setReadOnly(false)
    expect((await captured({ type: 'element.create', input: { kind: 'component' as ElementKind } }, 'Ошибка'))?.status)
      .toBe('applied')
  })

  it('rejects a second synchronous submission and clears busy after a failed operation', async () => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    runtime.workspace.current = editor
    const action = { type: 'element.create', input: { kind: 'component' as ElementKind } } as const
    const first = runtime.dispatchSemantic(action, 'Ошибка')
    expect(await runtime.dispatchSemantic(action, 'Ошибка')).toBeNull()
    expect(await runtime.goToHistory(0, editor.state.revision)).toBeNull()
    expect((await first)?.status).toBe('applied')
    expect(
      (await runtime.dispatchSemantic({ type: 'element.create', input: { kind: 'unknown' as ElementKind } }, 'Ошибка'))
        ?.status,
    )
      .toBe('rejected')
    expect(runtime.assertMutationAvailable()).toBe(true)
  })

  it('history navigation ignores completion from a replaced workspace', async () => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    runtime.workspace.current = editor
    let finish!: (result: CommandResult) => void
    vi.spyOn(editor, 'goToHistory').mockImplementationOnce(() =>
      new Promise(resolve => {
        finish = resolve
      })
    )
    const pending = runtime.goToHistory(0, 0)
    runtime.workspace.current = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    for (const setter of runtimeUi.setters) setter.mockClear()
    finish({ status: 'applied', command: 'history.goto', revision: 1 })
    expect(await pending).toBeNull()
    for (const index of [0, 2, 3, 6, 7]) expect(runtimeUi.setters[index]).not.toHaveBeenCalled()
    expect(runtime.assertMutationAvailable()).toBe(true)
  })

  it.each(['operation', 'replacement'] as const)('only unlocks after both owners settle (%s first)', async first => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    runtime.workspace.current = editor
    runtime.setBusy(true)
    runtime.setReplacementBusy(true)
    if (first === 'operation') runtime.setBusy(false)
    else runtime.setReplacementBusy(false)
    expect(runtime.assertMutationAvailable()).toBe(false)
    runtime.updateDraftSource('must not overwrite the retained workspace')
    expect(editor.state.draftSources).toEqual(editor.state.committedSources)
    if (first === 'operation') runtime.setReplacementBusy(false)
    else runtime.setBusy(false)
    expect(runtime.assertMutationAvailable()).toBe(true)
  })

  it('command cleanup cannot unlock an accepted import using the real runtime and durable hooks', async () => {
    const runtime = useWorkspaceRuntime()
    const editor = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
    runtime.workspace.current = editor
    const before = editor.state
    let finishCommand: (result: CommandResult) => void = () => {}
    const dispatch = vi.spyOn(editor, 'dispatch').mockImplementationOnce(() =>
      new Promise<CommandResult>(resolve => {
        finishCommand = resolve
      })
    )
    const action = { type: 'element.create', input: { kind: 'component' as ElementKind } } as const
    const command = runtime.dispatchSemantic(action, 'Ошибка')

    let finishImport: (candidate: EditorWorkspace) => void = () => {}
    let signalCandidateStarted: () => void = () => {}
    const candidateStarted = new Promise<void>(resolve => {
      signalCandidateStarted = resolve
    })
    vi.spyOn(EditorWorkspace, 'create').mockImplementationOnce(() =>
      new Promise<EditorWorkspace>(resolve => {
        finishImport = resolve
        signalCandidateStarted()
      })
    )
    vi.stubGlobal('window', { confirm: () => true })
    // Startup effects are disabled in this Node probe; no browser or user's storage is accessed.
    const durable = useDurableWorkspace(runtime)
    const importing = durable.importSource({
      currentTarget: { files: [{ size: 9, text: async () => 'candidate' }], value: 'import.c4' },
    } as unknown as ChangeEvent<HTMLInputElement>)
    await candidateStarted
    finishCommand({ status: 'rejected', revision: 0, issues: [] })
    await command
    expect(runtime.assertMutationAvailable()).toBe(false)
    expect(await runtime.dispatchSemantic(action, 'Ошибка')).toBeNull()
    expect(await runtime.undo()).toBeNull()
    runtime.updateDraftSource('must stay blocked while importing')
    expect(editor.state).toBe(before)
    expect(dispatch).toHaveBeenCalledTimes(1)

    // The unhydrated probe rejects persistence safely, then releases only the replacement lock.
    finishImport(editor)
    await importing
    expect(runtime.workspace.current).toBe(editor)
    expect(runtime.assertMutationAvailable()).toBe(true)
  })
})
