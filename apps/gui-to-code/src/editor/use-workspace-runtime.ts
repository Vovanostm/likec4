import type {
  Fqn,
  LayoutType,
  ViewId,
} from '@likec4/core/types'
import { createLikeC4Editor } from '@likec4/diagram'
import type { LikeC4EditorCallbacks } from '@likec4/diagram'
import type { ChangeEvent } from 'react'
import { useEffect, useRef, useState } from 'react'
import { compile } from '../compiler'
import { starterSource } from '../document'
import type {
  CommandResult,
  EditorCommand,
  EditorWorkspaceState,
  LayoutCommand,
} from './contracts'
import { downloadLayout } from './file-downloads'
import {
  parseSnapshotText,
  readStoredManualLayouts,
  snapshotFromLayout,
  writeStoredManualLayouts,
} from './layout-snapshots'
import { reconcileActiveView, viewOptions } from './ui/view-selection'
import { EditorWorkspace } from './workspace'

const sourceStorageKey = 'likec4.gui-to-code.source.v1'
export const workspaceDocumentUri = 'model.c4'

export function useWorkspaceRuntime() {
  const workspace = useRef<EditorWorkspace | null>(null)
  const sequence = useRef(0)
  const editor = useRef<LikeC4EditorCallbacks | null>(null)
  const [state, setState] = useState<EditorWorkspaceState | null>(null)
  const [autoModel, setAutoModel] = useState<EditorWorkspaceState['lastValidModel']>(null)
  const [activeViewId, setActiveViewId] = useState<ViewId | null>(null)
  const [layoutMode, setLayoutMode] = useState<LayoutType>('manual')
  const [busy, setBusy] = useState(false)
  const [commandError, setCommandError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [persistenceNotice, setPersistenceNotice] = useState<string | null>(null)

  const nextOperationId = (): number => Date.now() * 1000 + (++sequence.current % 1000)

  useEffect(() => {
    let cancelled = false
    const stored = readStoredManualLayouts(localStorage)
    setPersistenceNotice(stored.diagnostics.length > 0 ? stored.diagnostics.join(' ') : null)
    const source = localStorage.getItem(sourceStorageKey) ?? starterSource
    void EditorWorkspace.create(
      [{ uri: workspaceDocumentUri, content: source }],
      compile,
      undefined,
      'default',
      stored.layouts,
    ).then(created => {
      if (cancelled) return
      workspace.current = created
      setState(created.state)
    })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!state) return
    const views = Object.values(state.lastValidModel?.$data.views ?? {})
    setActiveViewId(previous => reconcileActiveView(previous, views))
  }, [state])

  useEffect(() => {
    if (!state || layoutMode !== 'auto') {
      setAutoModel(null)
      return
    }
    let cancelled = false
    const revision = state.revision
    void compile({ revision, sources: state.committedSources }).then(result => {
      if (cancelled || result.revision !== revision || !result.model) return
      setAutoModel(result.model)
    })
    return () => {
      cancelled = true
    }
  }, [layoutMode, state?.revision])

  const refresh = (): EditorWorkspaceState | null => {
    const current = workspace.current?.state ?? null
    if (!current) return null
    setState(current)
    try {
      localStorage.setItem(sourceStorageKey, current.draftSources[0]?.content ?? '')
      writeStoredManualLayouts(localStorage, current.manualLayouts)
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error)
      setPersistenceNotice(`Не удалось сохранить проект в браузере: ${detail}`)
    }
    return current
  }

  const updateDraftSource = (content: string, onSettled?: (state: EditorWorkspaceState) => void): void => {
    const current = workspace.current
    if (!current) return
    setCommandError(null)
    setFeedback(null)
    const pending = current.updateDraft([{ uri: workspaceDocumentUri, content }])
    refresh()
    void pending.then(() => {
      const next = refresh()
      if (next) onSettled?.(next)
    })
  }

  const finishResult = (result: CommandResult, fallback: string): EditorWorkspaceState | null => {
    const next = refresh()
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
    if (!current) return null
    setBusy(true)
    setCommandError(null)
    try {
      const result = await current.dispatch({
        id: nextOperationId(),
        expectedRevision: current.state.revision,
        semantic: command,
      })
      finishResult(result, fallback)
      return result
    } finally {
      setBusy(false)
    }
  }

  const dispatchLayout = async (layout: LayoutCommand): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!current) return null
    setBusy(true)
    setCommandError(null)
    try {
      const result = await current.dispatch({
        id: nextOperationId(),
        expectedRevision: current.state.revision,
        layout,
      })
      finishResult(result, 'Не удалось изменить раскладку.')
      return result
    } finally {
      setBusy(false)
    }
  }

  const undo = async (): Promise<CommandResult | null> => {
    const current = workspace.current
    if (!current) return null
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
    if (!current) return null
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

  if (!editor.current) {
    editor.current = createLikeC4Editor({
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
            })
            if (result?.status === 'applied') {
              setLayoutMode('manual')
              setFeedback('Ручная раскладка сохранена.')
            }
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
            setFeedback('Эта операция редактора вида не входит в текущий пакет WP-05.')
            return
        }
      },
    })
  }

  const createView = async (scope: Fqn, id: string, title: string): Promise<boolean> => {
    const result = await dispatchSemantic({
      type: 'view.create',
      input: {
        id,
        viewOf: scope,
        ...(title ? { title } : {}),
        documentUri: workspaceDocumentUri,
      },
    }, 'Не удалось создать вид.')
    if (result?.status === 'applied' && result.command === 'view.create') {
      setActiveViewId(result.createdViewId)
      setLayoutMode('auto')
      setFeedback(`Создан вид ${result.createdViewId}.`)
      return true
    }
    return false
  }

  const selectView = (viewId: ViewId): void => {
    setActiveViewId(viewId)
    setLayoutMode(workspace.current?.state.manualLayouts[viewId] ? 'manual' : 'auto')
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
  const renderModel = layoutMode === 'auto' ? autoModel ?? manualRenderModel : manualRenderModel
  const views = viewOptions(Object.values(renderModel?.$data.views ?? {}))
  const selectedId = reconcileActiveView(activeViewId, views)
  const selectedView = views.find(view => view.id === selectedId) ?? null

  function selectedViewId(): ViewId | null {
    const currentViews = Object.values(workspace.current?.state.lastValidModel?.$data.views ?? {})
    return reconcileActiveView(activeViewId, currentViews)
  }

  return {
    workspace,
    state,
    source: state?.draftSources[0]?.content ?? '',
    renderModel,
    views,
    selectedView,
    selectedViewId: selectedId,
    layoutMode,
    busy,
    commandError,
    feedback,
    persistenceNotice,
    editor: editor.current,
    hasManualLayout: !!(state && selectedId && state.manualLayouts[selectedId]),
    setFeedback,
    setCommandError,
    setBusy,
    setLayoutMode,
    refresh,
    updateDraftSource,
    dispatchSemantic,
    finishResult,
    undo,
    redo,
    createView,
    selectView,
    resetLayout,
    importLayout,
    exportLayout,
  }
}