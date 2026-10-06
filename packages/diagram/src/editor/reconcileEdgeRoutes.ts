import type { NonEmptyArray } from '@likec4/core'
import type { BBox, Point, XYPoint } from '@likec4/core/geometry'
import type { DiagramNode, LayoutedView } from '@likec4/core/types'
import { invariant } from '@likec4/core/utils'
import { curveCatmullRomOpen, line } from 'd3-shape'
import { hasAtLeast } from 'remeda'
import { calcViewBounds } from '../utils/view-bounds'
import { getNodeIntersectionFromCenterToPoint } from '../utils/xyflow'

export interface RouteNode extends BBox {
  readonly id: string
  readonly parent: string | null
  readonly children: readonly string[]
}

export interface RouteEdge {
  readonly id: string
  readonly source: string
  readonly target: string
  readonly dir?: 'forward' | 'back' | 'both' | undefined
  readonly points: NonEmptyArray<Point>
  readonly controlPoints?: readonly XYPoint[] | null | undefined
  readonly labelBBox?: BBox | null | undefined
  readonly isLabelCustomized?: boolean | undefined
}

const clearance = 8
const attachmentMargin = 6
const minimumRouteLength = 64
const curve = line<XYPoint>().curve(curveCatmullRomOpen.alpha(0.7)).x(p => Math.trunc(p.x)).y(p => Math.trunc(p.y))
const center = (box: BBox): XYPoint => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 })
const distance = (a: XYPoint, b: XYPoint) => Math.hypot(a.x - b.x, a.y - b.y)
const sameGeometry = (a: BBox, b: BBox) => a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height
const inside = (p: XYPoint, box: BBox) =>
  p.x > box.x && p.x < box.x + box.width && p.y > box.y && p.y < box.y + box.height
const expand = (box: BBox, amount: number): BBox => ({
  x: box.x - amount,
  y: box.y - amount,
  width: box.width + amount * 2,
  height: box.height + amount * 2,
})

function segmentIntersects(a: XYPoint, b: XYPoint, box: BBox): boolean {
  if (inside(a, box) || inside(b, box)) return true
  let low = 0, high = 1
  for (
    const [start, delta, min, max] of [
      [a.x, b.x - a.x, box.x, box.x + box.width],
      [a.y, b.y - a.y, box.y, box.y + box.height],
    ]
  ) {
    if (Math.abs(delta!) < 1e-9) {
      if (start! <= min! || start! >= max!) return false
      continue
    }
    const first = (min! - start!) / delta!
    const last = (max! - start!) / delta!
    low = Math.max(low, Math.min(first, last))
    high = Math.min(high, Math.max(first, last))
  }
  return low < high && high > 0 && low < 1
}

function cubicIntersects(points: readonly XYPoint[], box: BBox, depth = 0): boolean {
  const xs = points.map(p => p.x), ys = points.map(p => p.y)
  if (
    Math.max(...xs) <= box.x || Math.min(...xs) >= box.x + box.width
    || Math.max(...ys) <= box.y || Math.min(...ys) >= box.y + box.height
  ) return false
  if (points.some(p => inside(p, box)) && points.every(p => inside(p, box))) return true
  if (depth === 12) return true
  const [a, b, c, d] = points
  if (!a || !b || !c || !d) return false
  const mid = (p: XYPoint, q: XYPoint): XYPoint => ({ x: (p.x + q.x) / 2, y: (p.y + q.y) / 2 })
  const ab = mid(a, b), bc = mid(b, c), cd = mid(c, d)
  const abc = mid(ab, bc), bcd = mid(bc, cd), middle = mid(abc, bcd)
  return cubicIntersects([a, ab, abc, middle], box, depth + 1)
    || cubicIntersects([middle, bcd, cd, d], box, depth + 1)
}

