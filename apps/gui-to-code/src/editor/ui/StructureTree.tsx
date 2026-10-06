import type { Fqn } from '@likec4/core/types'
import { useState } from 'react'
import type { LayerPresentation } from './layer-presentation'
import { deriveLayerPresentation, layerAncestors, visibleLayerIds } from './layer-presentation'
import { type StructureNode, filterStructureTree, localId } from './selection'
import './StructureTree.css'

export interface StructureTreeProps {
  readonly nodes: readonly StructureNode[]
  readonly selectedId: Fqn | null
  readonly disabled: boolean
  readonly onSelect: (id: Fqn) => void
  /** Explicit transient flags; descendants inherit them through deriveLayerPresentation. */
  readonly hiddenIds?: ReadonlySet<Fqn>
  readonly lockedIds?: ReadonlySet<Fqn>
  readonly onToggleHidden?: ((id: Fqn) => void) | undefined
  readonly onToggleLocked?: ((id: Fqn) => void) | undefined
  readonly onResetLayers?: () => void
}

interface BranchProps extends StructureTreeProps {
  readonly searching: boolean
  readonly level?: number
  readonly tabStopId: Fqn
  readonly collapsedIds: ReadonlySet<Fqn>
  readonly onToggleCollapsed: (id: Fqn) => void
  readonly presentation: LayerPresentation
}

function Branch({
  nodes,
  selectedId,
  disabled,
  onSelect,
  level = 1,
  tabStopId,
  collapsedIds,
  onToggleCollapsed,
  presentation,
  searching,
  onToggleHidden,
  onToggleLocked,
}: BranchProps) {
  return (
    <ul
      className="structure-tree"
      role={level === 1 ? 'tree' : 'group'}
      aria-label={level === 1 ? 'Элементы модели' : undefined}
      onKeyDown={level === 1 ?
        event => {
          if (event.altKey || event.ctrlKey || event.metaKey || event.nativeEvent.isComposing) return
          const target = event.target
          if (!(target instanceof HTMLButtonElement) || !target.classList.contains('structure-item')) return
          const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>('.structure-item:not(:disabled)')]
          const index = buttons.indexOf(target)
          let next: HTMLButtonElement | undefined
          switch (event.key) {
            case 'ArrowDown':
              next = buttons[index + 1]
              break
            case 'ArrowUp':
              next = buttons[index - 1]
              break
            case 'Home':
              next = buttons[0]
              break
            case 'End':
              next = buttons.at(-1)
              break
            case 'ArrowRight':
              if (target.closest('[role="treeitem"]')?.getAttribute('aria-expanded') === 'false') {
                const control = target.closest('[role="treeitem"]')?.querySelector<HTMLButtonElement>(
                  ':scope > .structure-layer-row > [data-layer-collapse]',
                )
                control?.click()
                break
              }
              next = target.closest('[role="treeitem"]')?.querySelector<HTMLButtonElement>(
                ':scope > [role="group"] .structure-item',
              ) ??
                undefined
              break
            case 'ArrowLeft':
              if (target.closest('[role="treeitem"]')?.getAttribute('aria-expanded') === 'true') {
                target.closest('[role="treeitem"]')?.querySelector<HTMLButtonElement>(
                  ':scope > .structure-layer-row > [data-layer-collapse]',
                )?.click()
                break
              }
              next = target.closest('[role="treeitem"]')?.parentElement?.closest('[role="treeitem"]')
                ?.querySelector<HTMLButtonElement>(
                  ':scope > .structure-layer-row > .structure-item',
                ) ?? undefined
              break
            default:
              return
          }
          event.preventDefault()
          event.stopPropagation()
          next?.focus()
        } :
        undefined}>
      {nodes.map(node => (
        <li
          key={node.id}
          role="treeitem"
          aria-label={`${node.title} ${node.id}`}
          aria-level={level}
          aria-expanded={node.children.length ? !collapsedIds.has(node.id) : undefined}
          aria-selected={selectedId === node.id}>
          <div
            className="structure-layer-row"
            style={{ paddingLeft: `${Math.min(level - 1, 4) * 0.5}rem` }}
            data-hidden={presentation.hiddenIds.has(node.id)}
            data-locked={presentation.lockedIds.has(node.id)}>
            {node.children.length > 0 ?
              (
                <button
                  type="button"
                  className="structure-layer-toggle"
                  data-layer-collapse="true"
                  aria-label={`${collapsedIds.has(node.id) ? 'Развернуть' : 'Свернуть'} «${node.title}»`}
                  aria-expanded={!collapsedIds.has(node.id)}
                  disabled={disabled || searching}
                  title={searching ? 'Во время поиска ветви раскрыты' : undefined}
                  onClick={() => onToggleCollapsed(node.id)}>
                  {collapsedIds.has(node.id) ? '▸' : '▾'}
                </button>
              ) :
              <span className="structure-layer-spacer" />}
            <button
              type="button"
              className="structure-item"
              data-element-id={node.id}
              aria-label={`${node.title} ${node.id}`}
              title={`${node.title}\n${node.id}`}
              aria-current={selectedId === node.id ? 'true' : undefined}
              disabled={disabled}
              tabIndex={node.id === tabStopId ? 0 : -1}
              onFocus={() => onSelect(node.id)}
              onClick={() => onSelect(node.id)}>
              <span>{node.title}</span>
              <code>{localId(node.id)}</code>
            </button>
            {onToggleHidden && (
              <button
                type="button"
                className="structure-layer-toggle"
                aria-label={`${presentation.hiddenIds.has(node.id) ? 'Показать' : 'Скрыть'} «${node.title}» на холсте`}
                aria-pressed={presentation.hiddenIds.has(node.id)}
                title={presentation.inheritedHiddenIds.has(node.id) ? 'Сначала покажите родительский слой' : undefined}
                disabled={disabled || presentation.inheritedHiddenIds.has(node.id)}
                onClick={() => onToggleHidden(node.id)}>
                {presentation.hiddenIds.has(node.id) ? '◌' : '◉'}
              </button>
            )}
            {onToggleLocked && (
              <button
                type="button"
                className="structure-layer-toggle"
                aria-label={`${
                  presentation.lockedIds.has(node.id) ? 'Разблокировать' : 'Заблокировать'
                } «${node.title}»`}
                aria-pressed={presentation.lockedIds.has(node.id)}
                title={presentation.inheritedLockedIds.has(node.id)
                  ? 'Сначала разблокируйте родительский слой'
                  : undefined}
                disabled={disabled || presentation.inheritedLockedIds.has(node.id)}
                onClick={() => onToggleLocked(node.id)}>
                {presentation.lockedIds.has(node.id) ? '🔒' : '🔓'}
              </button>
            )}
          </div>
          {node.children.length > 0 && !collapsedIds.has(node.id) && (
            <Branch
              nodes={node.children}
              selectedId={selectedId}
              disabled={disabled}
              onSelect={onSelect}
              level={level + 1}
              tabStopId={tabStopId}
              collapsedIds={collapsedIds}
              onToggleCollapsed={onToggleCollapsed}
              presentation={presentation}
              searching={searching}
              onToggleHidden={onToggleHidden}
              onToggleLocked={onToggleLocked} />
          )}
        </li>
      ))}
    </ul>
  )
}

