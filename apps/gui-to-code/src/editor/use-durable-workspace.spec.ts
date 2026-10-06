import type { ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import type { ChangeEvent } from 'react'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import type { EditorWorkspaceState } from './contracts'
import * as downloads from './file-downloads'
import { IndexedDbWorkspacePersistence } from './indexeddb-workspace'
import { envelopeFromState } from './persisted-workspace'
import {
  deriveDraftStatus,
  enqueueVersionedTask,
  shouldConfirmReplacement,
  shouldPersistRevision,
  useDurableWorkspace,
} from './use-durable-workspace'
import { EditorWorkspace } from './workspace'
import { exportWorkspaceBundle, importWorkspaceBundle } from './workspace-bundle'

// Node-only lifecycle harness: run the production hook's effects without a DOM/browser dependency.
const hooks = vi.hoisted(() => ({
  slots: [] as unknown[],
  cursor: 0,
  effects: [] as (() => void | (() => void))[],
  dependencies: new Map<number, readonly unknown[]>(),
}))
vi.mock('react', () => ({
  useRef: (initial: unknown) => {
    const slot = hooks.cursor++
    return hooks.slots[slot] ??= { current: initial }
  },
  useState: (initial: unknown) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: unknown) => {
      hooks.slots[slot] = value
    }]
  },
  useEffect: (effect: () => void | (() => void), dependencies: readonly unknown[]) => {
    const slot = hooks.cursor++
    const previous = hooks.dependencies.get(slot)
    if (!previous || previous.some((value, index) => !Object.is(value, dependencies[index]))) {
      hooks.dependencies.set(slot, dependencies)
      hooks.effects.push(effect)
    }
  },
}))

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  hooks.slots = []
  hooks.cursor = 0
  hooks.effects = []
  hooks.dependencies.clear()
})

function runtimeHarness() {
  let operationBusy = false
  let replacementBusy = false
  const setBusy = vi.fn<(value: boolean) => void>()
  const runtime = {
    workspace: { current: null as EditorWorkspace | null },
    state: state(),
    activeDocumentUri: undefined as string | undefined,
    refresh: () => runtime.state = runtime.workspace.current?.state ?? runtime.state,
    // Keep existing assertions on the derived UI flag, with independent operation/replacement owners.
    setBusy,
    setOperationBusy: vi.fn<(value: boolean) => void>(value => {
      operationBusy = value
      setBusy(operationBusy || replacementBusy)
    }),
    setReplacementBusy: vi.fn<(value: boolean) => void>(value => {
      replacementBusy = value
      setBusy(operationBusy || replacementBusy)
    }),
    setReadOnly: vi.fn<(value: boolean) => void>(),
    setCommandError: vi.fn<(value: string | null) => void>(),
    setFeedback: vi.fn<(value: string | null) => void>(),
  }
  const render = () => {
    hooks.cursor = 0
    const output = useDurableWorkspace(runtime)
    const effects = hooks.effects.splice(0)
    for (const effect of effects) effect()
    return output
  }
  return { runtime, render }
}

function state(): EditorWorkspaceState {
  return {
    version: 2,
    projectId: 'default',
    entryDocumentUri: 'model.c4',
    revision: 1,
    committedSources: [{ uri: 'model.c4', content: 'saved bytes' }],
    draftSources: [{ uri: 'model.c4', content: 'saved bytes' }],
    manualLayouts: {},
    compilation: { revision: 1, status: 'valid', diagnostics: [], model: null },
    lastValidModel: null,
    history: { past: [], future: [], current: { type: 'workspace.open', label: 'Начальное состояние' } },
  }
}

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve!: () => void
  const promise = new Promise<void>(done => {
    resolve = done
  })
  return { promise, resolve }
}

function sourceImport(content: string): ChangeEvent<HTMLInputElement> {
  return sourceReadImport(async () => content, content.length)
}

function sourceReadImport(text: () => Promise<string>, size = 1): ChangeEvent<HTMLInputElement> {
  return {
    currentTarget: { files: [{ size, text }], value: 'import.c4' },
  } as unknown as ChangeEvent<HTMLInputElement>
}

function bundleReadImport(arrayBuffer: () => Promise<ArrayBuffer>): ChangeEvent<HTMLInputElement> {
  return {
    currentTarget: { files: [{ size: 1, arrayBuffer }], value: 'import.zip' },
  } as unknown as ChangeEvent<HTMLInputElement>
}

async function replacementHarness() {
  const candidates = await Promise.all(['local', 'older', 'newer', 'invalid'].map(async content => {
    const candidate = await EditorWorkspace.create([{ uri: 'model.c4', content }], async request => ({
      revision: request.revision,
      model: null,
      diagnostics: [],
    }))
    const sources = [{ uri: 'model.c4', content }]
    vi.spyOn(candidate, 'state', 'get').mockReturnValue({
      ...state(),
      revision: 0,
      committedSources: sources,
      draftSources: sources,
      compilation: { ...state().compilation, status: content === 'invalid' ? 'invalid' : 'valid' },
    })
    return candidate
  }))
  const [local, older, newer, invalid] = candidates
  if (!local || !older || !newer || !invalid) throw new Error('Missing replacement fixtures')
  const create = vi.spyOn(EditorWorkspace, 'create').mockImplementation(async sources => {
    switch (sources[0]?.content) {
      case 'older':
        return older
      case 'newer':
        return newer
      case 'invalid':
        return invalid
      default:
        throw new Error('Unexpected replacement fixture')
    }
  })
  const load = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
    status: 'empty',
    token: 'empty',
  })
  const replace = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockImplementation(async envelope => ({
    status: 'saved',
    revision: envelope.revision,
    token: `v${envelope.revision}`,
  }))
  const confirm = vi.fn<() => boolean>(() => true)
  vi.stubGlobal('window', { confirm })
  const { runtime, render } = runtimeHarness()
  runtime.workspace.current = local
  vi.spyOn(local, 'state', 'get').mockImplementation(() => runtime.state)
  render()
  await vi.waitFor(() => expect(render().status).toBe('saved'))
  return { runtime, render, local, older, newer, invalid, create, load, replace, confirm }
}

