import type { ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import type { EditorWorkspaceState, SourceFile } from './contracts'

export const workspaceSchema = 'likec4.gui-to-code.workspace' as const
export const workspaceVersion = 1 as const
export const maxWorkspaceBytes = 16 * 1024 * 1024
export const maxWorkspaceFiles = 256

export interface PersistedWorkspaceEnvelopeV1 {
  readonly schema: typeof workspaceSchema
  readonly version: typeof workspaceVersion
  readonly workspaceId: string
  readonly revision: number
  readonly savedAt: string
  readonly sources: readonly SourceFile[]
  readonly manualLayouts: Readonly<Record<string, ViewManualLayoutSnapshot>>
  readonly metadata: {
    readonly entryDocumentUri: string
  }
}

export type PersistedWorkspaceEnvelope = PersistedWorkspaceEnvelopeV1

export type WorkspaceEnvelopeResult =
  | { readonly ok: true; readonly envelope: PersistedWorkspaceEnvelope }
  | { readonly ok: false; readonly message: string }

function safePath(path: string): boolean {
  if (!path || path.includes('\\') || path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false
  const parts = path.split('/')
  return parts.every(part => part !== '' && part !== '.' && part !== '..')
}

function isLayout(value: unknown): value is ViewManualLayoutSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<ViewManualLayoutSnapshot>
  return snapshot._stage === 'layouted'
    && (snapshot._type === 'element' || snapshot._type === 'dynamic' || snapshot._type === 'deployment')
    && typeof snapshot.id === 'string'
    && typeof snapshot.hash === 'string'
    && Array.isArray(snapshot.nodes)
    && Array.isArray(snapshot.edges)
    && !!snapshot.bounds
    && typeof snapshot.bounds === 'object'
    && !!snapshot.autoLayout
    && typeof snapshot.autoLayout === 'object'
}

export function envelopeFromState(state: EditorWorkspaceState): PersistedWorkspaceEnvelope {
  const sources = [...state.committedSources]
    .map(source => ({ uri: source.uri, content: source.content }))
    .sort((left, right) => left.uri.localeCompare(right.uri))
  const manualLayouts = Object.fromEntries(
    Object.entries(state.manualLayouts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([id, snapshot]) => [id, structuredClone(snapshot)]),
  )
  return {
    schema: workspaceSchema,
    version: workspaceVersion,
    workspaceId: state.projectId,
    revision: state.revision,
    savedAt: new Date().toISOString(),
    sources,
    manualLayouts,
    metadata: { entryDocumentUri: sources[0]?.uri ?? 'model.c4' },
  }
}

export function validateWorkspaceEnvelope(input: unknown): WorkspaceEnvelopeResult {
  if (!input || typeof input !== 'object') return { ok: false, message: 'Файл workspace имеет неверную структуру.' }
  const value = input as Partial<PersistedWorkspaceEnvelopeV1>
  if (value.schema !== workspaceSchema) return { ok: false, message: 'Неизвестный формат workspace.' }
  if (value.version !== workspaceVersion) return { ok: false, message: `Версия workspace ${String(value.version)} не поддерживается.` }
  if (typeof value.workspaceId !== 'string' || !value.workspaceId) return { ok: false, message: 'Не указан идентификатор workspace.' }
  if (!Number.isSafeInteger(value.revision) || (value.revision ?? -1) < 0) return { ok: false, message: 'Некорректная ревизия workspace.' }
  if (!Array.isArray(value.sources) || value.sources.length === 0 || value.sources.length > maxWorkspaceFiles) {
    return { ok: false, message: 'Workspace не содержит допустимого набора исходников.' }
  }
  const seen = new Set<string>()
  let size = 0
  for (const source of value.sources) {
    if (!source || typeof source.uri !== 'string' || typeof source.content !== 'string' || !safePath(source.uri)) {
      return { ok: false, message: 'Workspace содержит небезопасный путь исходника.' }
    }
    const key = source.uri.toLocaleLowerCase()
    if (seen.has(key)) return { ok: false, message: `Путь ${source.uri} встречается несколько раз.` }
    seen.add(key)
    size += source.content.length
  }
  const entry = value.metadata?.entryDocumentUri
  if (typeof entry !== 'string' || !value.sources.some(source => source.uri === entry)) {
    return { ok: false, message: 'Основной документ workspace отсутствует.' }
  }
  if (!value.manualLayouts || typeof value.manualLayouts !== 'object') return { ok: false, message: 'Некорректные snapshots workspace.' }
  for (const [id, snapshot] of Object.entries(value.manualLayouts)) {
    const path = `.likec4/${id}.likec4.snap`
    if (!safePath(path) || !isLayout(snapshot) || snapshot.id !== id) {
      return { ok: false, message: `Snapshot ${id} имеет неверный формат.` }
    }
    size += JSON.stringify(snapshot).length
  }
  if (size > maxWorkspaceBytes) return { ok: false, message: 'Workspace превышает допустимый размер.' }
  return { ok: true, envelope: value as PersistedWorkspaceEnvelopeV1 }
}

export function layoutsFromEnvelope(envelope: PersistedWorkspaceEnvelope): Readonly<Record<ViewId, ViewManualLayoutSnapshot>> {
  return envelope.manualLayouts as Readonly<Record<ViewId, ViewManualLayoutSnapshot>>
}
