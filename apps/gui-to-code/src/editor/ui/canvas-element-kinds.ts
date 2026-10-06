import type { ElementKind } from '@likec4/core/types'

export const canvasElementKinds = [
  ['actor' as ElementKind, 'Актор'],
  ['system' as ElementKind, 'Система'],
  ['component' as ElementKind, 'Компонент'],
  ['container' as ElementKind, 'Контейнер'],
  ['database' as ElementKind, 'База данных'],
  ['queue' as ElementKind, 'Очередь'],
] as const

/** Known keyboard mappings stay stable; the create catalogue follows the loaded specification. */
export function availableCanvasElementKinds(
  availableKinds: ReadonlySet<string>,
  titles: ReadonlyMap<string, string> = new Map(),
): readonly (readonly [ElementKind, string])[] {
  const labels = new Map<string, string>(canvasElementKinds)
  const known = canvasElementKinds.filter(([kind]) => availableKinds.has(kind))
  const custom = [...availableKinds].filter(kind => !labels.has(kind)).sort()
    .map(kind => [kind as ElementKind, titles.get(kind) || kind] as const)
  return [...known, ...custom]
}
