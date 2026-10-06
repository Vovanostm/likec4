import type {
  LayoutedDynamicView,
  LayoutedView,
  ViewId,
  ViewManualLayoutSnapshot,
  ViewType,
} from '@likec4/core/types'
import { isAutoLayoutDirection } from '@likec4/core/types'

export const manualLayoutsStorageKey = 'likec4.gui-to-code.manual-layouts.v1'
const snapshotPrefix = '.likec4/'
const snapshotSuffix = '.likec4.snap'

export interface StoredManualLayoutsV1 {
  readonly version: 1
  readonly files: Readonly<Record<string, unknown>>
}

export interface StoredManualLayoutsReadResult {
  readonly layouts: Readonly<Record<ViewId, ViewManualLayoutSnapshot>>
  readonly diagnostics: readonly string[]
}

export type SnapshotParseResult =
  | { readonly ok: true; readonly snapshot: ViewManualLayoutSnapshot }
  | { readonly ok: false; readonly message: string }

export function snapshotPath(viewId: ViewId): string {
  return `${snapshotPrefix}${viewId}${snapshotSuffix}`
}

export function snapshotFileName(viewId: ViewId): string {
  return `${viewId}${snapshotSuffix}`
}

export function snapshotFromLayout(layout: LayoutedView): ViewManualLayoutSnapshot {
  const snapshot: ViewManualLayoutSnapshot = structuredClone(layout)
  return snapshot
}

export function parseSnapshot(
  value: unknown,
  expectedViewId?: ViewId,
  expectedType?: ViewType,
): SnapshotParseResult {
  if (!isRecord(value)) return invalid('Файл раскладки должен содержать JSON-объект.')
  if (value['_stage'] !== 'layouted') return invalid('Раскладка должна иметь stage «layouted».')
  if (value['_type'] !== 'element' && value['_type'] !== 'dynamic' && value['_type'] !== 'deployment') {
    return invalid('Раскладка содержит неизвестный тип вида.')
  }
  if (typeof value['id'] !== 'string' || !value['id']) return invalid('В раскладке отсутствует ViewId.')
  if (expectedViewId && value['id'] !== expectedViewId) return invalid('Раскладка принадлежит другому виду.')
  if (expectedType && value['_type'] !== expectedType) return invalid('Тип раскладки не совпадает с выбранным видом.')
  if (typeof value['hash'] !== 'string' || !value['hash']) {
    return invalid('В раскладке отсутствует hash исходного layout.')
  }
  if (!isBounds(value['bounds'])) return invalid('Раскладка содержит некорректные bounds.')
  if (!isAutoLayout(value['autoLayout'])) return invalid('Раскладка содержит некорректный autoLayout.')
  if (!Array.isArray(value['nodes']) || !value['nodes'].every(isSnapshotNode)) {
    return invalid('Раскладка содержит некорректные узлы.')
  }
  if (!Array.isArray(value['edges']) || !value['edges'].every(isSnapshotEdge)) {
    return invalid('Раскладка содержит некорректные связи.')
  }
  if (value['_type'] === 'element' && !isElementSnapshotData(value)) {
    return invalid('Раскладка элемента содержит некорректные данные.')
  }
  if (value['_type'] === 'dynamic' && !isDynamicSnapshotData(value)) {
    return invalid('Динамическая раскладка содержит некорректный sequenceLayout.')
  }
  return { ok: true, snapshot: structuredClone(value) as ViewManualLayoutSnapshot }
}

export function parseSnapshotText(
  content: string,
  expectedViewId?: ViewId,
  expectedType?: ViewType,
): SnapshotParseResult {
  try {
    return parseSnapshot(JSON.parse(content), expectedViewId, expectedType)
  } catch {
    return invalid('Файл раскладки содержит некорректный JSON.')
  }
}

