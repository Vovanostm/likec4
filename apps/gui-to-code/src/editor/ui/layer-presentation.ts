import type { Fqn } from '@likec4/core/types'
import type { StructureNode } from './selection'

export interface LayerPresentation {
  readonly hiddenIds: ReadonlySet<Fqn>
  readonly lockedIds: ReadonlySet<Fqn>
  readonly inheritedHiddenIds: ReadonlySet<Fqn>
  readonly inheritedLockedIds: ReadonlySet<Fqn>
}

/**
 * Expand explicit presentation flags through the current semantic tree, without changing it.
 * The host keeps the explicit sets transient. Feed effective hiddenIds into native node.hidden
 * and incident edge.hidden; effective lockedIds disable native drag/connect and host edit commands.
 * Selection remains available in the tree. Do not save these sets in source, history or ZIP.
 */
export function deriveLayerPresentation(
  nodes: readonly StructureNode[],
  hiddenIds: ReadonlySet<Fqn>,
  lockedIds: ReadonlySet<Fqn>,
): LayerPresentation {
  const hidden = new Set<Fqn>()
  const locked = new Set<Fqn>()
  const inheritedHidden = new Set<Fqn>()
  const inheritedLocked = new Set<Fqn>()
  const visit = (branch: readonly StructureNode[], parentHidden: boolean, parentLocked: boolean): void => {
    for (const node of branch) {
      const isHidden = parentHidden || hiddenIds.has(node.id)
      const isLocked = parentLocked || lockedIds.has(node.id)
      if (isHidden) hidden.add(node.id)
      if (isLocked) locked.add(node.id)
      if (parentHidden) inheritedHidden.add(node.id)
      if (parentLocked) inheritedLocked.add(node.id)
      visit(node.children, isHidden, isLocked)
    }
  }
  visit(nodes, false, false)
  return {
    hiddenIds: hidden,
    lockedIds: locked,
    inheritedHiddenIds: inheritedHidden,
    inheritedLockedIds: inheritedLocked,
  }
}

/** An incident edge is hidden when either endpoint belongs to an effectively hidden subtree. */
export function isLayerEdgeHidden(source: Fqn, target: Fqn, hiddenIds: ReadonlySet<Fqn>): boolean {
  return hiddenIds.has(source) || hiddenIds.has(target)
}

/** Visible rows include hidden/locked layers; only collapsing a branch removes its descendants. */
export function visibleLayerIds(nodes: readonly StructureNode[], collapsedIds: ReadonlySet<Fqn>): readonly Fqn[] {
  return nodes.flatMap(
    node => [node.id, ...(collapsedIds.has(node.id) ? [] : visibleLayerIds(node.children, collapsedIds))],
  )
}

/** Find the actual tree ancestry, rather than assuming a string prefix is a semantic parent. */
export function layerAncestors(nodes: readonly StructureNode[], id: Fqn): readonly Fqn[] | null {
  for (const node of nodes) {
    if (node.id === id) return []
    const ancestors = layerAncestors(node.children, id)
    if (ancestors) return [node.id, ...ancestors]
  }
  return null
}
