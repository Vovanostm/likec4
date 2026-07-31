import type { LayoutedView, ViewId } from '@likec4/core/types'

export function reconcileActiveView(
  activeViewId: ViewId | null,
  views: readonly LayoutedView[],
): ViewId | null {
  if (activeViewId && views.some(view => view.id === activeViewId)) return activeViewId
  const index = views.find(view => view.id === 'index')
  if (index) return index.id
  return views[0]?.id ?? null
}

export function viewOptions(views: readonly LayoutedView[]): readonly LayoutedView[] {
  return [...views].sort((left, right) => {
    if (left.id === 'index') return -1
    if (right.id === 'index') return 1
    return left.id.localeCompare(right.id)
  })
}
