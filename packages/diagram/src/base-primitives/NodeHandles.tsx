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
  zIndex: 30,
}

/**
 * XYFlow requires centered hidden handles to route rendered edges. Editable
 * diagrams additionally expose separate side handles for direct connection
 * gestures. Their position is intentionally independent from layout direction.
 * Authoring handles stay mounted so XYFlow measures them during node setup;
 * read-only mode only hides and disables them.
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

  const authoringStyle: CSSProperties = {
    ...authoringHandleStyle,
    visibility: authoring ? 'visible' : 'hidden',
    pointerEvents: authoring ? 'all' : 'none',
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
      <Handle
        id="likec4-authoring-source"
        type={'source'}
        position={Position.Right}
        className="likec4-authoring-handle"
        isConnectable={authoring}
        isConnectableStart={authoring}
        isConnectableEnd={authoring}
        style={authoringStyle} />
      <Handle
        id="likec4-authoring-target"
        type={'target'}
        position={Position.Left}
        className="likec4-authoring-handle"
        isConnectable={authoring}
        isConnectableStart={authoring}
        isConnectableEnd={authoring}
        style={authoringStyle} />
    </>
  )
}
