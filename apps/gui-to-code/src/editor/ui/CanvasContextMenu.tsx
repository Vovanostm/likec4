import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { MouseEvent, PointerEvent, ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type CanvasContextMenuKind = 'node' | 'edge' | 'canvas'

export interface CanvasContextMenuProps {
  readonly kind: CanvasContextMenuKind
  readonly x: number
  readonly y: number
  readonly canRemoveNode: boolean
  readonly canCopy: boolean
  readonly canPaste: boolean
  readonly hasManualLayout: boolean
  readonly onClose: () => void
  readonly onEdit: () => void
  readonly onRenameNode: () => void
  readonly onConnectNode: () => void
  readonly onCopy: () => void
  readonly onPaste: () => void
  readonly onDuplicate: () => void
  readonly onRemoveNode: () => void
  readonly onRemoveEdge: () => void
  readonly onCreateElement: () => void
  readonly onSelectAll: () => void
  readonly onAutoLayout: () => void
  readonly onResetLayout: () => void
  readonly onFitView: () => void
}

interface MenuItemProps {
  readonly children: ReactNode
  readonly disabled?: boolean
  readonly onActivate: () => void
}

const viewportMargin = 12

function MenuItem({ children, disabled = false, onActivate }: MenuItemProps) {
  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>): void => {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    onActivate()
  }

  const handleClick = (event: MouseEvent<HTMLButtonElement>): void => {
    if (event.detail === 0) onActivate()
  }

  return (
    <button
      role="menuitem"
      type="button"
      disabled={disabled}
      onPointerDown={handlePointerDown}
      onClick={handleClick}>
      {children}
    </button>
  )
}

export function CanvasContextMenu({
  kind,
  x,
  y,
  canRemoveNode,
  canCopy,
  canPaste,
  hasManualLayout,
  onClose,
  onEdit,
  onRenameNode,
  onConnectNode,
  onCopy,
  onPaste,
  onDuplicate,
  onRemoveNode,
  onRemoveEdge,
  onCreateElement,
  onSelectAll,
  onAutoLayout,
  onResetLayout,
  onFitView,
}: CanvasContextMenuProps) {
  const menu = useRef<HTMLDivElement | null>(null)
  const [position, setPosition] = useState({ left: x, top: y })
  const nodeClipboardReady = kind === 'node' || canCopy

  useLayoutEffect(() => {
    const element = menu.current
    if (!element) return

    const keepInsideViewport = () => {
      const bounds = element.getBoundingClientRect()
      const maxLeft = Math.max(viewportMargin, window.innerWidth - bounds.width - viewportMargin)
      const maxTop = Math.max(viewportMargin, window.innerHeight - bounds.height - viewportMargin)
      const left = Math.min(Math.max(x, viewportMargin), maxLeft)
      const top = Math.min(Math.max(y, viewportMargin), maxTop)

      setPosition(current => current.left === left && current.top === top ? current : { left, top })
    }

    keepInsideViewport()
    window.addEventListener('resize', keepInsideViewport)
    return () => window.removeEventListener('resize', keepInsideViewport)
  }, [kind, x, y])

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [kind])

  return createPortal(
    <div
      ref={menu}
      className="canvas-context-menu"
      role="menu"
      aria-label={kind === 'node' ? 'Меню элемента' : kind === 'edge' ? 'Меню связи' : 'Меню холста'}
      style={{ left: position.left, top: position.top }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}>
      {kind === 'node' && <>
        <MenuItem onActivate={onEdit}>Редактировать</MenuItem>
        <MenuItem onActivate={onRenameNode}>Переименовать</MenuItem>
        <MenuItem onActivate={onConnectNode}>Создать связь</MenuItem>
        <MenuItem disabled={!nodeClipboardReady} onActivate={onCopy}>Копировать</MenuItem>
        <MenuItem disabled={!nodeClipboardReady} onActivate={onDuplicate}>Дублировать</MenuItem>
        <MenuItem disabled={!canRemoveNode} onActivate={onRemoveNode}>Удалить</MenuItem>
      </>}
      {kind === 'edge' && <>
        <MenuItem onActivate={onEdit}>Редактировать</MenuItem>
        <MenuItem onActivate={onRemoveEdge}>Удалить</MenuItem>
      </>}
      {kind === 'canvas' && <>
        <MenuItem onActivate={onCreateElement}>Создать элемент</MenuItem>
        <MenuItem disabled={!canPaste} onActivate={onPaste}>Вставить</MenuItem>
        <MenuItem onActivate={onSelectAll}>Выделить всё</MenuItem>
        <MenuItem onActivate={onAutoLayout}>Автоматическая раскладка</MenuItem>
        <MenuItem disabled={!hasManualLayout} onActivate={onResetLayout}>Сбросить ручную раскладку</MenuItem>
        <MenuItem onActivate={onFitView}>Показать весь вид</MenuItem>
      </>}
    </div>,
    document.body,
  )
}
