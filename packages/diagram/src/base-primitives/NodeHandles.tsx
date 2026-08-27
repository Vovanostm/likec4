import { nonexhaustive } from '@likec4/core'
import type { AutoLayoutDirection } from '@likec4/core/types'
import { Handle, Position } from '@xyflow/react'
import type { CSSProperties } from 'react'

const authoringHandleStyle: CSSProperties = {
  width: 16,
  height: 16,
  background: 'var(--mantine-color-blue-5)',
  border: '2px solid var(--mantine-color-body)',
  cursor: 'crosshair',
  pointerEvents: 'all',
  zIndex: 30,
}

/**
 * XYFlow requires centered hidden handles to route rendered edges. Editable
 * diagrams additionally expose separate edge-positioned handles for direct
 * connection gestures so authoring never depends on the routing handles.
 */
export function DefaultHandles({
  direction = 'TB',
  authoring = false,
}: {
  direction?: AutoLayoutDirection | undefined
  authoring?: boolean | undefined
}) {
  let sourcePosition: Position, targetPosition: Position

  switch (direction) {
    case 'TB': {
      sourcePosition = Position.Bottom
      targetPosition = Position.Top
      break
    }
    case 'BT': {
      sourcePosition = Position.Top
      targetPosition = Position.Bottom
      break
    }
    case 'LR': {
      sourcePosition = Position.Right
      targetPosition = Position.Left
      break
    }
    case 'RL': {
      sourcePosition = Position.Left
      targetPosition = Position.Right
      break
    }
    default: {
      nonexhaustive(direction)
    }
  }
  return (
    <>
      <Handle
        type={'source'}
        position={sourcePosition}
        className="likec4-node-handle-center" />
      <Handle
        type={'target'}
        position={targetPosition}
        className="likec4-node-handle-center" />
      {authoring && (
        <>
          <Handle
            id="likec4-authoring-source"
            type={'source'}
            position={sourcePosition}
            className="likec4-authoring-handle"
            style={authoringHandleStyle} />
          <Handle
            id="likec4-authoring-target"
            type={'target'}
            position={targetPosition}
            className="likec4-authoring-handle"
            style={authoringHandleStyle} />
        </>
      )}
    </>
  )
}
