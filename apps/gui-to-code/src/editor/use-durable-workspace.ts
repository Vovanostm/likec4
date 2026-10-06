import type { ChangeEvent, MutableRefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import { compile } from '../compiler'
import { emptySource } from '../document'
import type { EditorWorkspaceState } from './contracts'
import { downloadSource } from './file-downloads'
import {
  type DurableWorkspaceToken,
  type PersistenceSaveResult,
  IndexedDbWorkspacePersistence,
} from './indexeddb-workspace'
import {
  type PersistedWorkspaceEnvelope,
  envelopeFromState,
  layoutsFromEnvelope,
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
  readonly layoutPending?: boolean
  readonly state: EditorWorkspaceState | null
  readonly selectedViewId?: string | null
  readonly activeDocumentUri?: string | undefined
  readonly restoreView?: (viewId?: string) => void
  readonly refresh: () => EditorWorkspaceState | null
  readonly setBusy: (busy: boolean) => void
  readonly setReplacementBusy: (busy: boolean) => void
  readonly setReadOnly: (readOnly: boolean) => void
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

function errorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function shouldPersistRevision(revision: number, durableRevision: number | null): boolean {
  return durableRevision === null || revision > durableRevision
}

export function enqueueVersionedTask(
  queue: Promise<void>,
  generation: number,
  currentGeneration: () => number,
  task: (isCurrent: () => boolean) => Promise<void>,
): Promise<void> {
  return queue.then(async () => {
    const isCurrent = () => generation === currentGeneration()
    if (!isCurrent()) return
    await task(isCurrent)
  })
}

function sameSources(
  left: EditorWorkspaceState['committedSources'],
  right: EditorWorkspaceState['draftSources'],
): boolean {
  if (left.length !== right.length) return false
  const rightByUri = new Map(right.map(source => [source.uri, source.content]))
  return left.every(source => rightByUri.get(source.uri) === source.content)
    && rightByUri.size === right.length
}

export function shouldConfirmReplacement(
  state: Pick<EditorWorkspaceState, 'revision' | 'committedSources' | 'draftSources'>,
): boolean {
  return state.revision !== 0 || !sameSources(state.committedSources, state.draftSources)
}

export type DurableSaveStatus = 'loading' | 'saving' | 'saved' | 'error' | 'conflict'
export type DurableDraftStatus = DurableSaveStatus | 'compiling' | 'invalid' | 'unsaved'

/** Derived display status: successful storage of an older snapshot does not save the current draft. */
export function deriveDraftStatus(
  state: EditorWorkspaceState | null,
  outcome: DurableSaveStatus,
  saved: PersistedWorkspaceEnvelope | null,
): DurableDraftStatus {
  if (outcome === 'loading' || outcome === 'conflict' || outcome === 'error') return outcome
  if (!state) return 'loading'
  if (state.compilation.status === 'compiling') return 'compiling'
  if (state.compilation.status === 'invalid') return 'invalid'
  if (state.compilation.status !== 'valid') return 'unsaved'
  if (!sameSources(state.committedSources, state.draftSources)) return 'unsaved'
  const matches = saved !== null && saved.workspaceId === state.projectId && saved.revision === state.revision
    && saved.metadata.entryDocumentUri === state.entryDocumentUri
    && sameSources(saved.sources, state.draftSources)
    && JSON.stringify(Object.entries(saved.manualLayouts).sort(([a], [b]) => a.localeCompare(b)))
      === JSON.stringify(Object.entries(state.manualLayouts).sort(([a], [b]) => a.localeCompare(b)))
  if (matches) return 'saved'
  return outcome === 'saving' ? 'saving' : 'unsaved'
}

export const durableDraftStatusMessages: Readonly<Record<DurableDraftStatus, string>> = {
  loading: 'Восстановление рабочего пространства…',
  compiling: 'Проверка черновика. Черновик ещё не сохранён.',
  invalid: 'Черновик не сохранён. Сохранена последняя корректная версия.',
  unsaved: 'Черновик не сохранён.',
  saving: 'Сохранение рабочего пространства…',
  saved: 'Рабочее пространство сохранено.',
  conflict: 'Обнаружен конфликт сохранения. Экспортируйте локальную версию или загрузите актуальную.',
  error: 'Не удалось сохранить рабочее пространство. Скачайте черновик перед закрытием страницы.',
}

export function useDurableWorkspace(runtime: WorkspaceRuntimeBridge) {
  const runtimeRef = useRef(runtime)
  runtimeRef.current = runtime
  const persistence = useRef(new IndexedDbWorkspacePersistence())
  const hydrationStarted = useRef(false)
  const hydrationComplete = useRef(false)
  const durableRevision = useRef<number | null>(null)
  const durableToken = useRef<DurableWorkspaceToken | null>(null)
  const [savedSnapshot, setSavedSnapshot] = useState<PersistedWorkspaceEnvelope | null>(null)
  const saveQueue = useRef(Promise.resolve())
  const replacementGeneration = useRef(0)
  const replacementAttempt = useRef(0)
  const replacementActivity = useRef(0)
  const [status, setStatus] = useState<DurableSaveStatus>('loading')
  const conflictRef = useRef(false)
  const state = runtime.state
  const revision = state?.revision
  const compilationStatus = state?.compilation.status
  const hasState = state !== null

  const handleConflict = (result: Exclude<PersistenceSaveResult, { status: 'saved' }>): void => {
    conflictRef.current = true
    runtimeRef.current.setReadOnly(true)
    runtimeRef.current.setCommandError(
      `Рабочее пространство изменено в другой вкладке (ревизия ${result.durableRevision}). Перезагрузите актуальную версию или экспортируйте локальную.`,
    )
    setStatus('conflict')
  }

  const persistFreshWorkspace = async (state: EditorWorkspaceState): Promise<boolean> => {
    if (durableToken.current === null) throw new Error('Сначала загрузите актуальную сохранённую версию.')
    const envelope = envelopeFromState(state)
    const result = await persistence.current.replace(envelope, durableToken.current)
    if (result.status !== 'saved') {
      handleConflict(result)
      return false
    }
    durableToken.current = result.token
    durableRevision.current = envelope.revision
    setSavedSnapshot(envelope)
    return true
  }

  useEffect(() => {
    const currentRuntime = runtimeRef.current
    const initialState = currentRuntime.state
    if (!initialState || hydrationStarted.current) return
    hydrationStarted.current = true
    currentRuntime.setReadOnly(true)
    let cancelled = false
    void persistence.current.loadWithRecovery().then(async loaded => {
      if (cancelled) return
      durableToken.current = loaded.token
      if (loaded.status === 'empty') {
        const persisted = await persistFreshWorkspace(initialState)
        if (cancelled) return
        hydrationComplete.current = true
        if (!persisted) return
        runtimeRef.current.setReadOnly(false)
        setStatus('saved')
        return
      }
      if (loaded.status === 'invalid') {
        runtimeRef.current.setReadOnly(true)
        runtimeRef.current.setCommandError(
          `Сохранённое рабочее пространство повреждено: ${loaded.activeError} ${loaded.backupError}`,
        )
        hydrationComplete.current = true
        setStatus('error')
        return
      }
      const envelope = loaded.workspace
      const candidate = await EditorWorkspace.create(
        envelope.sources,
        compile,
        undefined,
        envelope.workspaceId,
        layoutsFromEnvelope(envelope),
        envelope.metadata.entryDocumentUri,
        envelope.revision,
      )
      if (cancelled) return
      if (candidate.state.compilation.status !== 'valid') {
        runtimeRef.current.setReadOnly(true)
        runtimeRef.current.setCommandError(
          'Сохранённое рабочее пространство повреждено и не восстановлено. Открыт безопасный текущий проект.',
        )
        hydrationComplete.current = true
        setStatus('error')
        return
      }
      // Restoration can repair obsolete geometry without creating a semantic revision.
      // Persist that repair before enabling edits; ordinary autosave only accepts newer revisions.
      let restoredEnvelope = envelope
      if (deriveDraftStatus(candidate.state, 'saved', envelope) !== 'saved') {
        restoredEnvelope = { ...envelopeFromState(candidate.state), metadata: envelope.metadata }
        const result = await persistence.current.replace(restoredEnvelope, loaded.token)
        if (cancelled) return
        if (result.status !== 'saved') {
          hydrationComplete.current = true
          handleConflict(result)
          return
        }
        durableToken.current = result.token
      }
      runtimeRef.current.workspace.current = candidate
      runtimeRef.current.restoreView?.()
      durableRevision.current = envelope.revision
      setSavedSnapshot(restoredEnvelope)
      runtimeRef.current.setReadOnly(false)
      runtimeRef.current.refresh()
      hydrationComplete.current = true
      runtimeRef.current.setFeedback(
        loaded.status === 'recovered-from-backup'
          ? 'Основная запись повреждена. Рабочее пространство восстановлено из резервной копии.'
          : 'Рабочее пространство восстановлено из IndexedDB.',
      )
      setStatus('saved')
    }).catch(error => {
      if (cancelled) return
      hydrationComplete.current = true
      runtimeRef.current.setReadOnly(false)
      runtimeRef.current.setCommandError(`Не удалось восстановить рабочее пространство: ${errorDetails(error)}`)
      setStatus('error')
    })
    return () => {
      cancelled = true
      if (!hydrationComplete.current) hydrationStarted.current = false
    }
  }, [hasState])

  useEffect(() => {
    const currentState = runtimeRef.current.state
    if (
      !hydrationComplete.current || conflictRef.current || durableToken.current === null
      || !currentState || currentState.compilation.status !== 'valid'
    ) return
    const envelope = envelopeFromState(currentState)
    if (!shouldPersistRevision(envelope.revision, durableRevision.current)) return
    setStatus('saving')
    const generation = replacementGeneration.current
    saveQueue.current = enqueueVersionedTask(
      saveQueue.current,
      generation,
      () => replacementGeneration.current,
      async isCurrent => {
        if (conflictRef.current || durableToken.current === null) return
        const result = await persistence.current.save({
          expectedToken: durableToken.current,
          expectedPreviousRevision: durableRevision.current,
          workspace: envelope,
        })
        if (result.status !== 'saved') {
          handleConflict(result)
          return
        }
        // A superseded task still wrote storage: replacement awaits this queue and needs its new token.
        durableToken.current = result.token
        durableRevision.current = result.revision
        setSavedSnapshot(envelope)
        if (!isCurrent()) return
        setStatus('saved')
      },
    ).catch(error => {
      if (generation !== replacementGeneration.current) return
      runtimeRef.current.setCommandError(`Не удалось сохранить рабочее пространство: ${errorDetails(error)}`)
      setStatus('error')
    })
  }, [revision, compilationStatus])

  // Recency decides which candidate may start a write; activity keeps edits blocked until every request settles.
  const beginReplacement = (): number => {
    const attempt = ++replacementAttempt.current
    ++replacementActivity.current
    runtimeRef.current.setReplacementBusy(true)
    runtimeRef.current.setCommandError(null)
    return attempt
  }

  const finishReplacement = (): void => {
    --replacementActivity.current
    runtimeRef.current.setReplacementBusy(replacementActivity.current > 0)
  }

  const replaceEnvelope = async (
    envelope: PersistedWorkspaceEnvelope,
    success: string,
    attempt: number,
  ): Promise<boolean> => {
    if (conflictRef.current) return false
    try {
      const candidate = await EditorWorkspace.create(
        envelope.sources,
        compile,
        undefined,
        envelope.workspaceId,
        layoutsFromEnvelope(envelope),
        envelope.metadata.entryDocumentUri,
        envelope.revision,
      )
      if (attempt !== replacementAttempt.current) return false
      if (candidate.state.compilation.status !== 'valid') {
        runtime.setCommandError('Импорт отклонён: исправьте ошибки LikeC4 в импортируемом рабочем пространстве.')
        return false
      }
      // Keep retained-workspace autosaves alive until validation and all queued saves finish.
      let drained: Promise<void>
      do {
        drained = saveQueue.current
        await drained
      } while (drained !== saveQueue.current)
      if (attempt !== replacementAttempt.current || conflictRef.current) return false
      ++replacementGeneration.current
      let applied = false
      const replacement = saveQueue.current.then(async () => {
        if (attempt !== replacementAttempt.current || conflictRef.current) return
        if (!await persistFreshWorkspace(candidate.state)) return
        // Once storage commits, materialize that snapshot even if a newer attempt is validating.
        runtimeRef.current.workspace.current = candidate
        runtimeRef.current.restoreView?.(envelope.metadata.activeViewId)
        conflictRef.current = false
        hydrationComplete.current = true
        runtimeRef.current.setReadOnly(false)
        runtimeRef.current.refresh()
        if (attempt === replacementAttempt.current) runtimeRef.current.setFeedback(success)
        setStatus('saved')
        applied = true
      })
      // Serialization also covers in-flight replacements; a rejected write must not poison the queue.
      saveQueue.current = replacement.catch(() => {})
      await replacement
      return applied
    } catch (error) {
      if (attempt === replacementAttempt.current) {
        runtime.setCommandError(`Импорт отклонён: ${errorDetails(error)}`)
        setStatus('error')
      }
      return false
    }
  }

  const layoutIsSettled = (): boolean => {
    if (!runtimeRef.current.layoutPending) return true
    runtimeRef.current.setCommandError('Дождитесь сохранения положения элементов.')
    return false
  }

  const confirmReplacement = (): boolean => {
    if (conflictRef.current) return false
    if (!layoutIsSettled()) return false
    const state = runtime.workspace.current?.state
    if (!state || !shouldConfirmReplacement(state)) return true
    return window.confirm(
      'Импорт полностью заменит текущее рабочее пространство и сбросит историю отмены и повтора. Продолжить?',
    )
  }

  const importSource = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    let attempt: number | null = null
    try {
      if (!confirmReplacement()) return
      attempt = beginReplacement()
      if (file.size > 16 * 1024 * 1024) throw new Error('Файл превышает допустимый размер.')
      const content = await file.text()
      if (attempt !== replacementAttempt.current) return
      if (!content.length) throw new Error('Файл пуст.')
      await replaceEnvelope(
        {
          schema: workspaceSchema,
          version: workspaceVersion,
          workspaceId: 'default',
          revision: 0,
          savedAt: new Date().toISOString(),
          sources: [{ uri: 'model.c4', content }],
          manualLayouts: {},
          metadata: { entryDocumentUri: 'model.c4' },
        },
        'Файл .c4 импортирован. История изменений начата заново.',
        attempt,
      )
    } catch (error) {
      if (attempt === null || attempt === replacementAttempt.current) {
        runtimeRef.current.setCommandError(`Импорт .c4 отклонён: ${errorDetails(error)}`)
      }
    } finally {
      if (attempt !== null) finishReplacement()
      input.value = ''
    }
  }

  const createEmptyWorkspace = async (): Promise<boolean> => {
    if (conflictRef.current) return false
    if (!layoutIsSettled()) return false
    if (
      !window.confirm(
        'Новый проект заменит текущую работу и сбросит историю. Перед продолжением можно скачать ZIP проекта. Создать пустой проект?',
      )
    ) return false
    const attempt = beginReplacement()
    try {
      return await replaceEnvelope(
        {
          schema: workspaceSchema,
          version: workspaceVersion,
          workspaceId: 'default',
          revision: 0,
          savedAt: new Date().toISOString(),
          sources: [{ uri: 'model.c4', content: emptySource }],
          manualLayouts: {},
          metadata: { entryDocumentUri: 'model.c4' },
        },
        'Создан пустой проект. Добавьте первый элемент.',
        attempt,
      )
    } finally {
      finishReplacement()
    }
  }

  const importBundle = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    if (!file) return
    let attempt: number | null = null
    try {
      if (!confirmReplacement()) return
      attempt = beginReplacement()
      if (file.size > 16 * 1024 * 1024) throw new Error('ZIP превышает допустимый размер.')
      const bytes = await file.arrayBuffer()
      if (attempt !== replacementAttempt.current) return
      const envelope = importWorkspaceBundle(new Uint8Array(bytes))
      await replaceEnvelope(
        envelope,
        'Архив рабочего пространства импортирован. История изменений начата заново.',
        attempt,
      )
    } catch (error) {
      if (attempt === null || attempt === replacementAttempt.current) {
        runtimeRef.current.setCommandError(`Импорт ZIP отклонён: ${errorDetails(error)}`)
      }
    } finally {
      if (attempt !== null) finishReplacement()
      input.value = ''
    }
  }

  const exportBundle = (): void => {
    if (runtimeRef.current.layoutPending) {
      runtimeRef.current.setCommandError('Дождитесь сохранения положения элементов перед экспортом ZIP.')
      return
    }
    const state = runtimeRef.current.workspace.current?.state ?? runtimeRef.current.state
    if (!state?.lastValidModel) {
      runtimeRef.current.setCommandError(
        'Нет подтверждённой корректной версии для экспорта ZIP. Скачайте черновик .c4.',
      )
      return
    }
    try {
      const envelope = envelopeFromState(state)
      const viewId = runtimeRef.current.selectedViewId
      downloadBlob(
        exportWorkspaceBundle({
          ...envelope,
          metadata: { ...envelope.metadata, ...(viewId ? { activeViewId: viewId } : {}) },
        }),
        workspaceBundleFilename(),
      )
      runtimeRef.current.setFeedback(
        'ZIP последней корректной версии экспортирован. Текущий черновик скачивается отдельно.',
      )
    } catch (error) {
      runtimeRef.current.setCommandError(`Не удалось экспортировать рабочее пространство: ${errorDetails(error)}`)
    }
  }

  const exportDraft = (): void => {
    const state = runtimeRef.current.workspace.current?.state ?? runtimeRef.current.state
    const uri = runtimeRef.current.activeDocumentUri ?? state?.entryDocumentUri
    const source = state?.draftSources.find(source => source.uri === uri)
    if (!source) {
      runtimeRef.current.setCommandError('Выбранный документ черновика отсутствует.')
      return
    }
    try {
      downloadSource(source.content, source.uri)
      runtimeRef.current.setFeedback('Черновик .c4 скачан. Сохранённая корректная версия не изменена.')
    } catch (error) {
      runtimeRef.current.setCommandError(`Не удалось скачать черновик: ${errorDetails(error)}`)
    }
  }

  const reloadLatest = async (): Promise<boolean> => {
    if (
      !window.confirm(
        'Загрузка актуальной версии заменит всю локальную работу: исходные файлы, черновик, раскладку и историю отмены и повтора. Сначала экспортируйте ZIP корректной версии и отдельно скачайте черновик .c4. Продолжить?',
      )
    ) return false
    const attempt = beginReplacement()
    const generation = replacementGeneration.current
    const isCurrent = () => attempt === replacementAttempt.current && generation === replacementGeneration.current
    try {
      let drained: Promise<void>
      do {
        drained = saveQueue.current
        await drained
      } while (drained !== saveQueue.current)
      if (!isCurrent()) return false
      const loaded = await persistence.current.loadWithRecovery()
      if (!isCurrent()) return false
      if (loaded.status === 'empty') throw new Error('Сохранённое рабочее пространство отсутствует.')
      if (loaded.status === 'invalid') throw new Error(`${loaded.activeError} ${loaded.backupError}`)
      const envelope = loaded.workspace
      const candidate = await EditorWorkspace.create(
        envelope.sources,
        compile,
        undefined,
        envelope.workspaceId,
        layoutsFromEnvelope(envelope),
        envelope.metadata.entryDocumentUri,
        envelope.revision,
      )
      if (candidate.state.compilation.status !== 'valid') {
        throw new Error('Последняя сохранённая версия содержит ошибки LikeC4.')
      }
      if (!isCurrent()) return false
      let restoredEnvelope = envelope
      let restoredToken = loaded.token
      if (deriveDraftStatus(candidate.state, 'saved', envelope) !== 'saved') {
        restoredEnvelope = { ...envelopeFromState(candidate.state), metadata: envelope.metadata }
        // A later reload drains this write before reading its own durable token.
        const repair = saveQueue.current.then(async () => {
          if (!isCurrent()) return null
          return persistence.current.replace(restoredEnvelope, loaded.token)
        })
        saveQueue.current = repair.then(() => {}, () => {})
        const result = await repair
        if (result?.status === 'saved') {
          // A superseded task may still have committed: every successful write rotates the token.
          durableToken.current = result.token
          durableRevision.current = restoredEnvelope.revision
          setSavedSnapshot(restoredEnvelope)
        }
        if (!result || !isCurrent()) return false
        if (result.status !== 'saved') {
          handleConflict(result)
          return false
        }
        restoredToken = result.token
      }
      ++replacementGeneration.current
      runtime.workspace.current = candidate
      runtime.restoreView?.()
      durableRevision.current = envelope.revision
      durableToken.current = restoredToken
      setSavedSnapshot(restoredEnvelope)
      conflictRef.current = false
      runtime.setReadOnly(false)
      runtime.refresh()
      runtime.setCommandError(null)
      runtime.setFeedback('Актуальная версия рабочего пространства восстановлена.')
      setStatus('saved')
      return true
    } catch (error) {
      if (isCurrent()) {
        runtime.setCommandError(`Не удалось восстановить актуальную версию: ${errorDetails(error)}`)
      }
      return false
    } finally {
      finishReplacement()
    }
  }

  const draftStatus = deriveDraftStatus(state, status, savedSnapshot)
  const hasUnsavedDraft = state !== null && deriveDraftStatus(state, 'saved', savedSnapshot) !== 'saved'
  return {
    status,
    draftStatus,
    draftStatusMessage: durableDraftStatusMessages[draftStatus],
    hasUnsavedDraft,
    importSource,
    createEmptyWorkspace,
    importBundle,
    exportBundle,
    exportDraft,
    reloadLatest,
  }
}
