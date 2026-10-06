import type { ViewId, ViewManualLayoutSnapshot } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import {
  manualLayoutsStorageKey,
  parseSnapshot,
  parseSnapshotText,
  readStoredManualLayouts,
  serializeSnapshot,
  snapshotPath,
  writeStoredManualLayouts,
} from './layout-snapshots'

function snapshot(id = 'index'): ViewManualLayoutSnapshot {
  return {
    _stage: 'layouted',
    _type: 'element',
    id,
    hash: 'hash',
    autoLayout: { direction: 'TB' },
    bounds: { x: 0, y: 0, width: 100, height: 100 },
    nodes: [{
      id: 'shop',
      parent: null,
      children: [],
      inEdges: [],
      outEdges: [],
      title: 'Shop',
      x: 10,
      y: 20,
      width: 80,
      height: 40,
    }],
    edges: [],
  } as unknown as ViewManualLayoutSnapshot
}

function dynamicSnapshot(id = 'flow'): ViewManualLayoutSnapshot<'dynamic'> {
  return {
    ...snapshot(id),
    _type: 'dynamic',
    sequenceLayout: {
      actors: [],
      steps: [],
      compounds: [],
      parallelAreas: [],
      subflows: [],
      bounds: { x: 0, y: 0, width: 0, height: 0 },
    },
  } as unknown as ViewManualLayoutSnapshot<'dynamic'>
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem(key: string) {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string) {
      data.set(key, value)
    },
    value(key: string) {
      return data.get(key)
    },
  }
}

describe('manual layout snapshot persistence', () => {
  it('round-trips canonical per-view files in a versioned envelope', () => {
    const storage = memoryStorage()
    writeStoredManualLayouts(storage, { index: snapshot() } as Record<ViewId, ViewManualLayoutSnapshot>)

    const stored = JSON.parse(storage.value(manualLayoutsStorageKey)!)
    expect(stored).toMatchObject({ version: 1 })
    expect(stored.files[snapshotPath('index' as ViewId)]).toMatchObject({ id: 'index' })
    expect(readStoredManualLayouts(storage)).toEqual({
      layouts: { index: snapshot() },
      diagnostics: [],
    })
  })

  it('fails closed on malformed or unsupported envelopes', () => {
    expect(readStoredManualLayouts(memoryStorage({
      [manualLayoutsStorageKey]: '{bad json',
    }))).toMatchObject({ layouts: {}, diagnostics: [expect.stringContaining('повреждены')] })

    expect(readStoredManualLayouts(memoryStorage({
      [manualLayoutsStorageKey]: JSON.stringify({ version: 2, files: {} }),
    }))).toMatchObject({ layouts: {}, diagnostics: [expect.stringContaining('не поддерживается')] })
  })

  it('keeps valid snapshots when another file is malformed', () => {
    const storage = memoryStorage({
      [manualLayoutsStorageKey]: JSON.stringify({
        version: 1,
        files: {
          [snapshotPath('index' as ViewId)]: snapshot(),
          [snapshotPath('broken' as ViewId)]: { id: 'broken' },
        },
      }),
    })
    const result = readStoredManualLayouts(storage)

    expect(result.layouts['index' as ViewId]).toEqual(snapshot())
    expect(result.layouts['broken' as ViewId]).toBeUndefined()
    expect(result.diagnostics).toHaveLength(1)
  })

  it('rejects wrong-view and wrong-stage imports', () => {
    expect(parseSnapshot(snapshot('other'), 'index' as ViewId)).toEqual({
      ok: false,
      message: 'Раскладка принадлежит другому виду.',
    })
    expect(parseSnapshot({ ...snapshot(), _stage: 'computed' }, 'index' as ViewId)).toEqual({
      ok: false,
      message: 'Раскладка должна иметь stage «layouted».',
    })
  })

  it('serializes and parses the standard snapshot payload', () => {
    const original = snapshot()
    const parsed = parseSnapshotText(serializeSnapshot(original), 'index' as ViewId, 'element')
    expect(parsed).toEqual({ ok: true, snapshot: original })
  })

  it.each([
    { controlPoints: { x: 20, y: 30 } },
    { controlPoints: [{ x: Number.NaN, y: 30 }] },
    { controlPoints: [{ x: 20 }] },
    { labelBBox: { x: 20, y: 30, width: -1, height: 18 } },
  ])('rejects malformed route data before rendering: %j', patch => {
    expect(parseSnapshot({
      ...snapshot(),
      edges: [{
        id: 'relation',
        source: 'shop',
        target: 'shop',
        points: [[0, 0]],
        ...patch,
      }],
    })).toMatchObject({ ok: false, message: expect.stringContaining('связи') })
  })

  it('rejects dynamic snapshots without valid sequence layout data', () => {
    const original = dynamicSnapshot()
    const { sequenceLayout: _sequenceLayout, ...missing } = original
    expect(parseSnapshot(missing, 'flow' as ViewId)).toMatchObject({
      ok: false,
      message: expect.stringContaining('sequenceLayout'),
    })

    expect(
      parseSnapshot({ ...original, sequenceLayout: { ...original.sequenceLayout, actors: [{}] } }, 'flow' as ViewId),
    )
      .toMatchObject({
        ok: false,
        message: expect.stringContaining('sequenceLayout'),
      })
  })
})
