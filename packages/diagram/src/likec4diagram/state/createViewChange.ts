import type {
  DiagramEdge,
  DiagramNode,
  LayoutedView,
  ViewChange,
} from '@likec4/core/types'
import { getNodeDimensions } from '@xyflow/system'
import { hasAtLeast, map } from 'remeda'
import { calcViewBounds } from '../../utils/view-bounds'
import type { DiagramContext } from './types'

export function createViewChange(
  parentContext: Pick<DiagramContext, 'view' | 'xynodes' | 'xyedges' | 'xystore'>,
): ViewChange.SaveViewSnapshot {
  const {
    view: {
      drifts: _1, // Ignore drifts from view
      _layout: _2, // Ignore layout type from view
      ...view
    },
    xynodes,
    xystore,
  } = parentContext

  const { nodeLookup, edgeLookup } = xystore.getState()

  const nodes = map(view.nodes, (node): DiagramNode => {
    const internal = nodeLookup.get(node.id)
    if (!internal) {
      console.error(`Internal node not found for ${node.id}`)
      return node
    }
    const xynodedata = xynodes.find(n => n.data.id === node.id)?.data ?? internal.data
    const position = internal.internals.positionAbsolute
    const { width, height } = getNodeDimensions(internal)

    return {
      ...node,
      shape: xynodedata.shape,
      color: xynodedata.color,
      style: {
        ...xynodedata.style,
      },
      x: position.x,
      y: position.y,
      width,
      height,
    } satisfies DiagramNode
  })

  const edges = map(view.edges, (edge): DiagramEdge => {
    const xyedge = edgeLookup.get(edge.id)
    if (!xyedge) {
      console.error(`Internal edge not found for ${edge.id}`)
      return edge
    }
    const data = xyedge.data
    // Preserve the rendered curve; synthesizing handles changes a poly-Bezier into Catmull-Rom on reload.
    const controlPoints = data.controlPoints ?? []
    const _updated: DiagramEdge = {
      ...edge,
      points: data.points,
    }
    if (data.labelBBox) {
      _updated.labelBBox = {
        x: data.labelBBox.x,
        y: data.labelBBox.y,
        width: data.labelBBox.width,
        height: data.labelBBox.height,
      }
    } else {
      _updated.labelBBox = null
    }
    // Persist the manual label position flag only when set, to keep snapshots clean
    if (data.isLabelCustomized !== undefined) {
      _updated.isLabelCustomized = data.isLabelCustomized
    }
    if (hasAtLeast(controlPoints, 1)) {
      _updated.controlPoints = map(controlPoints, v => ({
        x: v.x,
        y: v.y,
      }))
    } else {
      _updated.controlPoints = null
    }
    return _updated
  })

  const snapshot: LayoutedView = {
    ...view,
    _layout: 'manual',
    bounds: calcViewBounds({ nodes, edges }),
    nodes,
    edges,
  }

  return {
    op: 'save-view-snapshot',
    layout: snapshot,
  }
}
