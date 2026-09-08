import { useEffect, useRef } from 'react'

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
  const nodeClipboardReady = kind === 'node' || canCopy

  useEffect(() => {
    menu.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus()
  }, [kind])

  return (
    <div
      ref={menu}
      className="canvas-context-menu"
      role="menu"
      aria-label={kind === 'node' ? 'Меню элемента' : kind === 'edge' ? 'Меню связи' : 'Меню холста'}
      style={{ left: x, top: y }}
      onKeyDown={event => {
        if (event.key === 'Escape') {
          event.preventDefault()
          onClose()
        }
      }}>
      {kind === 'node' && <>
        <button role="menuitem" type="button" onClick={onEdit}>Редактировать</button>
        <button role="menuitem" type="button" onClick={onRenameNode}>Переименовать</button>
        <button role="menuitem" type="button" onClick={onConnectNode}>Создать связь</button>
        <button role="menuitem" type="button" disabled={!nodeClipboardReady} onClick={onCopy}>Копировать</button>
        <button role="menuitem" type="button" disabled={!nodeClipboardReady} onClick={onDuplicate}>Дублировать</button>
        <button role="menuitem" type="button" disabled={!canRemoveNode} onClick={onRemoveNode}>Удалить</button>
      </>}
      {kind === 'edge' && <>
        <button role="menuitem" type="button" onClick={onEdit}>Редактировать</button>
        <button role="menuitem" type="button" onClick={onRemoveEdge}>Удалить</button>
      </>}
      {kind === 'canvas' && <>
        <button role="menuitem" type="button" onClick={onCreateElement}>Создать элемент</button>
        <button role="menuitem" type="button" disabled={!canPaste} onClick={onPaste}>Вставить</button>
        <button role="menuitem" type="button" onClick={onSelectAll}>Выделить всё</button>
        <button role="menuitem" type="button" onClick={onAutoLayout}>Автоматическая раскладка</button>
        <button role="menuitem" type="button" disabled={!hasManualLayout} onClick={onResetLayout}>Сбросить ручную раскладку</button>
        <button role="menuitem" type="button" onClick={onFitView}>Показать весь вид</button>
      </>}
    </div>
  )
}