/** The same Catmull-Rom path used by the relationship renderer for customized control points. */
function renderedPoints(edge: RouteEdge, source: RouteNode, target: RouteNode): Point[] {
  if (!edge.controlPoints?.length) return edge.points
  const start = edge.dir === 'back' ? target : source
  const end = edge.dir === 'back' ? source : target
  const handles = edge.controlPoints
  const path = curve([
    center(start),
    getNodeIntersectionFromCenterToPoint(start, handles[0]!, attachmentMargin),
    ...handles,
    getNodeIntersectionFromCenterToPoint(end, handles.at(-1)!, attachmentMargin),
    center(end),
  ])
  if (!path) return []
  return [...path.matchAll(/[MC]([^MC]+)/g)].flatMap(match => {
    const numbers = match[1]!.split(/[ ,]+/).map(Number)
    const points: Point[] = []
    for (let i = 0; i < numbers.length; i += 2) points.push([numbers[i]!, numbers[i + 1]!])
    return points
  })
}

function attached(point: Point | undefined, node: BBox): boolean {
  if (!point || !point.every(Number.isFinite)) return false
  const [x, y] = point
  const tolerance = 18
  if (
    x < node.x - tolerance || x > node.x + node.width + tolerance
    || y < node.y - tolerance || y > node.y + node.height + tolerance
  ) return false
  return Math.min(
    Math.abs(x - node.x),
    Math.abs(x - node.x - node.width),
    Math.abs(y - node.y),
    Math.abs(y - node.y - node.height),
  ) <= tolerance
}

function endpointDirections(points: readonly Point[], start: BBox, end: BBox): boolean {
  const outward = (point: Point | undefined, handles: readonly Point[], node: BBox) => {
    if (!point) return false
    const handle = handles.find(handle => Math.hypot(handle[0] - point[0], handle[1] - point[1]) > 0.01)
    if (!handle) return false
    const dx = handle[0] - point[0], dy = handle[1] - point[1]
    const sides = [
      { distance: Math.abs(point[0] - node.x), projection: -dx },
      { distance: Math.abs(point[0] - node.x - node.width), projection: dx },
      { distance: Math.abs(point[1] - node.y), projection: -dy },
      { distance: Math.abs(point[1] - node.y - node.height), projection: dy },
    ]
    const nearest = Math.min(...sides.map(side => side.distance))
    // Preserve angled Graphviz/control-point curves, but reject tangential or
    // inward arrows at the closest attachment side. Corners can use either normal.
    return sides.some(side => side.distance <= nearest + 0.01 && side.projection > 0.01)
  }
  return outward(points[0], points.slice(1), start)
    && outward(points.at(-1), points.slice(0, -1).reverse(), end)
}

function renderedLength(points: readonly Point[]): number {
  let length = 0
  for (let i = 0; i + 3 < points.length; i += 3) {
    const a = points[i]!, b = points[i + 1]!, c = points[i + 2]!, d = points[i + 3]!
    let previous = { x: a[0], y: a[1] }
    for (let step = 1; step <= 32; step++) {
      const t = step / 32, u = 1 - t
      const current = {
        x: u ** 3 * a[0] + 3 * u ** 2 * t * b[0] + 3 * u * t ** 2 * c[0] + t ** 3 * d[0],
        y: u ** 3 * a[1] + 3 * u ** 2 * t * b[1] + 3 * u * t ** 2 * c[1] + t ** 3 * d[1],
      }
      length += distance(previous, current)
      previous = current
    }
  }
  return length
}

function pathIntersects(points: readonly Point[], obstacles: readonly BBox[]): boolean {
  if (points.length < 4 || (points.length - 1) % 3 !== 0) return true
  for (let i = 0; i + 3 < points.length; i += 3) {
    const cubic = points.slice(i, i + 4).map(([x, y]) => ({ x, y }))
    // The convex hull bounds are invariant across obstacles. Reject distant boxes
    // before allocating subdivision bounds for the exact curve intersection.
    const xs = cubic.map(point => point.x), ys = cubic.map(point => point.y)
    const minX = Math.min(...xs), maxX = Math.max(...xs)
    const minY = Math.min(...ys), maxY = Math.max(...ys)
    if (
      obstacles.some(box =>
        maxX > box.x && minX < box.x + box.width && maxY > box.y && minY < box.y + box.height
        && cubicIntersects(cubic, box)
      )
    ) return true
  }
  return false
}

