import type { ViewManualLayoutSnapshot } from '@likec4/core/types'
import type { PersistedWorkspaceEnvelope } from './persisted-workspace'
import { validateWorkspaceEnvelope, workspaceSchema, workspaceVersion } from './persisted-workspace'
import { decodeZip, encodeZip } from './zip-store'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

interface WorkspaceManifestV1 {
  readonly schema: typeof workspaceSchema
  readonly version: typeof workspaceVersion
  readonly entryDocumentUri: string
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

  const files: WorkspaceManifestV1['files'][number][] = []
  const entries = envelope.sources.map(source => {
    files.push({ path: source.uri, role: 'source' })
    return { path: source.uri, content: encoder.encode(source.content) }
  })
  for (const [id, snapshot] of Object.entries(envelope.manualLayouts).sort(([left], [right]) => left.localeCompare(right))) {
    const path = `.likec4/${id}.likec4.snap`
    files.push({ path, role: 'manual-layout' })
    entries.push({ path, content: encoder.encode(JSON.stringify(snapshot, null, 2)) })
  }
  const manifest: WorkspaceManifestV1 = {
    schema: workspaceSchema,
    version: workspaceVersion,
    entryDocumentUri: envelope.metadata.entryDocumentUri,
    exportedAt: envelope.savedAt,
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
    || !Array.isArray(manifest.files)
    || !manifest.files.every(isManifestFile)
  ) {
    throw new Error('Версия или структура workspace ZIP не поддерживается.')
  }
  const declared = new Set(['workspace.json', ...manifest.files.map(file => file.path.toLocaleLowerCase())])
  if (
    declared.size !== manifest.files.length + 1
    || entries.some(entry => !declared.has(entry.path.toLocaleLowerCase()))
  ) {
    throw new Error('ZIP содержит файлы вне manifest или повторяющиеся пути.')
  }
  const sources: { uri: string; content: string }[] = []
  const manualLayouts: Record<string, ViewManualLayoutSnapshot> = {}
  for (const file of manifest.files) {
    const content = byPath.get(file.path)
    if (!content) throw new Error(`В ZIP отсутствует ${file.path}.`)
    switch (file.role) {
      case 'source':
        sources.push({ uri: file.path, content: decoder.decode(content) })
        break
      case 'manual-layout': {
        const match = /^\.likec4\/(.+)\.likec4\.snap$/.exec(file.path)
        if (!match?.[1]) throw new Error(`Некорректный путь snapshot: ${file.path}.`)
        try {
          manualLayouts[match[1]] = JSON.parse(decoder.decode(content)) as ViewManualLayoutSnapshot
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
    metadata: { entryDocumentUri: manifest.entryDocumentUri },
  }
  const validated = validateWorkspaceEnvelope(candidate)
  if (!validated.ok) throw new Error(validated.message)
  return validated.envelope
}

export function workspaceBundleFilename(date = new Date()): string {
  return `likec4-workspace-${date.toISOString().slice(0, 10)}.zip`
}
