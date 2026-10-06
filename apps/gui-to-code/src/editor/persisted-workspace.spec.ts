import type { ViewManualLayoutSnapshot } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import {
  maxWorkspaceBytes,
  validateWorkspaceEnvelope,
  workspaceSchema,
  workspaceVersion,
} from './persisted-workspace'
import { exportWorkspaceBundle, importWorkspaceBundle } from './workspace-bundle'
import { decodeZip, encodeZip } from './zip-store'

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
  sequenceLayout: {
    actors: [],
    steps: [],
    compounds: [],
    parallelAreas: [],
    subflows: [],
    bounds: { x: 0, y: 0, width: 0, height: 0 },
  },
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
    expect(
      validateWorkspaceEnvelope({
        ...envelope,
        sources: [{ uri: '../model.c4', content: 'model {}' }],
        metadata: { entryDocumentUri: '../model.c4' },
      }).ok,
    ).toBe(false)
  })

  it('rejects duplicate source paths case-insensitively', () => {
    expect(
      validateWorkspaceEnvelope({
        ...envelope,
        sources: [
          { uri: 'model.c4', content: 'model {}' },
          { uri: 'MODEL.c4', content: 'model {}' },
        ],
      }).ok,
    ).toBe(false)
  })

  it('rejects unsafe snapshot identifiers', () => {
    expect(
      validateWorkspaceEnvelope({
        ...envelope,
        manualLayouts: {
          '../flow': { ...snapshot, id: '../flow' },
        },
      }).ok,
    ).toBe(false)
    for (const id of ['__proto__', 'constructor', 'prototype']) {
      expect(
        validateWorkspaceEnvelope({
          ...envelope,
          manualLayouts: { [id]: { ...snapshot, id } },
        }).ok,
      ).toBe(false)
    }
  })

  it('rejects malformed snapshot shapes', () => {
    const result = validateWorkspaceEnvelope({
      ...envelope,
      manualLayouts: {
        flow: { ...snapshot, nodes: null },
      },
    })

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('Snapshot flow имеет неверный формат'),
    })
  })

  it('rejects dynamic snapshots without sequence layout', () => {
    const malformed = { ...snapshot, sequenceLayout: undefined }
    const result = validateWorkspaceEnvelope({
      ...envelope,
      manualLayouts: { flow: malformed },
    })

    expect(result).toMatchObject({
      ok: false,
      message: expect.stringContaining('sequenceLayout'),
    })
  })

  it('counts the UTF-8 byte size instead of JavaScript code units', () => {
    const multibyte = 'я'.repeat(Math.floor(maxWorkspaceBytes / 2) + 1)
    expect(
      validateWorkspaceEnvelope({
        ...envelope,
        sources: [{ uri: 'model.c4', content: multibyte }],
        manualLayouts: {},
      }).ok,
    ).toBe(false)
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

  it('preserves an explicit entry URI when deterministic ordering puts another source first', async () => {
    const input = {
      ...envelope,
      sources: [
        { uri: 'z.c4', content: 'model { entry }\n' },
        { uri: 'a.c4', content: 'model { auxiliary }\n' },
      ],
      manualLayouts: {},
      metadata: { entryDocumentUri: 'z.c4' },
    }
    const blob = exportWorkspaceBundle(input)
    const restored = importWorkspaceBundle(new Uint8Array(await blob.arrayBuffer()))

    expect(restored.sources).toEqual([
      { uri: 'a.c4', content: 'model { auxiliary }\n' },
      { uri: 'z.c4', content: 'model { entry }\n' },
    ])
    expect(restored.metadata.entryDocumentUri).toBe('z.c4')
  })

  it('round trips the optional preferred view without changing sources or layout schema', async () => {
    const input = { ...envelope, metadata: { ...envelope.metadata, activeViewId: 'detail_api' } }
    const blob = exportWorkspaceBundle(input)
    const restored = importWorkspaceBundle(new Uint8Array(await blob.arrayBuffer()))
    expect(restored.metadata.activeViewId).toBe('detail_api')
    expect(restored.sources).toEqual(envelope.sources)
    expect(restored.manualLayouts).toEqual(envelope.manualLayouts)
    expect(validateWorkspaceEnvelope({ ...input, metadata: { ...input.metadata, activeViewId: '../escape' } }).ok)
      .toBe(false)
  })

  it('rejects source paths that collide with generated ZIP entries', () => {
    expect(() =>
      exportWorkspaceBundle({
        ...envelope,
        sources: [{ uri: 'workspace.json', content: 'model {}' }],
        metadata: { entryDocumentUri: 'workspace.json' },
      })
    ).toThrow(/повторяющийся путь/)
    expect(() =>
      exportWorkspaceBundle({
        ...envelope,
        sources: [{ uri: '.likec4/flow.likec4.snap', content: 'model {}' }],
        metadata: { entryDocumentUri: '.likec4/flow.likec4.snap' },
      })
    ).toThrow(/повторяющийся путь/)
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

  it('rejects malformed manual-layout snapshots during import', () => {
    const manifest = {
      schema: workspaceSchema,
      version: workspaceVersion,
      entryDocumentUri: 'model.c4',
      exportedAt: '2026-08-03T00:00:00.000Z',
      files: [
        { path: 'model.c4', role: 'source' },
        { path: '.likec4/flow.likec4.snap', role: 'manual-layout' },
      ],
    }
    const zip = encodeZip([
      { path: 'model.c4', content: encoder.encode('model {}') },
      {
        path: '.likec4/flow.likec4.snap',
        content: encoder.encode(JSON.stringify({ ...snapshot, nodes: null })),
      },
      { path: 'workspace.json', content: encoder.encode(JSON.stringify(manifest)) },
    ])

    expect(() => importWorkspaceBundle(zip)).toThrow(/Snapshot \.likec4\/flow\.likec4\.snap повреждён\./)
  })

  it('rejects malformed dynamic snapshots during import', () => {
    const manifest = {
      schema: workspaceSchema,
      version: workspaceVersion,
      entryDocumentUri: 'model.c4',
      exportedAt: '2026-08-03T00:00:00.000Z',
      files: [
        { path: 'model.c4', role: 'source' },
        { path: '.likec4/flow.likec4.snap', role: 'manual-layout' },
      ],
    }
    const malformed = { ...snapshot, sequenceLayout: undefined }
    const zip = encodeZip([
      { path: 'model.c4', content: encoder.encode('model {}') },
      {
        path: '.likec4/flow.likec4.snap',
        content: encoder.encode(JSON.stringify(malformed)),
      },
      { path: 'workspace.json', content: encoder.encode(JSON.stringify(manifest)) },
    ])

    expect(() => importWorkspaceBundle(zip)).toThrow(/Snapshot \.likec4\/flow\.likec4\.snap повреждён\./)
  })

  it('rejects duplicate ZIP paths after normalization', () => {
    expect(() =>
      encodeZip([
        { path: 'model.c4', content: encoder.encode('model {}') },
        { path: 'MODEL.C4', content: encoder.encode('model {}') },
      ])
    ).toThrow(/повторяющийся путь/)
  })

  it('rejects trailing bytes after the ZIP end record', () => {
    const validZip = encodeZip([{ path: 'model.c4', content: encoder.encode('model {}') }])
    const withTrailingGarbage = new Uint8Array(validZip.length + 3)
    withTrailingGarbage.set(validZip)
    withTrailingGarbage.set([0xde, 0xad, 0xbe], validZip.length)

    expect(decodeZip(validZip)).toHaveLength(1)
    expect(() => decodeZip(withTrailingGarbage)).toThrow(/ZIP повреждён/)
  })
})