export function StructureTree(props: StructureTreeProps) {
  const [collapsedIds, setCollapsedIds] = useState<ReadonlySet<Fqn>>(() => new Set())
  const [query, setQuery] = useState('')
  const nodes = filterStructureTree(props.nodes, query)
  const displayedCollapsedIds = query.trim() ? new Set<Fqn>() : collapsedIds
  const presentation = deriveLayerPresentation(props.nodes, props.hiddenIds ?? new Set(), props.lockedIds ?? new Set())
  const visibleIds = visibleLayerIds(nodes, displayedCollapsedIds)
  const ancestors = props.selectedId ? layerAncestors(props.nodes, props.selectedId) : null
  const tabStopId = props.selectedId && visibleIds.includes(props.selectedId) ?
    props.selectedId
    : ancestors?.find(id => collapsedIds.has(id)) ?? props.nodes[0]?.id
  const revealSelected = () => setCollapsedIds(current => new Set([...current].filter(id => !ancestors?.includes(id))))
  const onToggleCollapsed = (id: Fqn) =>
    setCollapsedIds(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  if (props.nodes.length === 0) {
    return <p className="empty">В модели пока нет элементов.</p>
  }
  return (
    <>
      <label className="structure-search">
        Найти элемент
        <input
          type="search"
          value={query}
          placeholder="Название или путь элемента"
          onChange={event => setQuery(event.target.value)} />
      </label>
      <div className="structure-layer-toolbar">
        {collapsedIds.size > 0 && (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => setCollapsedIds(new Set())}>
            Развернуть всё
          </button>
        )}
        {props.selectedId && !visibleIds.includes(props.selectedId) && ancestors && (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => {
              setQuery('')
              revealSelected()
            }}>
            Найти выбранный элемент
          </button>
        )}
        {!!props.hiddenIds?.size && props.onToggleHidden && (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => props.hiddenIds?.forEach(id => props.onToggleHidden?.(id))}>
            Показать всё
          </button>
        )}
        {!!props.lockedIds?.size && props.onToggleLocked && (
          <button
            type="button"
            disabled={props.disabled}
            onClick={() => props.lockedIds?.forEach(id => props.onToggleLocked?.(id))}>
            Разблокировать всё
          </button>
        )}
        {props.onResetLayers && (
          <button
            type="button"
            disabled={props.disabled || !(props.hiddenIds?.size || props.lockedIds?.size)}
            onClick={props.onResetLayers}>
            Показать и разблокировать всё
          </button>
        )}
      </div>
      {nodes.length === 0 && <p className="empty" role="status">Элементы не найдены.</p>}
      <Branch
        {...props}
        nodes={nodes}
        searching={!!query.trim()}
        tabStopId={tabStopId ?? props.nodes[0]!.id}
        collapsedIds={displayedCollapsedIds}
        onToggleCollapsed={onToggleCollapsed}
        presentation={presentation} />
    </>
  )
}
