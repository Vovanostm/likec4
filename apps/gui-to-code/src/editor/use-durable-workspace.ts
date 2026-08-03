import type { ChangeEvent, MutableRefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { compile } from '../compiler'
import type { EditorWorkspaceState } from './contracts'
import { IndexedDbWorkspacePersistence } from './indexeddb-workspace'
import {
  envelopeFromState,
  layoutsFromEnvelope,
  type PersistedWorkspaceEnvelope,
  workspaceSchema,
  workspaceVersion,
} from './persisted-workspace'
import { EditorWorkspace } from './workspace'
import {
  exportWorkspaceBundle,
  importWorkspaceBundle,
  workspaceBundleFilename,
} from './workspace-bundle'

interface WorkspaceRuntimeBridge {
  readonly workspace: MutableRefObject<EditorWorkspace | null>
  readonly state: EditorWorkspaceState | null
  readonly refresh: () => EditorWorkspaceState | null
  readonly setBusy: (busy: boolean) => void
  readonly setCommandError: (message: string | null) => void
  readonly setFeedback: (message: string | null) => void
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()
  URL.revokeObjectURL(url)
}

export function useDurableWorkspace(runtime: WorkspaceRuntimeBridge) {
  const persistence = useRef(new IndexedDbWorkspacePersistence())
  const hydrated = useRef(false)
  const durableRevision = useRef<number | null>(null)
  const saveQueue = useRef(Promise.resolve())
  const replacementGeneration = useRef(0)
  const [status, setStatus] = useState<'loading' | 'saving' | 'saved' | 'error'>('loading')

  const persistFreshWorkspace = async (state: EditorWorkspaceState): Promise<void> => {
    await persistence.current.clear()
    durableRevision.current = null
    const result = await persistence.current.save({
      expectedPreviousRevision: null,
      workspace: envelopeFromState(state),
    })
    if (result.status !== 'saved') throw new Error('Не удалось зафиксировать новый durable workspace.')
    durableRevision.current = result.revision
  }

  useEffect(() => {
    if (!runtime.state || hydrated.current) return
    hydrated.current = true
    let cancelled = false
    void persistence.current.load().then(async envelope => {
      if (!envelope || cancelled) {
        setStatus('saved')
        return
      }
      const candidate = await EditorWorkspace.create(
        envelope.sources,
        compile,
        undefined,
        envelope.workspaceId,
        layoutsFromEnvelope(envelope),
      )
      if (cancelled) return
      if (candidate.state.compilation.status !== 'valid') {
        runtime.setCommandError('Сохранённый workspace повреждён и не был восстановлен. Открыт безопасный текущий проект.')
        setStatus('error')
        return
      }
      runtime.workspace.current = candidate
      runtime.refresh()
      await persistFreshWorkspace(candidate.state)
      runtime.setFeedback('Workspace восстановлен из IndexedDB.')
      setStatus('saved')
    }).catch(error => {
      if (cancelled) return
      runtime.setCommandError(`Не удалось восстановить workspace: ${error instanceof Error ? error.message : String(error)}`)
      setStatus('error')
    })
    return () => {
      cancelled = true
    }
  }, [runtime.state])

  useEffect(() => {
    const state = runtime.state
    if (!hydrated.current || !state || state.compilation.status !== 'valid') return
    const envelope = envelopeFromState(state)
    setStatus('saving')
    saveQueue.current = saveQueue.current.then(async () => {
      const result = await persistence.current.save({
        expectedPreviousRevision: durableRevision.current,
        workspace: envelope,
      })
      if (result.status === 'saved') {
        durableRevision.current = result.revision
        setStatus('saved')
        return
      }
      if (result.status === 'stale') {
        durableRevision.current = result.durableRevision
        return
      }
      throw new Error('Durable workspace был изменён в другой вкладке.')
    }).catch(error => {
      runtime.setCommandError(`Не удалось сохранить workspace: ${error instanceof Error ? error.message : String(error)}`)
      setStatus('error')
    })
  }, [runtime.state?.revision, runtime.state?.compilation.status])

  const replaceEnvelope = async (envelope: PersistedWorkspaceEnvelope, success: string): Promise<boolean> => {
    const generation = ++replacementGeneration.current
    runtime.setBusy(true)
    runtime.setCommandError(null)
    try {
      const candidate = await EditorWorkspace.create(
        envelope.sources,
        compile,
        undefined,
        envelope.workspaceId,
        layoutsFromEnvelope(envelope),
      )
      if (generation !== replacementGeneration.current) return false
      if (candidate.state.compilation.status !== 'valid') {
        runtime.setCommandError('Импорт отклонён: исправьте ошибки LikeC4 в импортируемом workspace.')
        return false
      }
      await persistFreshWorkspace(candidate.state)
      runtime.workspace.current = candidate
      runtime.refresh()
      runtime.setFeedback(success)
      setStatus('saved')
      return true
    } catch (error) {
      if (generation === replacementGeneration.current) {
        runtime.setCommandError(`Импорт отклонён: ${error instanceof Error ? error.message : String(error)}`)
      }
      return false
    } finally {
      if (generation === replacementGeneration.current) runtime.setBusy(false)
    }
  }

  const confirmReplacement = (): boolean => window.confirm(
    'Импорт полностью заменит текущий workspace и сбросит историю Undo/Redo. Продолжить?',
  )

  const importSource = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      if (!confirmReplacement()) return
      if (file.size > 16 * 1024 * 1024) throw new Error('Файл превышает допустимый размер.')
      const content = await file.text()
      if (!content.length) throw new Error('Файл пуст.')
      await replaceEnvelope({
        schema: workspaceSchema,
        version: workspaceVersion,
        workspaceId: 'default',
        revision: 0,
        savedAt: new Date().toISOString(),
        sources: [{ uri: 'model.c4', content }],
        manualLayouts: {},
        metadata: { entryDocumentUri: 'model.c4' },
      }, 'Файл .c4 импортирован. История изменений начата заново.')
    } catch (error) {
      runtime.setCommandError(`Импорт .c4 отклонён: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      input.value = ''
    }
  }

  const importBundle = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    try {
      if (!confirmReplacement()) return
      if (file.size > 16 * 1024 * 1024) throw new Error('ZIP превышает допустимый размер.')
      const envelope = importWorkspaceBundle(new Uint8Array(await file.arrayBuffer()))
      await replaceEnvelope(envelope, 'Workspace ZIP импортирован. История изменений начата заново.')
    } catch (error) {
      runtime.setCommandError(`Импорт ZIP отклонён: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      input.value = ''
    }
  }

  const exportBundle = (): void => {
    const state = runtime.workspace.current?.state
    if (!state || state.compilation.status !== 'valid') {
      runtime.setCommandError('Нельзя экспортировать workspace с ошибками.')
      return
    }
    downloadBlob(exportWorkspaceBundle(envelopeFromState(state)), workspaceBundleFilename())
    runtime.setFeedback('Workspace ZIP экспортирован.')
  }

  return { status, importSource, importBundle, exportBundle }
}
