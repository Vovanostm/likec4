import type {
  LayoutedView,
  ViewId,
  ViewManualLayoutSnapshot,
  ViewType,
} from '@likec4/core/types'

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
  if (typeof value['hash'] !== 'string') return invalid('В раскладке отсутствует hash исходного layout.')
  if (!isBounds(value['bounds'])) return invalid('Раскладка содержит некорректные bounds.')
  if (!isRecord(value['autoLayout'])) return invalid('Раскладка содержит некорректный autoLayout.')
  if (!Array.isArray(value['nodes']) || !value['nodes'].every(isSnapshotNode)) {
    return invalid('Раскладка содержит некорректные узлы.')
  }
  if (!Array.isArray(value['edges']) || !value['edges'].every(isSnapshotEdge)) {
    return invalid('Раскладка содержит некорректные связи.')
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
  } catch (_error) {
    return invalid('Файл раскладки содержит некорректный JSON.')
  }
}

export function readStoredManualLayouts(storage: Pick<Storage, 'getItem'>): StoredManualLayoutsReadResult {
  const content = storage.getItem(manualLayoutsStorageKey)
  if (!content) return { layouts: {}, diagnostics: [] }
  let envelope: unknown
  try {
    envelope = JSON.parse(content)
  } catch (_error) {
    return { layouts: {}, diagnostics: ['Сохранённые раскладки повреждены и были проигнорированы.'] }
  }
  if (!isRecord(envelope) || envelope['version'] !== 1 || !isRecord(envelope['files'])) {
    return { layouts: {}, diagnostics: ['Версия сохранённых раскладок не поддерживается.'] }
  }

  const layouts = {} as Record<ViewId, ViewManualLayoutSnapshot>
  const diagnostics: string[] = []
  for (const [path, value] of Object.entries(envelope['files'])) {
    const viewId = viewIdFromPath(path)
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
  const files: Record<string, unknown> = {}
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

function viewIdFromPath(path: string): ViewId | null {
  if (!path.startsWith(snapshotPrefix) || !path.endsWith(snapshotSuffix)) return null
  const id = path.slice(snapshotPrefix.length, -snapshotSuffix.length)
  return id && !id.includes('/') ? id as ViewId : null
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

function isBounds(value: unknown): boolean {
  return isRecord(value)
    && isFiniteNumber(value['x'])
    && isFiniteNumber(value['y'])
    && isFiniteNumber(value['width'])
    && isFiniteNumber(value['height'])
}

function isSnapshotNode(value: unknown): boolean {
  if (!isRecord(value)
    || typeof value['id'] !== 'string'
    || !isFiniteNumber(value['x'])
    || !isFiniteNumber(value['y'])
    || !isFiniteNumber(value['width'])
    || !isFiniteNumber(value['height'])) {
    return false
  }

  const children = value['children']
  return children === undefined
    || (Array.isArray(children) && children.every(child => typeof child === 'string'))
}

function isSnapshotEdge(value: unknown): boolean {
  return isRecord(value)
    && typeof value['id'] === 'string'
    && typeof value['source'] === 'string'
    && typeof value['target'] === 'string'
    && Array.isArray(value['points'])
}