let conflictState: EditorWorkspaceState

beforeAll(async () => {
  const layout: ViewManualLayoutSnapshot = {
    id: 'index' as ViewId,
    _stage: 'layouted',
    _type: 'element',
    title: null,
    description: null,
    hash: 'local-layout',
    nodes: [],
    edges: [],
    bounds: { x: 10, y: 20, width: 100, height: 80 },
    autoLayout: { direction: 'TB' },
  }
  const local = await EditorWorkspace.create(
    [
      { uri: 'z-entry.c4', content: starterSource },
      { uri: 'a-extra.c4', content: '// keep exact auxiliary bytes\r\nmodel { extra = system }\r\n' },
    ],
    compile,
    undefined,
    'default',
    { [layout.id]: layout },
    'z-entry.c4',
  )
  await local.updateDraft(local.state.committedSources.map(source => ({
    ...source,
    content: `${source.content}\n// local committed edit`,
  })))
  if (!local.state.lastValidModel || local.state.history.past.length !== 1) {
    throw new Error('Multifile fixture must have a validated committed revision and history')
  }
  conflictState = local.state
})

async function conflictHarness() {
  // The real compiler validates this exact fixture once; hook cases reuse its immutable committed model.
  const local = await EditorWorkspace.create(
    conflictState.committedSources,
    async request => ({ revision: request.revision, model: conflictState.lastValidModel, diagnostics: [] }),
    undefined,
    conflictState.projectId,
    conflictState.manualLayouts,
    conflictState.entryDocumentUri,
    conflictState.revision,
  )
  const load = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
    status: 'empty',
    token: 'empty',
  })
  vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockResolvedValue({
    status: 'saved',
    revision: 1,
    token: 'v1',
  })
  const save = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'save').mockResolvedValue({
    status: 'conflict',
    durableRevision: 9,
  })
  const { runtime, render } = runtimeHarness()
  runtime.workspace.current = local
  runtime.state = conflictState
  vi.spyOn(local, 'state', 'get').mockImplementation(() => runtime.state)
  render()
  await vi.waitFor(() => expect(render().status).toBe('saved'))
  runtime.state = { ...runtime.state, revision: 2 }
  render()
  await vi.waitFor(() => expect(render().status).toBe('conflict'))
  runtime.state = {
    ...runtime.state,
    draftSources: runtime.state.committedSources.map(source =>
      source.uri === 'z-entry.c4'
        ? { ...source, content: 'model { broken =\r\n// exact unsaved draft' }
        : source
    ),
    compilation: { ...runtime.state.compilation, status: 'invalid', model: null },
  }
  render()
  return { runtime, render, local, load, save }
}