function simplify(points: readonly XYPoint[]): XYPoint[] {
  const result: XYPoint[] = []
  for (const point of points) {
    const last = result.at(-1)
    if (last && distance(last, point) < 0.01) continue
    const previous = result.at(-2)
    if (
      last && previous
      && Math.abs((last.x - previous.x) * (point.y - last.y) - (last.y - previous.y) * (point.x - last.x)) < 0.01
      && (last.x - previous.x) * (point.x - last.x) + (last.y - previous.y) * (point.y - last.y) >= 0
    ) {
      result.pop()
    }
    result.push(point)
  }
  return result
}

function hasBacktracking(points: readonly XYPoint[]): boolean {
  return points.slice(2).some((point, i) => {
    const a = points[i]!, b = points[i + 1]!
    const dx = b.x - a.x, dy = b.y - a.y
    const nx = point.x - b.x, ny = point.y - b.y
    return Math.abs(dx * ny - dy * nx) < 0.01 && dx * nx + dy * ny < 0
  })
}

interface Port {
  point: XYPoint
  stem: XYPoint
  preference: number
}

type Side = 0 | 1 | 2 | 3 // top, right, bottom, left
const sides: readonly Side[] = [0, 1, 2, 3]

function sideToward(node: BBox, neighbor: BBox): Side {
  const from = center(node), to = center(neighbor)
  const dx = (to.x - from.x) / Math.max(1, node.width)
  const dy = (to.y - from.y) / Math.max(1, node.height)
  return Math.abs(dx) > Math.abs(dy) ? dx > 0 ? 1 : 3 : dy > 0 ? 2 : 0
}

function port(node: BBox, side: Side, fraction: number, preference: number): Port {
  const x = node.x + node.width * fraction, y = node.y + node.height * fraction
  switch (side) {
    case 0:
      return {
        point: { x, y: node.y - attachmentMargin },
        stem: { x, y: node.y - clearance - attachmentMargin },
        preference,
      }
    case 1:
      return {
        point: { x: node.x + node.width + attachmentMargin, y },
        stem: { x: node.x + node.width + clearance + attachmentMargin, y },
        preference,
      }
    case 2:
      return {
        point: { x, y: node.y + node.height + attachmentMargin },
        stem: { x, y: node.y + node.height + clearance + attachmentMargin },
        preference,
      }
    case 3:
      return {
        point: { x: node.x - attachmentMargin, y },
        stem: { x: node.x - clearance - attachmentMargin, y },
        preference,
      }
  }
}

function gridRoute(start: XYPoint, end: XYPoint, obstacles: readonly BBox[]): XYPoint[] | null {
  const xs = [...new Set([start.x, end.x, ...obstacles.flatMap(box => [box.x - 1, box.x + box.width + 1])])]
    .sort((a, b) => a - b)
  const ys = [...new Set([start.y, end.y, ...obstacles.flatMap(box => [box.y - 1, box.y + box.height + 1])])]
    .sort((a, b) => a - b)
  const width = xs.length
  const index = (point: XYPoint) => ys.indexOf(point.y) * width + xs.indexOf(point.x)
  const at = (id: number): XYPoint => ({ x: xs[id % width]!, y: ys[Math.floor(id / width)]! })
  const first = index(start), last = index(end)
  const pending = [first], costs = new Map([[first, 0]]), previous = new Map<number, number>()
  const visited = new Set<number>()
  while (pending.length > 0) {
    pending.sort((a, b) => (costs.get(b)! + distance(at(b), end)) - (costs.get(a)! + distance(at(a), end)))
    const current = pending.pop()!
    if (visited.has(current)) continue
    if (current === last) {
      const result = [end]
      for (let cursor = last; cursor !== first;) {
        cursor = previous.get(cursor)!
        result.push(at(cursor))
      }
      return result.reverse()
    }
    visited.add(current)
    const x = current % width, y = Math.floor(current / width)
    const neighbors = [
      x > 0 ? current - 1 : -1,
      x + 1 < width ? current + 1 : -1,
      y > 0 ? current - width : -1,
      y + 1 < ys.length ? current + width : -1,
    ]
    for (const next of neighbors) {
      if (next < 0 || visited.has(next)) continue
      const a = at(current), b = at(next)
      if (obstacles.some(box => segmentIntersects(a, b, box))) continue
      const cost = costs.get(current)! + distance(a, b)
      if (cost >= (costs.get(next) ?? Infinity)) continue
      costs.set(next, cost)
      previous.set(next, current)
      pending.push(next)
    }
  }
  return null
}

