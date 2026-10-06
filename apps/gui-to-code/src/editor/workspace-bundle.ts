import type { ViewManualLayoutSnapshot } from '@likec4/core/types'
import { parseSnapshot, viewIdFromSnapshotPath } from './layout-snapshots'
import type { PersistedWorkspaceEnvelope } from './persisted-workspace'
import { validateWorkspaceEnvelope, workspaceSchema, workspaceVersion } from './persisted-workspace'
import { decodeZip, encodeZip, normalizeZipPath } from './zip-store'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface WorkspaceManifestV1 {
  readonly schema: typeof workspaceSchema
  readonly version: typeof workspaceVersion
  readonly entryDocumentUri: string
  readonly activeViewId?: string
  readonly exportedAt: string
  readonly files: readonly {
    readonly path: string
    readonly role: 'source' | 'manual-layout'
  }[]
}

function isManifestFile(value: unknown): value is WorkspaceManifestV1['files'][number] {
  if (!value || typeof value !== 'object') return false
  const file = value as { path?: unknown; role?: unknown }
  return typeof file.path === 'string' && (file.role === 'source' || file.role === 'manual-layout')
}

export function exportWorkspaceBundle(envelope: PersistedWorkspaceEnvelope): Blob {
  const validated = validateWorkspaceEnvelope(envelope)
  if (!validated.ok) throw new Error(validated.message)
  const workspace = validated.envelope

  const files: WorkspaceManifestV1['files'][number][] = []
  const entries = workspace.sources.map(source => {
    files.push({ path: source.uri, role: 'source' })
    return { path: source.uri, content: encoder.encode(source.content) }
  })
  for (
    const [id, snapshot] of Object.entries(workspace.manualLayouts).sort(([left], [right]) => left.localeCompare(right))
  ) {
    const path = `.likec4/${id}.likec4.snap`
    files.push({ path, role: 'manual-layout' })
    entries.push({ path, content: encoder.encode(JSON.stringify(snapshot, null, 2)) })
  }
  const manifest: WorkspaceManifestV1 = {
    schema: workspaceSchema,
    version: workspaceVersion,
    entryDocumentUri: workspace.metadata.entryDocumentUri,
    ...(workspace.metadata.activeViewId ? { activeViewId: workspace.metadata.activeViewId } : {}),
    exportedAt: workspace.savedAt,
    files: files.sort((left, right) => left.path.localeCompare(right.path)),
  }
  entries.push({ path: 'workspace.json', content: encoder.encode(JSON.stringify(manifest, null, 2)) })
  const zip = encodeZip(entries)
  const buffer = zip.buffer.slice(zip.byteOffset, zip.byteOffset + zip.byteLength) as ArrayBuffer
  return new Blob([buffer], { type: 'application/zip' })
}

export function importWorkspaceBundle(bytes: Uint8Array, workspaceId = 'default'): PersistedWorkspaceEnvelope {
  const entries = decodeZip(bytes)
  const byPath = new Map(entries.map(entry => [entry.path, entry.content]))
  const manifestBytes = byPath.get('workspace.json')
  if (!manifestBytes) throw new Error('В ZIP отсутствует workspace.json.')
  let parsed: unknown
  try {
    parsed = JSON.parse(decoder.decode(manifestBytes))
  } catch {
    throw new Error('Manifest workspace.json повреждён.')
  }
  if (!parsed || typeof parsed !== 'object') throw new Error('Manifest workspace.json повреждён.')
  const manifest = parsed as Partial<WorkspaceManifestV1>
  if (
    manifest.schema !== workspaceSchema
    || manifest.version !== workspaceVersion
    || typeof manifest.entryDocumentUri !== 'string'
    || typeof manifest.exportedAt !== 'string'
    || (manifest.activeViewId !== undefined && typeof manifest.activeViewId !== 'string')
    || !Array.isArray(manifest.files)
    || !manifest.files.every(isManifestFile)
  ) {
    throw new Error('Версия или структура workspace ZIP не поддерживается.')
  }
  const declared = new Set(['workspace.json', ...manifest.files.map(file => normalizeZipPath(file.path))])
  if (
    declared.size !== manifest.files.length + 1
    || entries.some(entry => !declared.has(normalizeZipPath(entry.path)))
  ) {
    throw new Error('ZIP содержит файлы вне manifest или повторяющиеся пути.')
  }
  const sources: { uri: string; content: string }[] = []
  const manualLayouts = Object.create(null) as Record<string, ViewManualLayoutSnapshot>
  for (const file of manifest.files) {
    const content = byPath.get(file.path)
    if (!content) throw new Error(`В ZIP отсутствует ${file.path}.`)
    switch (file.role) {
      case 'source':
        sources.push({ uri: file.path, content: decoder.decode(content) })
        break
      case 'manual-layout': {
        const viewId = viewIdFromSnapshotPath(file.path)
        if (!viewId) throw new Error(`Некорректный путь snapshot: ${file.path}.`)
        try {
          const snapshot = JSON.parse(decoder.decode(content)) as unknown
          const parsedSnapshot = parseSnapshot(snapshot, viewId)
          if (!parsedSnapshot.ok) throw new Error(parsedSnapshot.message)
          manualLayouts[viewId] = parsedSnapshot.snapshot
        } catch {
          throw new Error(`Snapshot ${file.path} повреждён.`)
        }
        break
      }
    }
  }
  const candidate = {
    schema: workspaceSchema,
    version: workspaceVersion,
    workspaceId,
    revision: 0,
    savedAt: new Date().toISOString(),
    sources,
    manualLayouts,
    metadata: {
      entryDocumentUri: manifest.entryDocumentUri,
      ...(manifest.activeViewId ? { activeViewId: manifest.activeViewId } : {}),
    },
  }
  const validated = validateWorkspaceEnvelope(candidate)
  if (!validated.ok) throw new Error(validated.message)
  return validated.envelope
}

export function workspaceBundleFilename(date = new Date()): string {
  return `likec4-workspace-${date.toISOString().slice(0, 10)}.zip`
}
