import type { LayoutedView, ViewId } from '@likec4/core/types'
import { viewDisplayTitle, viewOptions } from './view-selection'

/** Display the containment level without relying on specification kind names or authored view IDs. */
export function viewLevelLabel(view: LayoutedView): string {
  if (view._type !== 'element') return viewDisplayTitle(view)
  return scopeLevelLabel(view.viewOf ?? null)
}

export function scopeLevelLabel(scopeId: string | null): string {
  if (!scopeId) return 'C1 · Контекст'
  switch (scopeId.split('.').length) {
    case 1:
      return 'C2 · Контейнеры'
    case 2:
      return 'C3 · Компоненты'
    default:
      return `Уровень ${scopeId.split('.').length + 1} · Детализация`
  }
}

/** Prefer a stable authored view of the exact selected element. */
export function findDetailView(views: readonly LayoutedView[], scopeId: string | null): LayoutedView | null {
  if (!scopeId) return null
  return viewOptions(views).find(view => view._type === 'element' && view.viewOf === scopeId) ?? null
}

/** Available ancestors form the breadcrumb; missing intermediate views are skipped. */
export function viewBreadcrumbs(
  views: readonly LayoutedView[],
  selectedViewId: ViewId | null,
): readonly LayoutedView[] {
  const current = views.find(view => view.id === selectedViewId)
  if (!current) return []
  if (current._type !== 'element' || !current.viewOf) return [current]
  const currentScope = current.viewOf
  const ancestors = new Map<string, LayoutedView>()
  for (const view of viewOptions(views)) {
    if (view._type !== 'element' || view.id === current.id) continue
    const scope = view.viewOf ?? ''
    if (scope && !currentScope.startsWith(`${scope}.`)) continue
    if (!ancestors.has(scope)) ancestors.set(scope, view)
  }
  return [
    ...[...ancestors.values()].sort((left, right) => {
      const depth = (view: LayoutedView) => view._type === 'element' && view.viewOf ? view.viewOf.split('.').length : 0
      return depth(left) - depth(right)
    }),
    current,
  ]
}