export function readStoredManualLayouts(storage: Pick<Storage, 'getItem'>): StoredManualLayoutsReadResult {
  const content = storage.getItem(manualLayoutsStorageKey)
  if (!content) return { layouts: {}, diagnostics: [] }
  let envelope: unknown
  try {
    envelope = JSON.parse(content)
  } catch {
    return { layouts: {}, diagnostics: ['Сохранённые раскладки повреждены и были проигнорированы.'] }
  }
  if (!isRecord(envelope) || envelope['version'] !== 1 || !isRecord(envelope['files'])) {
    return { layouts: {}, diagnostics: ['Версия сохранённых раскладок не поддерживается.'] }
  }

  const layouts = Object.create(null) as Record<ViewId, ViewManualLayoutSnapshot>
  const diagnostics: string[] = []
  for (const [path, value] of Object.entries(envelope['files'])) {
    const viewId = viewIdFromSnapshotPath(path)
    if (!viewId) {
      diagnostics.push(`Файл раскладки «${path}» имеет некорректный путь и был проигнорирован.`)
      continue
    }
    const parsed = parseSnapshot(value, viewId)
    if (!parsed.ok) {
      diagnostics.push(`Раскладка «${path}» проигнорирована: ${parsed.message}`)
      continue
    }
    layouts[viewId] = parsed.snapshot
  }
  return { layouts, diagnostics }
}

export function writeStoredManualLayouts(
  storage: Pick<Storage, 'setItem'>,
  layouts: Readonly<Record<ViewId, ViewManualLayoutSnapshot>>,
): void {
  const files = Object.create(null) as Record<string, unknown>
  for (const [id, snapshot] of Object.entries(layouts)) {
    files[snapshotPath(id as ViewId)] = snapshot
  }
  const envelope: StoredManualLayoutsV1 = { version: 1, files }
  storage.setItem(manualLayoutsStorageKey, JSON.stringify(envelope))
}

export function serializeSnapshot(snapshot: ViewManualLayoutSnapshot): string {
  return `${JSON.stringify(snapshot, null, 2)}\n`
}

