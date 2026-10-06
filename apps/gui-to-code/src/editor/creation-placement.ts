import type { CanvasPosition } from './contracts'

type Bounds = { readonly x: number; readonly y: number; readonly width: number; readonly height: number }

/** Geometry already held by a layouted view or its standard manual snapshot. */
export interface CreationPlacementNode extends Bounds {
  readonly id: string
  readonly parent?: string | null
  readonly children: readonly string[]
  readonly labelBBox?: Bounds
}

const gap = 24
// Match the renderer's compound containment padding.
const padding = { left: 42, right: 42, top: 60, bottom: 42 }

function visualBounds(node: CreationPlacementNode): Bounds {
  // Graphviz node labels are node-local and the renderer contains text inside the node.
  // Edge labels have a different coordinate contract and are not placement obstacles here.
  return node
}

function overlaps(a: Bounds, b: Bounds, clearance = gap): boolean {
  return a.x < b.x + b.width + clearance && a.x + a.width + clearance > b.x
    && a.y < b.y + b.height + clearance && a.y + a.height + clearance > b.y
}

function overlapArea(a: Bounds, b: Bounds): number {
  const width = Math.max(0, Math.min(a.x + a.width + gap, b.x + b.width + gap) - Math.max(a.x, b.x))
  const height = Math.max(0, Math.min(a.y + a.height + gap, b.y + b.height + gap) - Math.max(a.y, b.y))
  return width * height
}

/**
 * Places a newly created node near the requested absolute position without moving existing leaves.
 * Ancestor compounds are fitted around their children; all results remain standard snapshot node geometry.
 * Returns null for a missing node, invalid geometry, or an unsatisfiable existing compound arrangement.
 */
export function placeCreatedNode<N extends CreationPlacementNode>(
  nodes: readonly N[],
  createdId: string,
  requested: CanvasPosition,
): N[] | null {
  const created = nodes.find(node => node.id === createdId)
  if (!created || !Number.isFinite(requested.x) || !Number.isFinite(requested.y)) return null
  if (
    nodes.some(node =>
      ![node.x, node.y, node.width, node.height].every(Number.isFinite) || node.width < 0 || node.height < 0
      || (node.labelBBox !== undefined
        && (!Object.values(node.labelBBox).every(Number.isFinite)
          || node.labelBBox.width < 0 || node.labelBBox.height < 0))
    )
  ) return null

  const byId = new Map(nodes.map(node => [node.id, node]))
  const parentOf = new Map<string, string>()
  for (const node of nodes) {
    for (const child of node.children) parentOf.set(child, node.id)
    if (node.parent && byId.has(node.parent)) parentOf.set(node.id, node.parent)
  }
  const ancestors: string[] = []
  for (let id = parentOf.get(createdId); id; id = parentOf.get(id)) {
    if (id === createdId || ancestors.includes(id)) return null
    ancestors.push(id)
  }
  const related = (a: string, b: string): boolean => {
    const seen = new Set<string>()
    for (let id = parentOf.get(a); id && !seen.has(id); id = parentOf.get(id)) {
      if (id === b) return true
      seen.add(id)
    }
    return false
  }

  function candidate(position: CanvasPosition): N[] | null {
    const translated = (node: N, x: number, y: number, width = node.width, height = node.height): N => ({
      ...node,
      x,
      y,
      width,
      height,
    })
    const replacements = new Map<string, N>([[createdId, translated(created!, position.x, position.y)]])
    const dx = position.x - created!.x
    const dy = position.y - created!.y
    for (const descendant of nodes) {
      if (related(descendant.id, createdId)) {
        replacements.set(descendant.id, translated(descendant, descendant.x + dx, descendant.y + dy))
      }
    }
    for (const id of ancestors) {
      const parent = byId.get(id)
      if (!parent) return null
      const children = nodes.filter(node => parentOf.get(node.id) === id)
        .map(node => visualBounds(replacements.get(node.id) ?? node))
      const x = Math.min(...children.map(node => node.x - padding.left))
      const y = Math.min(...children.map(node => node.y - padding.top))
      const right = Math.max(...children.map(node => node.x + node.width + padding.right))
      const bottom = Math.max(...children.map(node => node.y + node.height + padding.bottom))
      replacements.set(id, translated(parent, x, y, right - x, bottom - y))
    }

    for (const [id, changed] of replacements) {
      for (const other of nodes) {
        if (id === other.id || related(id, other.id) || related(other.id, id)) continue
        const obstacle = replacements.get(other.id) ?? other
        if (!overlaps(visualBounds(changed), visualBounds(obstacle))) continue
        // Existing tight geometry is retained only when expansion does not increase its collision.
        if (
          id !== createdId
          && !overlaps(visualBounds(changed), visualBounds(obstacle), 0)
          && overlapArea(visualBounds(changed), visualBounds(obstacle))
            <= overlapArea(visualBounds(byId.get(id)!), visualBounds(other))
        ) continue
        return null
      }
    }
    return nodes.map(node => replacements.get(node.id) ?? { ...node })
  }

  const exact = candidate(requested)
  if (exact) return exact

  const box = visualBounds(created)
  const leftOffset = box.x - created.x
  const topOffset = box.y - created.y
  const ancestorPaddingX = ancestors.length * Math.max(padding.left, padding.right)
  const ancestorPaddingY = ancestors.length * Math.max(padding.top, padding.bottom)
  const xs = new Set([requested.x])
  const ys = new Set([requested.y])
  for (const node of nodes) {
    if (node.id === createdId || related(createdId, node.id) || related(node.id, createdId)) continue
    const obstacle = visualBounds(node)
    xs.add(obstacle.x + obstacle.width + gap - leftOffset + ancestorPaddingX)
    xs.add(obstacle.x - box.width - gap - leftOffset - ancestorPaddingX)
    ys.add(obstacle.y + obstacle.height + gap - topOffset + ancestorPaddingY)
    ys.add(obstacle.y - box.height - gap - topOffset - ancestorPaddingY)
  }
  const positions = [...xs].flatMap(x => [...ys].map(y => ({ x, y })))
    .sort((a, b) =>
      (a.x - requested.x) ** 2 + (a.y - requested.y) ** 2
        - ((b.x - requested.x) ** 2 + (b.y - requested.y) ** 2)
      || a.y - b.y || a.x - b.x
    )
  for (const position of positions) {
    const result = candidate(position)
    if (result) return result
  }
  return null
}

/** Place newly visible subtrees against retained manual geometry, preserving every existing leaf. */
export function placeNewlyVisibleNodes<N extends CreationPlacementNode>(
  nodes: readonly N[],
  previous: readonly CreationPlacementNode[],
): N[] | null {
  const retained = new Set(previous.map(node => node.id))
  const added = new Set(nodes.filter(node => !retained.has(node.id)).map(node => node.id))
  let positioned = [...nodes]
  const descendants = (id: string): readonly N[] => {
    const childIds = new Set(positioned.find(node => node.id === id)?.children ?? [])
    for (const child of childIds) {
      positioned.find(node => node.id === child)?.children.forEach(id => childIds.add(id))
    }
    return positioned.filter(node => childIds.has(node.id))
  }
  const movable = new Set(
    positioned.filter(node =>
      added.has(node.id)
      && !descendants(node.id).some(child => retained.has(child.id))
    ).map(node => node.id),
  )
  const roots = positioned.filter(node =>
    movable.has(node.id)
    && !positioned.some(parent => movable.has(parent.id) && parent.children.includes(node.id))
  )
  for (const root of roots) {
    const next = placeCreatedNode(positioned, root.id, root)
    if (!next) return null
    positioned = next
  }
  return positioned
}