describe('durable workspace save coordination', () => {
  it.each([false, true])(
    'replacement busy remains independent when operation busy ends before import (%s)',
    async endsFirst => {
      const { runtime, render, replace } = await replacementHarness()
      const blocked = deferred()
      replace.mockImplementation(async envelope => {
        await blocked.promise
        return { status: 'saved', revision: envelope.revision, token: 'replacement-committed' }
      })
      runtime.setOperationBusy(true)
      const importing = render().importSource(sourceImport('older'))
      await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(2))
      expect(runtime.setReplacementBusy).toHaveBeenLastCalledWith(true)
      runtime.setOperationBusy(!endsFirst)
      expect(runtime.setBusy).toHaveBeenLastCalledWith(true)
      blocked.resolve()
      await importing
      expect(runtime.setReplacementBusy).toHaveBeenLastCalledWith(false)
      expect(runtime.setBusy).toHaveBeenLastCalledWith(!endsFirst)
      runtime.setOperationBusy(false)
      expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
    },
  )

  it('holds busy after a newer invalid import until an older durable write installs its committed candidate', async () => {
    const { runtime, render, local, older, replace } = await replacementHarness()
    const blocked = deferred()
    replace.mockImplementation(async envelope => {
      await blocked.promise
      return { status: 'saved', revision: envelope.revision, token: 'older-committed' }
    })
    const importing = render().importSource(sourceImport('older'))
    await vi.waitFor(() => expect(replace).toHaveBeenCalledTimes(2))
    const busyCalls = runtime.setBusy.mock.calls.length
    await render().importSource(sourceImport('invalid'))
    expect(runtime.workspace.current).toBe(local)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(true)
    expect(runtime.setBusy.mock.calls.slice(busyCalls)).not.toContainEqual([false])
    expect(runtime.setCommandError).toHaveBeenLastCalledWith(expect.stringContaining('Импорт отклонён'))
    blocked.resolve()
    await importing
    expect(runtime.workspace.current).toBe(older)
    expect(runtime.state.committedSources).toEqual([{ uri: 'model.c4', content: 'older' }])
    expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
    expect(render().draftStatus).toBe('saved')
  })

  it.each(['c4', 'zip'] as const)('a deferred %s read cannot replace a newer confirmed import', async format => {
    const { runtime, render, newer, create, replace } = await replacementHarness()
    const blocked = deferred()
    const bytes = await exportWorkspaceBundle(envelopeFromState({
      ...state(),
      committedSources: [{ uri: 'model.c4', content: 'older' }],
    })).arrayBuffer()
    const importing = format === 'c4'
      ? render().importSource(sourceReadImport(async () => {
        await blocked.promise
        return 'older'
      }))
      : render().importBundle(bundleReadImport(async () => {
        await blocked.promise
        return bytes
      }))
    await render().importSource(sourceImport('newer'))
    expect(runtime.workspace.current).toBe(newer)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(true)
    const errorCalls = runtime.setCommandError.mock.calls.length
    blocked.resolve()
    await importing
    expect(runtime.workspace.current).toBe(newer)
    expect(create).toHaveBeenCalledOnce()
    expect(replace).toHaveBeenCalledTimes(2)
    expect(runtime.setCommandError.mock.calls).toHaveLength(errorCalls)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
  })

  it.each(
    [
      ['read', 'size'],
      ['read', 'read'],
      ['read', 'decode'],
      ['compile', 'size'],
      ['compile', 'read'],
      ['compile', 'decode'],
    ] as const,
  )(
    'newer accepted %s/%s failure supersedes the pending request and suppresses its stale error',
    async (stage, failure) => {
      const { runtime, render, local, create, replace } = await replacementHarness()
      const blocked = deferred()
      if (stage === 'compile') {
        create.mockImplementationOnce(async () => {
          await blocked.promise
          throw new Error('Stale compile failure')
        })
      }
      const older = stage === 'read'
        ? render().importSource(sourceReadImport(async () => {
          await blocked.promise
          throw new Error('Stale read failure')
        }))
        : render().importSource(sourceImport('older'))
      await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(stage === 'compile' ? 1 : 0))
      const newer = failure === 'decode'
        ? render().importBundle(bundleReadImport(async () => new ArrayBuffer(0)))
        : render().importSource(sourceReadImport(
          async () => {
            throw new Error('Current read failure')
          },
          failure === 'size' ? 17 * 1024 * 1024 : 1,
        ))
      await newer
      expect(runtime.setBusy).toHaveBeenLastCalledWith(true)
      expect(runtime.setCommandError).toHaveBeenLastCalledWith(expect.stringContaining('отклонён'))
      const errorCalls = runtime.setCommandError.mock.calls.length
      blocked.resolve()
      await older
      expect(runtime.workspace.current).toBe(local)
      expect(replace).toHaveBeenCalledOnce()
      expect(runtime.setCommandError.mock.calls).toHaveLength(errorCalls)
      expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
    },
  )

  it('a declined import does not supersede an older accepted read or clear its busy state', async () => {
    const { runtime, render, older, confirm, create } = await replacementHarness()
    const blocked = deferred()
    const importing = render().importSource(sourceReadImport(async () => {
      await blocked.promise
      return 'older'
    }))
    confirm.mockReturnValue(false)
    const read = vi.fn<() => Promise<string>>(async () => 'newer')
    const busyCalls = runtime.setBusy.mock.calls.length
    await render().importSource(sourceReadImport(read))
    expect(read).not.toHaveBeenCalled()
    expect(runtime.setBusy.mock.calls).toHaveLength(busyCalls)
    blocked.resolve()
    await importing
    expect(runtime.workspace.current).toBe(older)
    expect(create).toHaveBeenCalledOnce()
    expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
  })

  it('accepted failed recovery supersedes an older file read without releasing busy while it is pending', async () => {
    const { runtime, render, local, load, create } = await replacementHarness()
    const blocked = deferred()
    const importing = render().importSource(sourceReadImport(async () => {
      await blocked.promise
      return 'older'
    }))
    load.mockRejectedValue(new Error('Recovery unavailable'))
    expect(await render().reloadLatest()).toBe(false)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(true)
    const errorCalls = runtime.setCommandError.mock.calls.length
    blocked.resolve()
    await importing
    expect(create).not.toHaveBeenCalled()
    expect(runtime.workspace.current).toBe(local)
    expect(runtime.setCommandError.mock.calls).toHaveLength(errorCalls)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
  })

  it('drains N and queued N+1 before a valid import uses the latest durable token', async () => {
    const candidate = await EditorWorkspace.create([{ uri: 'model.c4', content: 'imported' }], async request => ({
      revision: request.revision,
      model: null,
      diagnostics: [],
    }))
    const imported = [{ uri: 'model.c4', content: 'imported' }]
    vi.spyOn(candidate, 'state', 'get').mockReturnValue({
      ...state(),
      revision: 0,
      committedSources: imported,
      draftSources: imported,
    })
    vi.spyOn(EditorWorkspace, 'create').mockResolvedValue(candidate)
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
      status: 'empty',
      token: 'empty',
    })
    const order: string[] = []
    const replace = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockImplementation(async envelope => {
      order.push(`replace-${envelope.revision}`)
      return { status: 'saved', revision: envelope.revision, token: `replacement-${envelope.revision}` }
    })
    const blocked = deferred()
    const save = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'save').mockImplementation(async input => {
      if (input.workspace.revision === 2) await blocked.promise
      order.push(`save-${input.workspace.revision}`)
      return { status: 'saved', revision: input.workspace.revision, token: `v${input.workspace.revision}` }
    })
    const { runtime, render } = runtimeHarness()
    render()
    await vi.waitFor(() => expect(render().draftStatus).toBe('saved'))
    runtime.state = { ...runtime.state, revision: 2 }
    render()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    runtime.state = { ...runtime.state, revision: 3 }
    render()
    const importing = render().importSource(sourceImport('imported'))
    await vi.waitFor(() => expect(EditorWorkspace.create).toHaveBeenCalledTimes(1))
    expect(replace).toHaveBeenCalledTimes(1)
    blocked.resolve()
    await importing
    expect(order).toEqual(['replace-1', 'save-2', 'save-3', 'replace-0'])
    expect(replace).toHaveBeenLastCalledWith(expect.objectContaining({ revision: 0, sources: imported }), 'v3')
    expect(runtime.workspace.current).toBe(candidate)
    expect(render().draftStatus).toBe('saved')
  })

  it('an older validating import cannot replace workspace after a newer rejected attempt', async () => {
    const candidate = await EditorWorkspace.create([{ uri: 'model.c4', content: 'candidate' }], async request => ({
      revision: request.revision,
      model: null,
      diagnostics: [],
    }))
    const valid = { ...state(), revision: 0 }
    const invalid = { ...state(), compilation: { ...state().compilation, status: 'invalid' as const } }
    let candidateState = valid
    vi.spyOn(candidate, 'state', 'get').mockImplementation(() => candidateState)
    const blocked = deferred()
    const create = vi.spyOn(EditorWorkspace, 'create').mockImplementation(async sources => {
      if (sources[0]?.content === 'older') await blocked.promise
      return candidate
    })
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
      status: 'empty',
      token: 'empty',
    })
    const replace = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockResolvedValue({
      status: 'saved',
      revision: 1,
      token: 'v1',
    })
    const { runtime, render } = runtimeHarness()
    render()
    await vi.waitFor(() => expect(render().draftStatus).toBe('saved'))
    const retained = runtime.state
    const older = render().importSource(sourceImport('older'))
    await vi.waitFor(() => expect(create).toHaveBeenCalledTimes(1))
    candidateState = invalid
    await render().importSource(sourceImport('newer invalid'))
    const errorCalls = runtime.setCommandError.mock.calls.length
    candidateState = valid
    blocked.resolve()
    await older
    expect(replace).toHaveBeenCalledTimes(1)
    expect(runtime.state).toBe(retained)
    expect(runtime.setCommandError.mock.calls).toHaveLength(errorCalls)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
  })

  it.each(['invalid', 'throws'])('keeps queued N+1 autosave when import candidate %s', async failure => {
    const invalid = await EditorWorkspace.create([{ uri: 'model.c4', content: 'invalid' }], async request => ({
      revision: request.revision,
      model: null,
      diagnostics: [{ message: 'Invalid candidate' }],
    }))
    const local = await EditorWorkspace.create([{ uri: 'model.c4', content: 'local' }], async request => ({
      revision: request.revision,
      model: null,
      diagnostics: [],
    }))
    const confirm = vi.fn<() => boolean>().mockReturnValue(true)
    vi.stubGlobal('window', { confirm })
    const create = vi.spyOn(EditorWorkspace, 'create')
    if (failure === 'invalid') create.mockResolvedValue(invalid)
    else create.mockRejectedValue(new Error('Candidate failed'))
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
      status: 'empty',
      token: 'empty',
    })
    const replace = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockResolvedValue({
      status: 'saved',
      revision: 1,
      token: 'v1',
    })
    const blocked = deferred()
    const persisted: number[] = []
    const save = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'save').mockImplementation(async input => {
      if (input.workspace.revision === 2) await blocked.promise
      persisted.push(input.workspace.revision)
      return { status: 'saved', revision: input.workspace.revision, token: `v${input.workspace.revision}` }
    })
    const { runtime, render } = runtimeHarness()
    runtime.workspace.current = local
    vi.spyOn(local, 'state', 'get').mockImplementation(() => runtime.state)
    render()
    await vi.waitFor(() => expect(render().draftStatus).toBe('saved'))
    const n = [{ uri: 'model.c4', content: 'committed N' }]
    runtime.state = { ...runtime.state, revision: 2, committedSources: n, draftSources: n }
    render()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const next = [{ uri: 'model.c4', content: 'committed N+1' }]
    runtime.state = { ...runtime.state, revision: 3, committedSources: next, draftSources: next }
    render()
    const retained = runtime.state
    await render().importSource(sourceImport('invalid imported bytes'))
    expect(confirm).toHaveBeenCalledTimes(1)
    expect(runtime.setCommandError).toHaveBeenLastCalledWith(expect.stringContaining('Импорт отклонён'))
    blocked.resolve()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(render().draftStatus).toBe('saved'))
    expect(persisted).toEqual([2, 3])
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedToken: 'v2',
      workspace: expect.objectContaining({ revision: 3, sources: next }),
    }))
    expect(runtime.state).toBe(retained)
    expect(runtime.workspace.current).toBe(local)
    expect(replace).toHaveBeenCalledTimes(1)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
  })

  it('exports exact invalid local draft bytes as .c4 without requiring ZIP compilation', async () => {
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockRejectedValue(new Error('Unavailable'))
    const download = vi.spyOn(downloads, 'downloadSource').mockImplementation(() => {})
    const { runtime, render } = runtimeHarness()
    runtime.state = {
      ...runtime.state,
      draftSources: [{ uri: 'model.c4', content: 'invalid\r\n// exact draft' }],
      compilation: { ...runtime.state.compilation, status: 'invalid' },
    }
    render()
    await vi.waitFor(() => expect(render().status).toBe('error'))
    render().exportDraft()
    expect(download).toHaveBeenCalledWith('invalid\r\n// exact draft', 'model.c4')
    expect(runtime.setFeedback).toHaveBeenCalledWith(expect.stringContaining('Черновик .c4 скачан'))
  })

  it('exports the selected non-entry draft while retaining the portable entry metadata', async () => {
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockRejectedValue(new Error('Unavailable'))
    const download = vi.spyOn(downloads, 'downloadSource').mockImplementation(() => {})
    const { runtime, render } = runtimeHarness()
    runtime.activeDocumentUri = 'domains/orders/model.c4'
    runtime.state = {
      ...runtime.state,
      draftSources: [...runtime.state.draftSources, {
        uri: runtime.activeDocumentUri,
        content: 'broken\r\n// exact bytes',
      }],
      compilation: { ...runtime.state.compilation, status: 'invalid' },
    }
    render().exportDraft()
    expect(download).toHaveBeenCalledExactlyOnceWith('broken\r\n// exact bytes', 'domains/orders/model.c4')
    expect(runtime.state.entryDocumentUri).toBe('model.c4')
  })

  it.each(['invalid', 'compiling'] as const)(
    'exports an actual committed multifile ZIP and a separate exact %s entry draft during conflict',
    async status => {
      const { runtime, render } = await conflictHarness()
      runtime.state = { ...runtime.state, compilation: { ...runtime.state.compilation, status } }
      const before = runtime.state
      const blobs: Blob[] = []
      vi.spyOn(URL, 'createObjectURL').mockImplementation(blob => {
        if (!(blob instanceof Blob)) throw new Error('Expected ZIP Blob')
        blobs.push(blob)
        return 'blob:unit-test'
      })
      vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {})
      const anchor = { href: '', download: '', click: vi.fn<() => void>() }
      vi.stubGlobal('document', { createElement: () => anchor })
      const download = vi.spyOn(downloads, 'downloadSource').mockImplementation(() => {})
      render().exportBundle()
      expect(blobs).toHaveLength(1)
      const zip = blobs[0]!
      const decoded = importWorkspaceBundle(new Uint8Array(await zip.arrayBuffer()))
      expect(decoded.sources).toEqual([...before.committedSources].sort((a, b) => a.uri.localeCompare(b.uri)))
      expect(decoded.manualLayouts).toEqual(before.manualLayouts)
      expect(decoded.metadata.entryDocumentUri).toBe('z-entry.c4')
      expect(anchor.download).toMatch(/\.zip$/)
      expect(anchor.click).toHaveBeenCalledOnce()
      expect(download).not.toHaveBeenCalled()
      render().exportDraft()
      expect(download).toHaveBeenCalledExactlyOnceWith('model { broken =\r\n// exact unsaved draft', 'z-entry.c4')
      expect(runtime.state).toBe(before)
      expect(render().status).toBe('conflict')
      expect(render()).not.toHaveProperty('exportLocal')
      runtime.workspace.current = null
      render().exportBundle()
      expect(blobs).toHaveLength(2)
      const fallback = importWorkspaceBundle(new Uint8Array(await blobs[1]!.arrayBuffer()))
      expect(fallback.sources).toEqual(decoded.sources)
      expect(fallback.manualLayouts).toEqual(decoded.manualLayouts)
    },
  )

  it('does not export unvalidated initial source as a committed ZIP', async () => {
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockRejectedValue(new Error('Unavailable'))
    const local = await EditorWorkspace.create([{ uri: 'model.c4', content: 'model { broken =' }], compile)
    const { runtime, render } = runtimeHarness()
    runtime.workspace.current = local
    runtime.state = local.state
    const blob = vi.spyOn(URL, 'createObjectURL')
    render().exportBundle()
    expect(blob).not.toHaveBeenCalled()
    expect(runtime.setCommandError).toHaveBeenCalledWith(
      expect.stringContaining('Нет подтверждённой корректной версии'),
    )
    await vi.waitFor(() => expect(render().status).toBe('error'))
  })

  it('declined conflict recovery preserves local draft, history, layout, read-only state and status', async () => {
    const { runtime, render, local, load, save } = await conflictHarness()
    const before = runtime.state
    const confirm = vi.fn<() => boolean>(() => false)
    vi.stubGlobal('window', { confirm })
    const busyCalls = runtime.setBusy.mock.calls.length
    const readOnlyCalls = runtime.setReadOnly.mock.calls.length
    expect(await render().reloadLatest()).toBe(false)
    expect(confirm).toHaveBeenCalledWith(expect.stringContaining('заменит всю локальную работу'))
    expect(load).toHaveBeenCalledOnce()
    expect(save).toHaveBeenCalledOnce()
    expect(runtime.setBusy.mock.calls).toHaveLength(busyCalls)
    expect(runtime.setReadOnly.mock.calls).toHaveLength(readOnlyCalls)
    expect(runtime.workspace.current).toBe(local)
    expect(runtime.state).toBe(before)
    expect(render().status).toBe('conflict')
  })

  it.each(['unavailable', 'empty', 'corrupt', 'invalid-source'] as const)(
    'failed conflict recovery (%s) preserves local work and remains read-only',
    async failure => {
      const { runtime, render, local, load } = await conflictHarness()
      const before = runtime.state
      vi.stubGlobal('window', { confirm: vi.fn<() => boolean>(() => true) })
      switch (failure) {
        case 'unavailable':
          load.mockRejectedValue(new Error('Storage unavailable'))
          break
        case 'empty':
          load.mockResolvedValue({ status: 'empty', token: 'empty-latest' })
          break
        case 'corrupt':
          load.mockResolvedValue({
            status: 'invalid',
            token: 'corrupt',
            activeError: 'Active invalid',
            backupError: 'Backup invalid',
          })
          break
        case 'invalid-source':
          load.mockResolvedValue({
            status: 'loaded',
            token: 'invalid-source',
            workspace: { ...envelopeFromState(before), sources: before.draftSources },
          })
          break
      }
      const readOnlyCalls = runtime.setReadOnly.mock.calls.length
      expect(await render().reloadLatest()).toBe(false)
      expect(runtime.workspace.current).toBe(local)
      expect(runtime.state).toBe(before)
      expect(runtime.setReadOnly.mock.calls).toHaveLength(readOnlyCalls)
      expect(runtime.setReadOnly).toHaveBeenLastCalledWith(true)
      expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
      expect(runtime.setCommandError).toHaveBeenLastCalledWith(
        expect.stringContaining('Не удалось восстановить актуальную версию'),
      )
      expect(render().status).toBe('conflict')
    },
  )

  it('confirmed conflict recovery replaces the workspace and uses the recovered token for subsequent saves', async () => {
    const { runtime, render, local, load, save } = await conflictHarness()
    const envelope = envelopeFromState(runtime.state)
    vi.stubGlobal('window', { confirm: vi.fn<() => boolean>(() => true) })
    load.mockResolvedValue({
      status: 'recovered-from-backup',
      workspace: envelope,
      token: 'recovered',
      activeError: 'Corrupt',
    })
    expect(await render().reloadLatest()).toBe(true)
    expect(runtime.workspace.current).not.toBe(local)
    expect(runtime.state.committedSources).toEqual(envelope.sources)
    expect(runtime.state.draftSources).toEqual(envelope.sources)
    expect(runtime.state.manualLayouts).toEqual(envelope.manualLayouts)
    expect(runtime.state.entryDocumentUri).toBe('z-entry.c4')
    expect(runtime.state.history).toEqual({
      past: [],
      future: [],
      current: { type: 'workspace.open', label: 'Начальное состояние' },
    })
    expect(runtime.setReadOnly).toHaveBeenLastCalledWith(false)
    expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
    expect(render().draftStatus).toBe('saved')
    save.mockResolvedValue({ status: 'saved', revision: envelope.revision + 1, token: 'after-recovery' })
    runtime.state = { ...runtime.state, revision: envelope.revision + 1 }
    render()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(2))
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({
      expectedToken: 'recovered',
      expectedPreviousRevision: envelope.revision,
    }))
    await vi.waitFor(() => expect(render().draftStatus).toBe('saved'))
  })

  it.each([false, true])(
    'keeps queued local autosaves when recovery is declined or fails (confirm=%s)',
    async accepted => {
      const confirm = vi.fn<() => boolean>(() => accepted)
      vi.stubGlobal('window', { confirm })
      const load = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
        status: 'empty',
        token: 'empty',
      })
      vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockResolvedValue({
        status: 'saved',
        revision: 1,
        token: 'v1',
      })
      const blocked = deferred()
      const revisions: number[] = []
      const save = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'save').mockImplementation(async input => {
        if (input.workspace.revision === 2) await blocked.promise
        revisions.push(input.workspace.revision)
        return { status: 'saved', revision: input.workspace.revision, token: `v${input.workspace.revision}` }
      })
      const { runtime, render } = runtimeHarness()
      render()
      await vi.waitFor(() => expect(render().status).toBe('saved'))
      runtime.state = { ...runtime.state, revision: 2 }
      render()
      await vi.waitFor(() => expect(save).toHaveBeenCalledOnce())
      runtime.state = { ...runtime.state, revision: 3 }
      render()
      const before = runtime.state
      load.mockRejectedValue(new Error('Recovery unavailable'))
      const reloading = render().reloadLatest()
      blocked.resolve()
      expect(await reloading).toBe(false)
      await vi.waitFor(() => expect(render().draftStatus).toBe('saved'))
      expect(revisions).toEqual([2, 3])
      expect(runtime.state).toBe(before)
      expect(load).toHaveBeenCalledTimes(accepted ? 2 : 1)
    },
  )

  it.each([false, true])(
    'a later recovery request supersedes a validating recovery only when confirmed (%s)',
    async accepted => {
      const { runtime, render, local, load } = await conflictHarness()
      const envelope = envelopeFromState(runtime.state)
      const candidate = await EditorWorkspace.create(
        envelope.sources,
        compile,
        undefined,
        envelope.workspaceId,
        envelope.manualLayouts,
        envelope.metadata.entryDocumentUri,
        envelope.revision,
      )
      load.mockResolvedValue({ status: 'loaded', token: 'latest', workspace: envelope })
      const blocked = deferred()
      const create = vi.spyOn(EditorWorkspace, 'create')
        .mockImplementationOnce(async () => {
          await blocked.promise
          return candidate
        })
        .mockResolvedValue(candidate)
      const confirm = vi.fn<() => boolean>(() => true)
      vi.stubGlobal('window', { confirm })
      const older = render().reloadLatest()
      await vi.waitFor(() => expect(create).toHaveBeenCalledOnce())
      confirm.mockReturnValue(accepted)
      expect(await render().reloadLatest()).toBe(accepted)
      expect(runtime.workspace.current).toBe(accepted ? candidate : local)
      blocked.resolve()
      expect(await older).toBe(!accepted)
      expect(runtime.workspace.current).toBe(candidate)
      expect(create).toHaveBeenCalledTimes(accepted ? 2 : 1)
      expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
      expect(render().draftStatus).toBe('saved')
    },
  )

  it.each(['repaired', 'unchanged', 'conflict'] as const)(
    'restoration persists only changed geometry before unlocking: %s',
    async outcome => {
      const candidate = await EditorWorkspace.create([{ uri: 'model.c4', content: 'saved bytes' }], async request => ({
        revision: request.revision,
        model: null,
        diagnostics: [],
      }))
      const layout: ViewManualLayoutSnapshot = {
        id: 'index' as ViewId,
        _stage: 'layouted',
        _type: 'element',
        title: null,
        description: null,
        hash: 'hash',
        nodes: [],
        edges: [],
        bounds: { x: 0, y: 0, width: 400, height: 200 },
        autoLayout: { direction: 'TB' },
      }
      const restored = { ...state(), manualLayouts: { index: layout } }
      vi.spyOn(candidate, 'state', 'get').mockReturnValue(restored)
      vi.spyOn(EditorWorkspace, 'create').mockResolvedValue(candidate)
      const envelope = {
        ...envelopeFromState(restored),
        manualLayouts: outcome === 'unchanged' ? restored.manualLayouts : {
          index: { ...layout, bounds: { ...layout.bounds, width: 300 } },
        },
        metadata: { entryDocumentUri: 'model.c4', activeViewId: 'index' },
      }
      vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
        status: 'loaded',
        workspace: envelope,
        token: 'old-token',
      })
      const blocked = deferred()
      const replace = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockImplementation(async () => {
        await blocked.promise
        return outcome === 'conflict'
          ? { status: 'conflict', durableRevision: 2 }
          : { status: 'saved', revision: 1, token: 'repaired-token' }
      })
      const { runtime, render } = runtimeHarness()
      render()
      if (outcome !== 'unchanged') {
        await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce())
        expect(runtime.workspace.current).toBeNull()
        expect(runtime.setReadOnly).toHaveBeenLastCalledWith(true)
        expect(replace).toHaveBeenCalledWith(
          expect.objectContaining({
            revision: 1,
            sources: envelope.sources,
            manualLayouts: restored.manualLayouts,
            metadata: envelope.metadata,
          }),
          'old-token',
        )
      }
      blocked.resolve()
      await vi.waitFor(() => expect(render().draftStatus).toBe(outcome === 'conflict' ? 'conflict' : 'saved'))
      expect(runtime.workspace.current).toBe(outcome === 'conflict' ? null : candidate)
      expect(runtime.setReadOnly).toHaveBeenLastCalledWith(outcome === 'conflict')
      if (outcome === 'unchanged') expect(replace).not.toHaveBeenCalled()
    },
  )

  it.each(['saved', 'conflict'] as const)(
    'load latest persists repaired geometry before replacement: %s',
    async outcome => {
      const { runtime, render, local, load } = await conflictHarness()
      vi.stubGlobal('window', { confirm: () => true })
      const restored = {
        ...runtime.state,
        draftSources: runtime.state.committedSources,
        compilation: { ...runtime.state.compilation, status: 'valid' as const },
      }
      const candidate = await EditorWorkspace.create(restored.committedSources, async request => ({
        revision: request.revision,
        model: restored.lastValidModel,
        diagnostics: [],
      }))
      vi.spyOn(candidate, 'state', 'get').mockReturnValue(restored)
      vi.spyOn(EditorWorkspace, 'create').mockResolvedValue(candidate)
      const envelope = { ...envelopeFromState(restored), manualLayouts: {} }
      load.mockResolvedValue({ status: 'loaded', workspace: envelope, token: 'latest' })
      const blocked = deferred()
      const replace = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockClear().mockImplementation(
        async () => {
          await blocked.promise
          return outcome === 'saved'
            ? { status: 'saved', revision: restored.revision, token: 'repaired' }
            : { status: 'conflict', durableRevision: restored.revision + 1 }
        },
      )
      const reloading = render().reloadLatest()
      await vi.waitFor(() => expect(replace).toHaveBeenCalledOnce())
      expect(runtime.workspace.current).toBe(local)
      // A rejected import must not supersede a valid recovery already performing its CAS write.
      const attemptedRead = vi.fn<() => Promise<string>>(async () => 'replacement source')
      await render().importSource(sourceReadImport(attemptedRead))
      expect(attemptedRead).not.toHaveBeenCalled()
      expect(replace).toHaveBeenCalledWith(
        expect.objectContaining({
          sources: envelope.sources,
          revision: envelope.revision,
          manualLayouts: restored.manualLayouts,
        }),
        'latest',
      )
      blocked.resolve()
      expect(await reloading).toBe(outcome === 'saved')
      expect(runtime.workspace.current).toBe(outcome === 'saved' ? candidate : local)
      expect(render().draftStatus).toBe(outcome === 'saved' ? 'saved' : 'conflict')
    },
  )

  it('production hook blocks a second queued save after a conflict without replacing local state', async () => {
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
      status: 'empty',
      token: 'empty',
    })
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockResolvedValue({
      status: 'saved',
      revision: 1,
      token: 'v1',
    })
    const blocked = deferred()
    const save = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'save').mockImplementation(async () => {
      await blocked.promise
      return { status: 'conflict', durableRevision: 0 }
    })
    const { runtime, render } = runtimeHarness()
    render()
    await vi.waitFor(() => expect(render().status).toBe('saved'))
    runtime.state = { ...runtime.state, revision: 2 }
    render()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    runtime.state = { ...runtime.state, revision: 3 }
    render()
    const local = runtime.state
    blocked.resolve()
    await vi.waitFor(() => expect(render().draftStatus).toBe('conflict'))
    await Promise.resolve()
    expect(save).toHaveBeenCalledTimes(1)
    expect(runtime.state).toBe(local)
    expect(runtime.setReadOnly).toHaveBeenLastCalledWith(true)
    expect(runtime.setCommandError).toHaveBeenLastCalledWith(expect.stringContaining('экспортируйте локальную'))
  })

  it('production hook keeps invalid draft status after delayed save completion', async () => {
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockResolvedValue({
      status: 'empty',
      token: 'empty',
    })
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'replace').mockResolvedValue({
      status: 'saved',
      revision: 1,
      token: 'v1',
    })
    const blocked = deferred()
    const save = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'save').mockImplementation(async input => {
      await blocked.promise
      return { status: 'saved', revision: input.workspace.revision, token: 'v2' }
    })
    const { runtime, render } = runtimeHarness()
    render()
    await vi.waitFor(() => expect(render().draftStatus).toBe('saved'))
    runtime.state = { ...runtime.state, revision: 2 }
    render()
    await vi.waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    runtime.state = {
      ...runtime.state,
      draftSources: [{ uri: 'model.c4', content: 'exact broken bytes' }],
      compilation: { ...runtime.state.compilation, status: 'invalid' },
    }
    render()
    blocked.resolve()
    await vi.waitFor(() => expect(render().status).toBe('saved'))
    expect(render()).toMatchObject({
      draftStatus: 'invalid',
      hasUnsavedDraft: true,
      draftStatusMessage: 'Черновик не сохранён. Сохранена последняя корректная версия.',
    })
    expect(save).toHaveBeenCalledTimes(1)
  })

  it('production hook exposes storage error and does not claim the draft saved', async () => {
    vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'loadWithRecovery').mockRejectedValue(
      new Error('Storage unavailable'),
    )
    const save = vi.spyOn(IndexedDbWorkspacePersistence.prototype, 'save')
    const { runtime, render } = runtimeHarness()
    render()
    await vi.waitFor(() => expect(render().draftStatus).toBe('error'))
    expect(render().hasUnsavedDraft).toBe(true)
    expect(runtime.setReadOnly).toHaveBeenLastCalledWith(false)
    expect(runtime.setCommandError).toHaveBeenCalledWith(expect.stringContaining('Storage unavailable'))
    runtime.state = { ...runtime.state, revision: 2 }
    render()
    expect(save).not.toHaveBeenCalled()
  })

  it('never calls an invalid draft saved after an older save completes', async () => {
    const current = state()
    const snapshot = envelopeFromState(current)
    const blocked = deferred()
    const completion = blocked.promise.then(() => snapshot)
    const invalid = {
      ...current,
      draftSources: [{ uri: 'model.c4', content: 'invalid exact bytes' }],
      compilation: { ...current.compilation, status: 'invalid' as const },
    }
    blocked.resolve()
    expect(deriveDraftStatus(invalid, 'saved', await completion)).toBe('invalid')
    expect(invalid.draftSources[0]?.content).toBe('invalid exact bytes')
  })

  it('requires matching saved sources, layouts, project and revision', () => {
    const current = state()
    const snapshot = envelopeFromState(current)
    expect(deriveDraftStatus(current, 'saved', snapshot)).toBe('saved')
    expect(deriveDraftStatus({ ...current, revision: 2 }, 'saved', snapshot)).toBe('unsaved')
    expect(deriveDraftStatus({ ...current, projectId: 'import' }, 'saved', snapshot)).toBe('unsaved')
    expect(deriveDraftStatus(current, 'saved', { ...snapshot, sources: [{ uri: 'model.c4', content: 'older' }] }))
      .toBe('unsaved')
    const layout: ViewManualLayoutSnapshot = {
      id: 'index' as ViewId,
      _stage: 'layouted',
      _type: 'element',
      title: null,
      description: null,
      hash: 'hash',
      nodes: [],
      edges: [],
      bounds: { x: 0, y: 0, width: 1, height: 1 },
      autoLayout: { direction: 'TB' },
    }
    expect(deriveDraftStatus(current, 'saved', { ...snapshot, manualLayouts: { index: layout } })).toBe('unsaved')
    expect(deriveDraftStatus(current, 'error', snapshot)).toBe('error')
    expect(deriveDraftStatus(current, 'conflict', snapshot)).toBe('conflict')
    expect(deriveDraftStatus(current, 'saving', null)).toBe('saving')
    expect(
      deriveDraftStatus(
        { ...current, compilation: { ...current.compilation, status: 'compiling' } },
        'saved',
        snapshot,
      ),
    )
      .toBe('compiling')
  })
  it('confirms replacement for draft source changes even before a revision is committed', () => {
    const committedSources = [{ uri: 'model.c4', content: 'model current' }]

    expect(shouldConfirmReplacement({
      revision: 0,
      committedSources,
      draftSources: committedSources,
    })).toBe(false)
    expect(shouldConfirmReplacement({
      revision: 0,
      committedSources,
      draftSources: [{ uri: 'model.c4', content: 'model invalid' }],
    })).toBe(true)
    expect(shouldConfirmReplacement({
      revision: 0,
      committedSources,
      draftSources: [{ uri: 'model.c4', content: 'model compiling' }],
    })).toBe(true)
  })

  it('keeps confirming replacement for committed workspace history', () => {
    const sources = [{ uri: 'model.c4', content: 'model current' }]

    expect(shouldConfirmReplacement({ revision: 1, committedSources: sources, draftSources: sources })).toBe(true)
  })

  it('does not enqueue a same-revision hydration save', () => {
    expect(shouldPersistRevision(7, 7)).toBe(false)
    expect(shouldPersistRevision(8, 7)).toBe(true)
    expect(shouldPersistRevision(0, null)).toBe(true)
  })

  it('skips a queued callback after explicit recovery advances its generation', async () => {
    let generation = 0
    const blocker = deferred()
    let saved = false
    const queued = enqueueVersionedTask(blocker.promise, 0, () => generation, async () => {
      saved = true
    })

    generation = 1
    blocker.resolve()
    await queued

    expect(saved).toBe(false)
  })

  it('ignores an in-flight completion after explicit recovery advances its generation', async () => {
    let generation = 0
    const started = deferred()
    const blocker = deferred()
    let statusChanges = 0
    const queued = enqueueVersionedTask(Promise.resolve(), 0, () => generation, async isCurrent => {
      started.resolve()
      await blocker.promise
      if (isCurrent()) statusChanges += 1
    })

    await started.promise
    generation = 1
    blocker.resolve()
    await queued

    expect(statusChanges).toBe(0)
  })
})
