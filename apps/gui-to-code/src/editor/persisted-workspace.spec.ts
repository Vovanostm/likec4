import type { ViewManualLayoutSnapshot } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import {
  maxWorkspaceBytes,
  validateWorkspaceEnvelope,
  workspaceSchema,
  workspaceVersion,
} from './persisted-workspace'
import { exportWorkspaceBundle, importWorkspaceBundle } from './workspace-bundle'
import { encodeZip } from './zip-store'

const encoder = new TextEncoder()

const snapshot = {
  _stage: 'layouted',
  _type: 'dynamic',
  id: 'flow',
  hash: 'hash',
  nodes: [],
  edges: [],
  bounds: { x: 0, y: 0, width: 0, height: 0 },
  autoLayout: { direction: 'LR' },
} as unknown as ViewManualLayoutSnapshot

const envelope = {
  schema: workspaceSchema,
  version: workspaceVersion,
  workspaceId: 'default',
  revision: 4,
  savedAt: '2026-08-03T00:00:00.000Z',
  sources: [
    { uri: 'model.c4', content: 'specification {}\nmodel {}\nviews {}\n' },
    { uri: 'nested/extra.c4', content: 'model {}\n' },
  ],
  manualLayouts: { flow: snapshot },
  metadata: { entryDocumentUri: 'model.c4' },
} as const

describe('workspace envelope', () => {
  it('accepts the current format', () => {
    expect(validateWorkspaceEnvelope(envelope).ok).toBe(true)
  })

  it('rejects future versions and unsafe source paths', () => {
    expect(validateWorkspaceEnvelope({ ...envelope, version: 2 }).ok).toBe(false)
    expect(validateWorkspaceEnvelope({
      ...envelope,
      sources: [{ uri: '../model.c4', content: 'model {}' }],
      metadata: { entryDocumentUri: '../model.c4' },
    }).ok).toBe(false)
  })

  it('rejects duplicate source paths case-insensitively', () => {
    expect(validateWorkspaceEnvelope({
      ...envelope,
      sources: [
        { uri: 'model.c4', content: 'model {}' },
        { uri: 'MODEL.c4', content: 'model {}' },
      ],
    }).ok).toBe(false)
  })

  it('rejects unsafe snapshot identifiers', () => {
    expect(validateWorkspaceEnvelope({
      ...envelope,
      manualLayouts: {
        '../flow': { ...snapshot, id: '../flow' },
      },
    }).ok).toBe(false)
  })

  it('counts the UTF-8 byte size instead of JavaScript code units', () => {
    const multibyte = 'я'.repeat(Math.floor(maxWorkspaceBytes / 2) + 1)
    expect(validateWorkspaceEnvelope({
      ...envelope,
      sources: [{ uri: 'model.c4', content: multibyte }],
      manualLayouts: {},
    }).ok).toBe(false)
  })
})

describe('workspace ZIP', () => {
  it('preserves sources and manual snapshots', async () => {
    const blob = exportWorkspaceBundle(envelope)
    const restored = importWorkspaceBundle(new Uint8Array(await blob.arrayBuffer()))
    expect(restored.sources).toEqual(envelope.sources)
    expect(restored.manualLayouts).toEqual(envelope.manualLayouts)
    expect(restored.metadata.entryDocumentUri).toBe('model.c4')
  })

  it('rejects source paths that collide with generated ZIP entries', () => {
    expect(() => exportWorkspaceBundle({
      ...envelope,
      sources: [{ uri: 'workspace.json', content: 'model {}' }],
      metadata: { entryDocumentUri: 'workspace.json' },
    })).toThrow(/повторяющийся путь/)
    expect(() => exportWorkspaceBundle({
      ...envelope,
      sources: [{ uri: '.likec4/flow.likec4.snap', content: 'model {}' }],
      metadata: { entryDocumentUri: '.likec4/flow.likec4.snap' },
    })).toThrow(/повторяющийся путь/)
  })

  it('rejects unknown manifest roles', () => {
    const manifest = {
      schema: workspaceSchema,
      version: workspaceVersion,
      entryDocumentUri: 'model.c4',
      exportedAt: '2026-08-03T00:00:00.000Z',
      files: [{ path: 'model.c4', role: 'executable' }],
    }
    const zip = encodeZip([
      { path: 'model.c4', content: encoder.encode('model {}') },
      { path: 'workspace.json', content: encoder.encode(JSON.stringify(manifest)) },
    ])
    expect(() => importWorkspaceBundle(zip)).toThrow(/структура workspace ZIP/)
  })
})
