import type { Fqn } from '@likec4/core/types'
import type { StructureNode } from './selection'

export interface StructureTreeProps {
  readonly nodes: readonly StructureNode[]
  readonly selectedId: Fqn | null
  readonly disabled: boolean
  readonly onSelect: (id: Fqn) => void
}

function Branch({
  nodes,
  selectedId,
  disabled,
  onSelect,
}: StructureTreeProps) {
  return (
    <ul className="structure-tree" role="tree">
      {nodes.map(node => (
        <li key={node.id} role="treeitem" aria-selected={selectedId === node.id}>
          <button
            type="button"
            className="structure-item"
            data-element-id={node.id}
            aria-current={selectedId === node.id ? 'true' : undefined}
            disabled={disabled}
            onFocus={() => onSelect(node.id)}
            onClick={() => onSelect(node.id)}>
            <span>{node.title}</span>
            <code>{node.id}</code>
          </button>
          {node.children.length > 0 && (
            <Branch nodes={node.children} selectedId={selectedId} disabled={disabled} onSelect={onSelect} />
          )}
        </li>
      ))}
    </ul>
  )
}

export function StructureTree(props: StructureTreeProps) {
  if (props.nodes.length === 0) {
    return <p className="empty">В модели пока нет элементов.</p>
  }
  return <Branch {...props} />
}
