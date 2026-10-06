import type {
  Fqn,
  LayoutType,
  ViewId,
} from '@likec4/core/types'
import { createLikeC4Editor } from '@likec4/diagram'
import type { DiagramApi, LikeC4EditorCallbacks } from '@likec4/diagram'
import type { ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { compile } from '../compiler'
import { starterSource } from '../document'
import { currentAutoLayout } from './auto-layout-cache'
import type { AutoLayoutCache } from './auto-layout-cache'
import type {
  CommandResult,
  EditorCommand,
  EditorWorkspaceState,
  LayoutCommand,
} from './contracts'
import { locateElementSource } from './element-source'
import { downloadLayout } from './file-downloads'
import { parseSnapshotText, snapshotFromLayout } from './layout-snapshots'
import { mutationDisabledReason } from './mutation-availability'
import {
  readPreferredDocument,
  reconcileSourceDocument,
  rememberDocument,
  sourceWithOriginalLineEndings,
} from './source-documents'
import type { SourceLocation } from './source-documents'
import { reconcileActiveView, viewOptions } from './ui/view-selection'
import { readPreferredView, rememberView } from './view-preferences'
import { EditorWorkspace } from './workspace'

export const workspaceDocumentUri = 'model.c4'

export function useWorkspaceRuntime() {
  const workspace = useRef<EditorWorkspace | null>(null)
  const semanticGuard = useRef<((command: EditorCommand) => string | null) | null>(null)
  const sequence = useRef(0)
  const editor = useRef<LikeC4EditorCallbacks | null>(null)
  const [state, setState] = useState<EditorWorkspaceState | null>(null)
  const [autoModel, setAutoModel] = useState<AutoLayoutCache | null>(null)
  const [activeViewId, setActiveViewId] = useState<ViewId | null>(null)
  const [layoutMode, setLayoutMode] = useState<LayoutType>('manual')
  const [busy, updateBusy] = useState(false)
  const [readOnly, updateReadOnly] = useState(false)
  const busyRef = useRef(false)
  const operationBusyRef = useRef(false)
  const replacementBusyRef = useRef(false)
  const readOnlyRef = useRef(false)
  const refreshBusy = (): void => {
    busyRef.current = operationBusyRef.current || replacementBusyRef.current
    updateBusy(busyRef.current)
  }
  const setBusy = (value: boolean): void => {
    operationBusyRef.current = value
    refreshBusy()
  }
  // Replacement and command cleanup cannot release each other's mutation lock.
  const setReplacementBusy = (value: boolean): void => {
    replacementBusyRef.current = value
    refreshBusy()
  }
  const setReadOnly = (value: boolean): void => {
    readOnlyRef.current = value
    updateReadOnly(value)
  }
  const [commandError, setCommandError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null)
  const [layoutPending, setLayoutPending] = useState(false)
  const layoutPendingRef = useRef(false)
  const layoutObserver = useRef<{ unsubscribe: () => void } | null>(null)
  const sourceNavigation = useRef<{ owner: EditorWorkspace; uri: string } | null>(null)
  const [, refreshDocumentSelection] = useState(0)
  const [sourceReveal, setSourceReveal] = useState<{ owner: EditorWorkspace; location: SourceLocation } | null>(null)
  const sourceLookupSequence = useRef(0)

  const selectedDocumentUri = (): string => {
    const current = workspace.current
    if (!current) return workspaceDocumentUri
    const preferred = sourceNavigation.current?.owner === current
      ? sourceNavigation.current.uri
      : readPreferredDocument(current.state.projectId)
    return reconcileSourceDocument(preferred, current.state.draftSources, current.state.entryDocumentUri)
  }

  const selectDocument = (uri: string): boolean => {
    const current = workspace.current
    if (!current?.state.draftSources.some(source => source.uri === uri)) return false
    sourceLookupSequence.current++
    sourceNavigation.current = { owner: current, uri }
    rememberDocument(current.state.projectId, uri)
    setSourceReveal(null)
    refreshDocumentSelection(value => value + 1)
    return true
  }

  const openElementSource = async (element: Fqn, isSelected: () => boolean = () => true): Promise<boolean> => {
    const current = workspace.current
    if (!current || current.state.compilation.status !== 'valid') {
      setCommandError('Сначала исправьте ошибки в исходниках, затем откройте объявление элемента.')
      return false
    }
    const capturedState = current.state
    const lookup = ++sourceLookupSequence.current
    try {
      const location = await locateElementSource(capturedState.committedSources, element)
      if (
        workspace.current !== current || current.state !== capturedState || lookup !== sourceLookupSequence.current
        || !isSelected()
      ) return false
      if (!location) {
        setCommandError('Объявление элемента не найдено в файлах проекта.')
        return false
      }
      selectDocument(location.uri)
      setSourceReveal({ owner: current, location })
      return true
    } catch {
      if (
        workspace.current !== current || current.state !== capturedState || lookup !== sourceLookupSequence.current
        || !isSelected()
      ) return false
      setCommandError('Не удалось открыть исходник элемента. Повторите действие.')
      return false
    }
  }
  useEffect(() => () => layoutObserver.current?.unsubscribe(), [])
  const observeLayout = (diagram: DiagramApi): void => {
    layoutObserver.current?.unsubscribe()
    layoutObserver.current = diagram.editorActor().subscribe(snapshot => {
      const pending = snapshot.hasTag('pending') || snapshot.hasTag('busy')
      layoutPendingRef.current = pending
      setLayoutPending(pending)
    })
  }

  const nextOperationId = (): number => Date.now() * 1000 + (++sequence.current % 1000)

  const assertMutationAvailable = (fromRenderer = false): boolean => {
    if (!fromRenderer && layoutPendingRef.current) {
      setCommandError('Дождитесь сохранения положения элементов.')
      return false
    }
    const reason = mutationDisabledReason(workspace.current?.state ?? null, readOnlyRef.current, busyRef.current)
    if (!reason) return true
    setCommandError(reason)
    return false
  }

  useEffect(() => {
    let cancelled = false
    void EditorWorkspace.create(
      [{ uri: workspaceDocumentUri, content: starterSource }],
      compile,
      undefined,
      'default',
      {},
      workspaceDocumentUri,
    ).then(created => {
      if (cancelled) return
      workspace.current = created
      setState(created.state)
      setPersistenceNotice(null)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!state) return
    const views = Object.values(state.lastValidModel?.$data.views ?? {})
    setActiveViewId(previous => reconcileActiveView(previous, views))
    const id = reconcileActiveView(activeViewId, views)
    setLayoutMode(id && state.manualLayouts[id] ? 'manual' : 'auto')
  }, [state, activeViewId])

  useEffect(() => {
    const owner = workspace.current
    const revision = state?.revision
    const committedSources = state?.committedSources
    if (!owner || revision === undefined || !committedSources || layoutMode !== 'auto') {
      setAutoModel(null)
      return
    }
    let cancelled = false
    void compile({ revision, sources: committedSources }).then(result => {
      if (cancelled || workspace.current !== owner || result.revision !== revision || !result.model) return
      setAutoModel({ owner, revision, sources: committedSources, model: result.model })
    })
    return () => {
      cancelled = true
    }
  }, [layoutMode, state?.committedSources, state?.revision])

  const refresh = (): EditorWorkspaceState | null => {
    const current = workspace.current?.state ?? null
    if (!current) return null
    setState(current)
    return current
  }

  const updateDraftSource = (content: string, onSettled?: (state: EditorWorkspaceState) => void): void => {
    const current = workspace.current
    if (!current || readOnlyRef.current || busyRef.current || layoutPendingRef.current) {
      setCommandError('Редактирование сейчас недоступно. Дождитесь действия или загрузите актуальную версию.')
      return
    }
    setCommandError(null)
    setFeedback(null)
    const uri = selectedDocumentUri()
    const original = current.state.committedSources.find(source => source.uri === uri)?.content ?? ''
    const sources = current.state.draftSources.map(source =>
      source.uri === uri ? { ...source, content: sourceWithOriginalLineEndings(original, content) } : source
    )
    if (!sources.some(source => source.uri === uri)) {
      setCommandError('Выбранный файл отсутствует в проекте.')
      return
    }
    const pending = current.updateDraft(sources)
    refresh()
    void pending.then(() => {
      if (workspace.current !== current) return
      const next = refresh()
      if (next) onSettled?.(next)
    })
  }

  const finishResult = (result: CommandResult, fallback: string): EditorWorkspaceState | null => {
    const next = refresh()
    if (
      next && result.status === 'applied'
      && (result.command === 'history.undo' || result.command === 'history.redo' || result.command === 'history.goto')
    ) {
      const id = selectedViewId()
      setLayoutMode(id && next.manualLayouts[id] ? 'manual' : 'auto')
    }
    if (result.status === 'conflict') {
      setCommandError('Проект изменился. Повторите действие на актуальной версии.')
    } else if (result.status === 'rejected') {
      setCommandError(result.issues[0]?.message ?? fallback)
    } else {
      setCommandError(null)
    }
    return next
  }

  const dispatchSemantic = async (command: EditorCommand, fallback: string): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!assertMutationAvailable() || !current) return null
    const guarded = semanticGuard.current?.(command)
    if (guarded) {
      setCommandError(guarded)
      return null
    }
    setBusy(true)
    setCommandError(null)
    try {
      const result = await current.dispatch({
        id: nextOperationId(),
        expectedRevision: current.state.revision,
        semantic: command,
      })
      if (workspace.current !== current) return null
      finishResult(result, fallback)
      return result
    } catch (error) {
      if (workspace.current !== current) return null
      setCommandError(`${fallback} ${error instanceof Error ? error.message : String(error)}`)
      return null
    } finally {
      setBusy(false)
    }
  }

  const dispatchLayout = async (layout: LayoutCommand, fromRenderer = false): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!assertMutationAvailable(fromRenderer) || !current) return null
    setBusy(true)
    setCommandError(null)
    try {
      const result = await current.dispatch({
        id: nextOperationId(),
        expectedRevision: current.state.revision,
        layout,
      })
      if (workspace.current !== current) return null
      finishResult(result, 'Не удалось изменить раскладку.')
      return result
    } catch {
      if (workspace.current !== current) return null
      setCommandError('Не удалось изменить раскладку. Повторите действие.')
      return null
    } finally {
      setBusy(false)
    }
  }

  const undo = async (): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!assertMutationAvailable() || !current) return null
    setBusy(true)
    try {
      const result = await current.undo(current.state.revision)
      finishResult(result, 'Не удалось отменить изменение.')
      if (result.status === 'applied') setFeedback('Изменение отменено.')
      return result
    } finally {
      setBusy(false)
    }
  }

  const redo = async (): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!assertMutationAvailable() || !current) return null
    setBusy(true)
    try {
      const result = await current.redo(current.state.revision)
      finishResult(result, 'Не удалось повторить изменение.')
      if (result.status === 'applied') setFeedback('Изменение повторено.')
      return result
    } finally {
      setBusy(false)
    }
  }

  const goToHistory = async (index: number, expectedRevision: number): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!assertMutationAvailable() || !current) return null
    setBusy(true)
    setCommandError(null)
    try {
      const result = await current.goToHistory(index, expectedRevision)
      if (workspace.current !== current) return null
      finishResult(result, 'Не удалось перейти к состоянию из истории.')
      if (result.status === 'applied') setFeedback('Состояние из истории восстановлено.')
      return result
    } finally {
      setBusy(false)
    }
  }

  if (!editor.current) {
    editor.current = createLikeC4Editor({
      supportedChanges: ['save-view-snapshot', 'reset-manual-layout'],
      onError() {
        setFeedback(null)
        setCommandError(
          'Не удалось обновить раскладку. Сохранённая версия проекта доступна; повторите действие или выберите автоматическую раскладку.',
        )
      },
      async fetchView(viewId, layout = 'manual') {
        const current = workspace.current
        if (!current) throw new Error('Редактор ещё не загружен.')
        if (layout === 'auto') {
          const result = await compile({
            revision: current.state.revision,
            sources: current.state.committedSources,
          })
          const view = result.model?.$data.views[viewId]
          if (!view) throw new Error(`Вид ${viewId} больше не существует.`)
          return view
        }
        const view = current.state.lastValidModel?.findView(viewId)?.$layouted
        if (!view) throw new Error(`Вид ${viewId} больше не существует.`)
        return view
      },
      async handleChange(viewId, change) {
        switch (change.op) {
          case 'save-view-snapshot': {
            const result = await dispatchLayout({
              type: 'layout.save',
              input: { viewId, snapshot: snapshotFromLayout(change.layout) },
            }, true)
            if (result?.status === 'applied') {
              setLayoutMode('manual')
              setFeedback('Ручная раскладка сохранена.')
            } else throw new Error('Не удалось сохранить ручную раскладку.')
            return
          }
          case 'reset-manual-layout': {
            const result = await dispatchLayout({ type: 'layout.reset', input: { viewId } })
            if (result?.status === 'applied') {
              setLayoutMode('auto')
              setFeedback('Ручная раскладка сброшена.')
            }
            return
          }
          case 'change-element-style':
          case 'change-autolayout':
          case 'change-property':
            setCommandError('Изменение оформления через эту панель пока недоступно.')
            return
        }
      },
    })
  }

  const createView = async (scope: Fqn | null, id: string, title: string): Promise<boolean> => {
    const result = await dispatchSemantic({
      type: 'view.create',
      input: {
        ...(id.trim() ? { id: id.trim() } : {}),
        ...(scope ? { viewOf: scope } : {}),
        ...(title ? { title } : {}),
        documentUri: workspace.current?.state.entryDocumentUri ?? workspaceDocumentUri,
      },
    }, 'Не удалось создать вид.')
    if (result?.status === 'applied' && result.command === 'view.create') {
      selectView(result.createdViewId)
      setLayoutMode('auto')
      setFeedback(`Создан вид ${result.createdViewId}.`)
      return true
    }
    return false
  }

  const selectView = (viewId: ViewId): void => {
    setActiveViewId(viewId)
    const projectId = workspace.current?.state.projectId
    if (projectId) rememberView(projectId, viewId)
    setLayoutMode(workspace.current?.state.manualLayouts[viewId] ? 'manual' : 'auto')
  }

  const restoreView = (importedViewId?: string): void => {
    const current = workspace.current?.state
    if (!current) return
    const preferred = importedViewId ?? readPreferredView(current.projectId)
    const id = reconcileActiveView(preferred as ViewId | null, Object.values(current.lastValidModel?.$data.views ?? {}))
    if (id) selectView(id)
  }

  const resetLayout = async (): Promise<void> => {
    const viewId = selectedViewId()
    if (!viewId) return
    const result = await dispatchLayout({ type: 'layout.reset', input: { viewId } })
    if (result?.status === 'applied') {
      setLayoutMode('auto')
      setFeedback('Ручная раскладка сброшена.')
    }
  }

  const importLayout = async (event: ChangeEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget
    const file = input.files?.[0]
    const current = workspace.current
    const viewId = selectedViewId()
    if (!file || !current || !viewId) return
    const view = current.state.lastValidModel?.$data.views[viewId]
    if (!view) return
    try {
      const parsed = parseSnapshotText(await file.text(), viewId, view._type)
      if (!parsed.ok) {
        setCommandError(parsed.message)
        return
      }
      const result = await dispatchLayout({
        type: 'layout.save',
        input: { viewId, snapshot: parsed.snapshot },
      })
      if (result?.status === 'applied') {
        setLayoutMode('manual')
        setFeedback('Ручная раскладка импортирована.')
      }
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setCommandError(`Не удалось импортировать раскладку: ${detail}`)
    } finally {
      input.value = ''
    }
  }

  const exportLayout = (): void => {
    const current = workspace.current
    const viewId = selectedViewId()
    if (!current || !viewId) return
    const snapshot = current.state.manualLayouts[viewId]
    if (snapshot) downloadLayout(snapshot)
  }

  const manualRenderModel = state?.compilation.model ?? state?.lastValidModel ?? null
  const renderModel = layoutMode === 'auto'
    ? currentAutoLayout(autoModel, workspace.current, state) ?? manualRenderModel
    : manualRenderModel
  const views = viewOptions(Object.values(renderModel?.$data.views ?? {}))
  const selectedId = reconcileActiveView(activeViewId, views)
  const selectedView = views.find(view => view.id === selectedId) ?? null

  function selectedViewId(): ViewId | null {
    const currentViews = Object.values(workspace.current?.state.lastValidModel?.$data.views ?? {})
    return reconcileActiveView(activeViewId, currentViews)
  }

  const activeDocumentUri = selectedDocumentUri()

  return {
    workspace,
    semanticGuard,
    state,
    source: state?.draftSources.find(source => source.uri === activeDocumentUri)?.content ?? '',
    activeDocumentUri,
    selectDocument,
    openElementSource,
    sourceReveal: sourceReveal?.owner === workspace.current ? sourceReveal.location : null,
    entryDocumentUri: state?.entryDocumentUri ?? workspaceDocumentUri,
    renderModel,
    views,
    selectedView,
    selectedViewId: selectedId,
    layoutMode,
    layoutPending,
    observeLayout,
    restoreView,
    busy,
    readOnly,
    mutationDisabledReason: mutationDisabledReason(state, readOnly, busy),
    assertMutationAvailable,
    commandError,
    feedback,
    persistenceNotice,
    editor: editor.current,
    hasManualLayout: !!(state && selectedId && state.manualLayouts[selectedId]),
    setFeedback,
    setCommandError,
    setBusy,
    setReplacementBusy,
    setReadOnly,
    setLayoutMode: (mode: LayoutType): void => {
      if (mode === 'auto') void resetLayout()
      else setLayoutMode(mode)
    },
    refresh,
    updateDraftSource,
    dispatchSemantic,
    finishResult,
    undo,
    redo,
    goToHistory,
    createView,
    selectView,
    resetLayout,
    importLayout,
    exportLayout,
  }
}
