import type { ViewManualLayoutSnapshot } from '@likec4/core/types'

export type MultiNodeLayoutAction =
  | 'align-left'
  | 'align-center-horizontal'
  | 'align-right'
  | 'align-top'
  | 'align-center-vertical'
  | 'align-bottom'
  | 'distribute-horizontal'
  | 'distribute-vertical'

interface SnapshotNode {
  readonly id: string
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

/**
 * Produces one standard manual-layout snapshot for a multi-node gesture.
 *
 * The transform deliberately knows nothing about the semantic model. The caller
 * submits the returned snapshot as a single `layout.save` EditorWorkspace
 * operation, so alignment/distribution is one history entry and never mutates
 * LikeC4 DSL.
 */
export function transformSelectedNodes(
  snapshot: ViewManualLayoutSnapshot,
  selectedIds: ReadonlySet<string>,
  action: MultiNodeLayoutAction,
): ViewManualLayoutSnapshot {
  const selected = (snapshot.nodes as readonly SnapshotNode[]).filter(node => selectedIds.has(node.id))
  const minimum = action.startsWith('distribute-') ? 3 : 2
  if (selected.length < minimum) return snapshot

  const updates = new Map<string, { x: number; y: number }>()
  const left = Math.min(...selected.map(node => node.x))
  const right = Math.max(...selected.map(node => node.x + node.width))
  const top = Math.min(...selected.map(node => node.y))
  const bottom = Math.max(...selected.map(node => node.y + node.height))
  const horizontalCenter = (left + right) / 2
  const verticalCenter = (top + bottom) / 2

  switch (action) {
    case 'align-left':
      selected.forEach(node => updates.set(node.id, { x: left, y: node.y }))
      break
    case 'align-center-horizontal':
      selected.forEach(node => updates.set(node.id, { x: horizontalCenter - node.width / 2, y: node.y }))
      break
    case 'align-right':
      selected.forEach(node => updates.set(node.id, { x: right - node.width, y: node.y }))
      break
    case 'align-top':
      selected.forEach(node => updates.set(node.id, { x: node.x, y: top }))
      break
    case 'align-center-vertical':
      selected.forEach(node => updates.set(node.id, { x: node.x, y: verticalCenter - node.height / 2 }))
      break
    case 'align-bottom':
      selected.forEach(node => updates.set(node.id, { x: node.x, y: bottom - node.height }))
      break
    case 'distribute-horizontal': {
      const ordered = [...selected].sort((a, b) => a.x - b.x || a.id.localeCompare(b.id))
      const occupied = ordered.reduce((sum, node) => sum + node.width, 0)
      const gap = Math.max(0, (right - left - occupied) / (ordered.length - 1))
      let cursor = left
      for (const node of ordered) {
        updates.set(node.id, { x: cursor, y: node.y })
        cursor += node.width + gap
      }
      break
    }
    case 'distribute-vertical': {
      const ordered = [...selected].sort((a, b) => a.y - b.y || a.id.localeCompare(b.id))
      const occupied = ordered.reduce((sum, node) => sum + node.height, 0)
      const gap = Math.max(0, (bottom - top - occupied) / (ordered.length - 1))
      let cursor = top
      for (const node of ordered) {
        updates.set(node.id, { x: node.x, y: cursor })
        cursor += node.height + gap
      }
      break
    }
  }

  const next = structuredClone(snapshot) as ViewManualLayoutSnapshot
  for (const node of next.nodes as Array<SnapshotNode & { x: number; y: number }>) {
    const update = updates.get(node.id)
    if (!update) continue
    node.x = update.x
    node.y = update.y
  }
  return next
}

export function snapGridStep(value: number): number {
  if (!Number.isFinite(value)) return 16
  return Math.min(128, Math.max(4, Math.round(value)))
}