function route(
  source: RouteNode,
  target: RouteNode,
  obstacles: readonly BBox[],
  startPorts: readonly Port[],
  endPorts: readonly Port[],
  accept: (points: readonly XYPoint[]) => boolean,
  label: BBox | null | undefined,
): XYPoint[] | null {
  const routingObstacles = obstacles.map(box => expand(box, clearance + 2))
  // A containing endpoint is not an obstacle to a relationship with its own descendant.
  const contains = (a: BBox, b: BBox) =>
    b.x >= a.x && b.y >= a.y && b.x + b.width <= a.x + a.width && b.y + b.height <= a.y + a.height
  if (source === target || !contains(source, target)) routingObstacles.push(source)
  if (source !== target && !contains(target, source)) routingObstacles.push(target)
  const xs = [
    ...new Set(routingObstacles.flatMap(
      box => [
        box.x - 1,
        box.x + box.width + 1,
        ...(label ? [box.x - label.width / 2 - 20, box.x + box.width + label.width / 2 + 20] : []),
      ],
    )),
  ]
  const ys = [
    ...new Set(routingObstacles.flatMap(
      box => [
        box.y - 1,
        box.y + box.height + 1,
        ...(label ? [box.y - label.height / 2 - 20, box.y + box.height + label.height / 2 + 20] : []),
      ],
    )),
  ]
  let best: XYPoint[] | null = null
  let cost = Infinity
  // Try the closest facing ports first. Middle segments may be diagonal, so
  // Euclidean distance is a lower bound for every accepted route.
  const portPairs = startPorts.flatMap(startPort =>
    endPorts.map(endPort => ({
      startPort,
      endPort,
      lowerBound: distance(startPort.point, endPort.point)
        + startPort.preference + endPort.preference + 16,
    }))
  ).sort((a, b) => a.lowerBound - b.lowerBound)
  for (const { startPort, endPort, lowerBound } of portPairs) {
    if (lowerBound >= cost) continue
    const start = startPort.stem, end = endPort.stem
    if (distance(startPort.point, endPort.point) < 1) continue
    const candidates = [
      [startPort.point, endPort.point],
      [start, end],
      [start, { x: end.x, y: start.y }, end],
      [start, { x: start.x, y: end.y }, end],
      ...xs.map(x => [start, { x, y: start.y }, { x, y: end.y }, end]),
      ...ys.map(y => [start, { x: start.x, y }, { x: end.x, y }, end]),
    ]
    for (const candidate of candidates) {
      const points = simplify([startPort.point, ...candidate, endPort.point])
      if (hasBacktracking(points)) continue
      // Simplification may merge a stem only when the resulting tangent retains its cardinal normal.
      const first = points[1]!, last = points.at(-2)!
      const outward = (port: Port, next: XYPoint) => {
        const dx = port.stem.x - port.point.x, dy = port.stem.y - port.point.y
        return Math.abs(dx * (next.y - port.point.y) - dy * (next.x - port.point.x)) < 0.01
          && dx * (next.x - port.point.x) + dy * (next.y - port.point.y) > 0
      }
      if (!outward(startPort, first) || !outward(endPort, last)) continue
      const length = points.slice(1).reduce((total, point, i) => total + distance(points[i]!, point), 0)
      const candidateCost = length + points.length * 8 + startPort.preference + endPort.preference
      if (length < minimumRouteLength || candidateCost >= cost) continue
      if (
        points.slice(1).some((point, i) => routingObstacles.some(box => segmentIntersects(points[i]!, point, box)))
      ) continue
      if (!accept(points)) continue
      best = points
      cost = candidateCost
    }
  }
  if (best) return best
  // A transient visibility grid covers safe routes requiring more than two bends.
  for (const startPort of startPorts) {
    for (const endPort of endPorts) {
      if (distance(startPort.point, endPort.point) < 1) continue
      if (
        routingObstacles.some(box =>
          segmentIntersects(startPort.point, startPort.stem, box)
          || segmentIntersects(endPort.point, endPort.stem, box)
        )
      ) continue
      const middle = gridRoute(startPort.stem, endPort.stem, routingObstacles)
      if (!middle) continue
      const points = [startPort.point, ...simplify(middle), endPort.point]
      if (hasBacktracking(points)) continue
      const length = points.slice(1).reduce((total, point, i) => total + distance(points[i]!, point), 0)
      const candidateCost = length + points.length * 8 + startPort.preference + endPort.preference
      if (length >= minimumRouteLength && candidateCost < cost) {
        if (!accept(points)) continue
        best = points
        cost = candidateCost
      }
    }
  }
  return best
}