export function downloadSnapshot(snapshot: ViewManualLayoutSnapshot): void {
  const url = URL.createObjectURL(new Blob([serializeSnapshot(snapshot)], { type: 'application/json' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = snapshotFileName(snapshot.id)
  anchor.click()
  URL.revokeObjectURL(url)
}

export function viewIdFromSnapshotPath(path: string): ViewId | null {
  if (!path.startsWith(snapshotPrefix) || !path.endsWith(snapshotSuffix)) return null
  const id = path.slice(snapshotPrefix.length, -snapshotSuffix.length)
  return id
      && id !== '.'
      && id !== '..'
      && id !== '__proto__'
      && id !== 'constructor'
      && id !== 'prototype'
      && !id.includes('/')
      && !id.includes('\\')
      && !id.includes('\0')
    ? id as ViewId
    : null
}

function invalid(message: string): SnapshotParseResult {
  return { ok: false, message }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNonNegativeFiniteNumber(value: unknown): value is number {
  return isFiniteNumber(value) && value >= 0
}

function isBounds(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value['x'])
    && isFiniteNumber(value['y'])
    && isNonNegativeFiniteNumber(value['width'])
    && isNonNegativeFiniteNumber(value['height'])
}

function isAutoLayout(value: unknown): boolean {
  if (!isRecord(value) || !isAutoLayoutDirection(value['direction'])) return false
  return (value['nodeSep'] === undefined || isNonNegativeFiniteNumber(value['nodeSep']))
    && (value['rankSep'] === undefined || isNonNegativeFiniteNumber(value['rankSep']))
}

function isSnapshotNode(value: unknown): boolean {
  return isRecord(value)
    && typeof value['id'] === 'string'
    && value['id'].length > 0
    && Array.isArray(value['children'])
    && value['children'].every(child => typeof child === 'string')
    && isFiniteNumber(value['x'])
    && isFiniteNumber(value['y'])
    && isNonNegativeFiniteNumber(value['width'])
    && isNonNegativeFiniteNumber(value['height'])
    && (value['labelBBox'] === undefined || isBounds(value['labelBBox']))
}

function isSnapshotEdge(value: unknown): boolean {
  return isRecord(value)
    && typeof value['id'] === 'string'
    && value['id'].length > 0
    && typeof value['source'] === 'string'
    && typeof value['target'] === 'string'
    && Array.isArray(value['points'])
    && value['points'].length > 0
    && value['points'].every(isSnapshotPoint)
    && (value['controlPoints'] == null
      || (Array.isArray(value['controlPoints']) && value['controlPoints'].length > 0
        && value['controlPoints'].every((point: unknown) =>
          isRecord(point) && isFiniteNumber(point['x']) && isFiniteNumber(point['y'])
        )))
    && (value['labelBBox'] == null || isBounds(value['labelBBox']))
}

function isSnapshotPoint(value: unknown): boolean {
  return Array.isArray(value)
    && value.length === 2
    && isFiniteNumber(value[0])
    && isFiniteNumber(value[1])
}

function isElementSnapshotData(value: Record<string, unknown>): boolean {
  return (value['viewOf'] === undefined || typeof value['viewOf'] === 'string')
    && (value['extends'] === undefined || typeof value['extends'] === 'string')
}

function isDynamicSnapshotData(value: Record<string, unknown>): boolean {
  return isSequenceLayout(value['sequenceLayout'])
}

function isSequenceLayout(value: unknown): value is LayoutedDynamicView.Sequence.Layout {
  return isRecord(value)
    && Array.isArray(value['actors'])
    && value['actors'].every(isSequenceActor)
    && Array.isArray(value['steps'])
    && value['steps'].every(isSequenceStep)
    && Array.isArray(value['compounds'])
    && value['compounds'].every(isSequenceCompound)
    && Array.isArray(value['parallelAreas'])
    && value['parallelAreas'].every(isSequenceParallelArea)
    && Array.isArray(value['subflows'])
    && value['subflows'].every(isSequenceSubflow)
    && isBounds(value['bounds'])
}

function isSequenceActor(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value['id'])
    && isFiniteBox(value)
    && Array.isArray(value['ports'])
    && value['ports'].every(isSequenceActorPort)
}

function isSequenceActorPort(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value['id'])
    && isFiniteNumber(value['cx'])
    && isFiniteNumber(value['cy'])
    && isNonNegativeFiniteNumber(value['height'])
    && (value['type'] === 'target' || value['type'] === 'source')
    && isSequencePortPosition(value['position'])
}

function isSequenceCompound(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value['id'])
    && isNonEmptyString(value['origin'])
    && isFiniteBox(value)
    && isFiniteNumber(value['depth'])
}

function isSequenceParallelArea(value: unknown): boolean {
  return isRecord(value)
    && typeof value['parallelPrefix'] === 'string'
    && isFiniteBox(value)
}

function isSequenceSubflow(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value['id'])
    && isFiniteBox(value)
}

function isSequenceStep(value: unknown): boolean {
  return isRecord(value)
    && isNonEmptyString(value['id'])
    && typeof value['sourceHandle'] === 'string'
    && typeof value['targetHandle'] === 'string'
    && (value['labelBBox'] === undefined || isLabelBox(value['labelBBox']))
    && (value['hidden'] === undefined || typeof value['hidden'] === 'boolean')
}

function isFiniteBox(value: Record<string, unknown>): boolean {
  return isFiniteNumber(value['x'])
    && isFiniteNumber(value['y'])
    && isNonNegativeFiniteNumber(value['width'])
    && isNonNegativeFiniteNumber(value['height'])
}

function isLabelBox(value: unknown): boolean {
  return isRecord(value)
    && isNonNegativeFiniteNumber(value['width'])
    && isNonNegativeFiniteNumber(value['height'])
}

function isSequencePortPosition(value: unknown): boolean {
  return value === 'left' || value === 'right' || value === 'top' || value === 'bottom'
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}
