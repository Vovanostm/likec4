import type { LayoutedView, ViewId } from '@likec4/core/types'

export function viewDisplayTitle(view: LayoutedView): string {
  if (view.id === 'index' && view.sourcePath === undefined) return 'Обзор архитектуры'
  return view.title && !['Untitled View', 'Landscape view'].includes(view.title)
    ? view.title
    : view._type === 'dynamic'
    ? 'Динамический вид'
    : view._type === 'deployment'
    ? 'Развёртывание'
    : 'Архитектура'
}

export function reconcileActiveView(
  activeViewId: ViewId | null,
  views: readonly LayoutedView[],
): ViewId | null {
  const available = viewOptions(views)
  if (activeViewId && available.some(view => view.id === activeViewId)) return activeViewId
  const index = available.find(view => view.id === 'index')
  if (index) return index.id
  return available[0]?.id ?? null
}

export function viewOptions(views: readonly LayoutedView[]): readonly LayoutedView[] {
  const authored = views.filter(view => view.id !== 'index' || view.sourcePath !== undefined)
  return [...(authored.length ? authored : views)].sort((left, right) => {
    if (left.id === 'index') return -1
    if (right.id === 'index') return 1
    return left.id.localeCompare(right.id)
  })
}