function cubicPoints(path: readonly XYPoint[]): NonEmptyArray<Point> {
  const first = path[0]
  invariant(first, 'Edge route must have a start point')
  const points: NonEmptyArray<Point> = [[first.x, first.y]]
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1]!, b = path[i]!
    points.push(
      [a.x + (b.x - a.x) / 3, a.y + (b.y - a.y) / 3],
      [a.x + (b.x - a.x) * 2 / 3, a.y + (b.y - a.y) * 2 / 3],
      [b.x, b.y],
    )
  }
  return points
}

function boxesIntersect(a: BBox, b: BBox): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y
}

function nearPath(label: BBox, points: readonly Point[], useBoxDistance = false): boolean {
  const c = center(label)
  const pointSegmentDistance = (point: XYPoint, a: XYPoint, b: XYPoint) => {
    const dx = b.x - a.x, dy = b.y - a.y
    const t = Math.max(0, Math.min(1, ((point.x - a.x) * dx + (point.y - a.y) * dy) / (dx * dx + dy * dy || 1)))
    return distance(point, { x: a.x + dx * t, y: a.y + dy * t })
  }
  const pointBoxDistance = (point: XYPoint) =>
    distance(point, {
      x: Math.max(label.x, Math.min(label.x + label.width, point.x)),
      y: Math.max(label.y, Math.min(label.y + label.height, point.y)),
    })
  const corners = [{ x: label.x, y: label.y }, { x: label.x + label.width, y: label.y }, {
    x: label.x,
    y: label.y + label.height,
  }, { x: label.x + label.width, y: label.y + label.height }]
  const segmentDistance = (a: XYPoint, b: XYPoint) => {
    if (!useBoxDistance) return pointSegmentDistance(c, a, b)
    if (segmentIntersects(a, b, label)) return 0
    return Math.min(
      pointBoxDistance(a),
      pointBoxDistance(b),
      ...corners.map(point => pointSegmentDistance(point, a, b)),
    )
  }
  for (let i = 0; i + 3 < points.length; i += 3) {
    const a = points[i]!, b = points[i + 1]!, d = points[i + 2]!, e = points[i + 3]!
    let previous = { x: a[0], y: a[1] }
    for (let step = 1; step <= 32; step++) {
      const t = step / 32, u = 1 - t
      const current = {
        x: u ** 3 * a[0] + 3 * u ** 2 * t * b[0] + 3 * u * t ** 2 * d[0] + t ** 3 * e[0],
        y: u ** 3 * a[1] + 3 * u ** 2 * t * b[1] + 3 * u * t ** 2 * d[1] + t ** 3 * e[1],
      }
      if (segmentDistance(previous, current) <= 36) return true
      previous = current
    }
  }
  return false
}

function findLabel(
  edge: RouteEdge,
  points: readonly Point[],
  obstacles: readonly BBox[],
  peers: readonly RouteEdge[],
  recenter = false,
): BBox | null {
  const label = edge.labelBBox
  if (!label) return null
  const occupied = [
    ...obstacles,
    ...peers.filter(peer => peer.id < edge.id && peer.labelBBox)
      .flatMap(peer => peer.labelBBox ? [expand(peer.labelBBox, 8)] : []),
  ]
  const safe = (box: BBox) => !occupied.some(other => boxesIntersect(box, expand(other, 14)))
  if (safe(label) && (edge.isLabelCustomized || (!recenter && nearPath(label, points, true)))) return label
  const anchors: XYPoint[] = []
  for (let i = 0; i + 3 < points.length; i += 3) {
    const a = points[i]!, b = points[i + 1]!, c = points[i + 2]!, d = points[i + 3]!
    for (const t of [0.5, 0.25, 0.75]) {
      const u = 1 - t
      anchors.push({
        x: u ** 3 * a[0] + 3 * u ** 2 * t * b[0] + 3 * u * t ** 2 * c[0] + t ** 3 * d[0],
        y: u ** 3 * a[1] + 3 * u ** 2 * t * b[1] + 3 * u * t ** 2 * c[1] + t ** 3 * d[1],
      })
    }
  }
  const candidates = anchors.flatMap(point => [
    { ...label, x: point.x - label.width / 2, y: point.y - label.height / 2 },
    { ...label, x: point.x - label.width / 2, y: point.y - label.height - 12 },
    { ...label, x: point.x - label.width / 2, y: point.y + 12 },
    { ...label, x: point.x - label.width - 12, y: point.y - label.height / 2 },
    { ...label, x: point.x + 12, y: point.y - label.height / 2 },
  ])
  return candidates.find(box => safe(box) && nearPath(box, points)) ?? null
}

function placeLabel<E extends RouteEdge>(edge: E, label: BBox | null): E {
  return label && label !== edge.labelBBox ? { ...edge, labelBBox: label, isLabelCustomized: false } : edge
}

function pathSignature(points: readonly Point[]): string {
  const signature = (path: readonly Point[]) => path.map(point => point.map(n => n.toFixed(3)).join(',')).join(';')
  const canonical = simplify(points.map(([x, y]) => ({ x, y }))).map(({ x, y }): Point => [x, y])
  return [signature(canonical), signature([...canonical].reverse())].sort()[0]!
}

/** Reconciles a single route using standard node/edge geometry, without mutating either input. */
export function reconcileEdgeRoute<E extends RouteEdge>(
  edge: E,
  nodes: readonly RouteNode[],
  previousNodes: readonly RouteNode[] = [],
  peerEdges: readonly RouteEdge[] = [],
): E {
  const source = nodes.find(node => node.id === edge.source)
  const target = nodes.find(node => node.id === edge.target)
  if (!source || !target) return edge
  const byId = new Map(nodes.map(node => [node.id, node]))
  const related = (id: string, ancestor: string): boolean => {
    const visited = new Set<string>()
    for (let parent = byId.get(id)?.parent; parent && !visited.has(parent); parent = byId.get(parent)?.parent) {
      if (parent === ancestor) return true
      visited.add(parent)
    }
    return false
  }
  const obstacles = nodes.filter(node =>
    node.id !== source.id && node.id !== target.id
    && !related(source.id, node.id) && !related(target.id, node.id)
    && !related(node.id, source.id) && !related(node.id, target.id)
  )
  const start = edge.dir === 'back' ? target : source
  const end = edge.dir === 'back' ? source : target
  const changedEndpoint = previousNodes.some(node =>
    (node.id === source.id && !sameGeometry(node, source)) || (node.id === target.id && !sameGeometry(node, target))
  )
  const pair = peerEdges.filter(peer =>
    (peer.source === source.id && peer.target === target.id)
    || (peer.source === target.id && peer.target === source.id)
  ).sort((a, b) => a.id.localeCompare(b.id))
  const points = renderedPoints(edge, source, target)
  const duplicate = pair.some(peer =>
    peer.id !== edge.id
    && pathSignature(renderedPoints(peer, byId.get(peer.source)!, byId.get(peer.target)!)) === pathSignature(points)
  )
  const labelObstacles = nodes.filter(node => !related(source.id, node.id) && !related(target.id, node.id))
  // A retained curve can leave a moved endpoint correctly, then double back through its body.
  // Containing endpoints remain traversable for their own descendant relationships.
  const routeObstacles = [
    ...obstacles,
    ...(!related(target.id, source.id) ? [source] : []),
    ...(!related(source.id, target.id) ? [target] : []),
  ]
  if (
    !duplicate
    && (edge.controlPoints ||
      (!changedEndpoint && attached(edge.points[0], start) && attached(edge.points.at(-1), end)))
    && renderedLength(points) >= minimumRouteLength
    && endpointDirections(points, start, end)
    && !pathIntersects(points, routeObstacles)
  ) {
    const label = findLabel(edge, points, labelObstacles, peerEdges)
    if (!edge.labelBBox || label) return placeLabel(edge, label)
  }

  const occupied = peerEdges.filter(peer => peer.id !== edge.id).flatMap(peer => {
    const source = byId.get(peer.source), target = byId.get(peer.target)
    if (!source || !target) return []
    const points = renderedPoints(peer, source, target)
    const first = points[0], last = points.at(-1)
    const from = peer.dir === 'back' ? target : source, to = peer.dir === 'back' ? source : target
    return [{
      signature: pathSignature(points),
      ports: [
        ...(attached(first, from) && first ? [{ id: from.id, point: first }] : []),
        ...(attached(last, to) && last ? [{ id: to.id, point: last }] : []),
      ],
    }]
  })
  // Allocate each side independently. A single connection uses its midpoint;
  // fan-out follows neighboring positions, with IDs used only to break parallel ties.
  const portsFor = (endpoint: RouteNode, neighbor: RouteNode): Port[] =>
    sides.flatMap(side => {
      const incident = [...peerEdges.filter(peer => peer.id !== edge.id), edge].flatMap(peer => {
        const otherId = peer.source === endpoint.id ? peer.target : peer.target === endpoint.id ? peer.source : null
        const other = otherId ? byId.get(otherId) : null
        return other && (peer.id === edge.id || sideToward(endpoint, other) === side) ? [{ peer, other }] : []
      }).sort((a, b) => {
        const ca = center(a.other), cb = center(b.other)
        return (side === 0 || side === 2 ? ca.x - cb.x || ca.y - cb.y : ca.y - cb.y || ca.x - cb.x)
          || a.peer.id.localeCompare(b.peer.id)
      })
      const index = incident.findIndex(item => item.peer.id === edge.id)
      const fraction = (index + 1) / (incident.length + 1)
      const preferredSide = sideToward(endpoint, neighbor)
      const sideDistance = Math.min(Math.abs(preferredSide - side), 4 - Math.abs(preferredSide - side))
      const fractions = [
        fraction,
        ...Array.from({ length: incident.length + 3 }, (_, i) => (i + 1) / (incident.length + 4)),
      ]
        .sort((a, b) => Math.abs(a - fraction) - Math.abs(b - fraction) || a - b)
      for (const value of fractions) {
        const candidate = port(endpoint, side, value, sideDistance * 32 + Math.abs(value - fraction) * 32)
        if (
          !occupied.some(peer =>
            peer.ports.some(used =>
              used.id === endpoint.id && distance(candidate.point, { x: used.point[0], y: used.point[1] }) < 0.5
            )
          )
        ) return [candidate]
      }
      return []
    })
  const path = route(
    start,
    end,
    obstacles,
    portsFor(start, end),
    portsFor(end, start),
    candidate =>
      !occupied.some(peer => peer.signature === pathSignature(cubicPoints(candidate)))
      && (!edge.labelBBox || !!findLabel(edge, cubicPoints(candidate), labelObstacles, peerEdges, true)),
    edge.labelBBox,
  )
  // Overlapping existing endpoint/obstacle boxes can make safe attachment impossible.
  // Keep the original route rather than silently moving user-owned nodes.
  if (!path || !hasAtLeast(path, 2)) return edge
  const repaired = { ...edge, points: cubicPoints(path), controlPoints: null }
  return placeLabel(repaired, findLabel(repaired, repaired.points, labelObstacles, peerEdges, true))
}

/**
 * Repairs routes after standard manual-layout node geometry changes.
 * Safe unchanged routes and customized control points are retained; sequence layouts are excluded.
 */
export function reconcileEdgeRoutes(view: LayoutedView, previousNodes: readonly DiagramNode[] = []): LayoutedView {
  if (view._type === 'dynamic' && view.variant === 'sequence') return view
  const reconciled = new Map(view.edges.map(edge => [edge.id, edge]))
  for (const edge of [...view.edges].sort((a, b) => a.id.localeCompare(b.id))) {
    reconciled.set(edge.id, reconcileEdgeRoute(edge, view.nodes, previousNodes, [...reconciled.values()]))
  }
  const edges = view.edges.map(edge => reconciled.get(edge.id)!)
  return edges.every((edge, i) => edge === view.edges[i])
    ? view
    : { ...view, edges, bounds: calcViewBounds({ nodes: view.nodes, edges }) }
}
