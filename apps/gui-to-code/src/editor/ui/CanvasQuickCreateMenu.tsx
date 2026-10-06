import type { ElementKind } from '@likec4/core/types'
import type { ReactNode } from 'react'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { CanvasPosition } from '../contracts'
import { availableCanvasElementKinds } from './canvas-element-kinds'

export type CanvasMenuDismissReason = 'escape' | 'tab' | 'outside' | 'cancel'

/** Resolve roving focus only among enabled items. */
export function canvasMenuFocusIndex(current: number, count: number, key: string): number | null {
  if (count === 0) return null
  switch (key) {
    case 'Home':
      return 0
    case 'End':
      return count - 1
    case 'ArrowDown':
      return current < 0 ? 0 : (current + 1) % count
    case 'ArrowUp':
      return current < 0 ? count - 1 : (current - 1 + count) % count
    default:
      return null
  }
}

/** Tab exits relative to the canvas control; pointer dismissal never moves focus. */
export function dismissCanvasMenu(
  menu: HTMLElement | null,
  reason: CanvasMenuDismissReason,
  onCancel: (reason: CanvasMenuDismissReason) => void,
  backwards = false,
  returnFocusTo?: HTMLElement | null,
): void {
  const canvas = menu?.closest<HTMLElement>('.diagram-panel') ?? null
  let target = returnFocusTo ?? canvas
  if (reason === 'tab' && canvas) {
    const controls = Array.from(document.querySelectorAll<HTMLElement>(
      'button, input, select, textarea, summary, a[href], [tabindex]',
    )).filter(control =>
      control.tabIndex >= 0 && !control.matches(':disabled') && !control.closest('[inert], [hidden]')
      && !menu?.contains(control) && control.getClientRects().length > 0
    )
    const anchor = controls.indexOf(canvas)
    if (anchor >= 0) target = controls[anchor + (backwards ? -1 : 1)] ?? canvas
  }
  onCancel(reason)
  if (reason !== 'outside') {
    queueMicrotask(() => {
      if (target?.isConnected) target.focus()
      if (document.activeElement === document.body) canvas?.focus({ preventScroll: true })
    })
  }
}

export function CanvasQuickCreateMenu({
  screenPosition,
  availableKinds,
  kindTitles,
  description,
  relationLabel,
  relationDisabled,
  busy,
  onCreateElement,
  onCreateRelation,
  onCancel,
}: {
  readonly screenPosition: CanvasPosition
  readonly availableKinds: ReadonlySet<string> | null
  readonly kindTitles?: ReadonlyMap<string, string>
  readonly description: string
  readonly relationLabel: string
  readonly relationDisabled: boolean
  readonly busy: boolean
  readonly onCreateElement: (kind: ElementKind) => void
  readonly onCreateRelation: () => void
  readonly onCancel: (reason: CanvasMenuDismissReason) => void
}) {
  return (
    <CanvasContextMenu screenPosition={screenPosition} label="Быстрое создание на холсте" onCancel={onCancel}>
      <h3>Быстрые действия</h3>
      <p>{description}</p>
      <div className="canvas-quick-menu-items">
        {availableKinds && availableCanvasElementKinds(availableKinds, kindTitles).map(([kind, label]) => (
          <button
            key={kind}
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={busy || !availableKinds.has(kind)}
            onClick={() => onCreateElement(kind)}>
            Создать: {label}
          </button>
        ))}
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          disabled={busy || relationDisabled}
          onClick={onCreateRelation}>
          {relationLabel}
        </button>
      </div>
      <button
        type="button"
        role="menuitem"
        tabIndex={-1}
        className="secondary-button"
        onClick={event => dismissCanvasMenu(event.currentTarget.closest('[role="menu"]'), 'cancel', onCancel)}>
        Отмена
      </button>
    </CanvasContextMenu>
  )
}

/** Shared pointer/keyboard menu, measured against the live canvas rather than document flow. */
export function CanvasContextMenu({ screenPosition, label, onCancel, children, returnFocusTo }: {
  readonly screenPosition: CanvasPosition
  readonly label: string
  readonly onCancel: (reason: CanvasMenuDismissReason) => void
  readonly children: ReactNode
  readonly returnFocusTo?: HTMLElement | null
}) {
  const menu = useRef<HTMLElement | null>(null)
  const [position, setPosition] = useState(screenPosition)
  const [maxHeight, setMaxHeight] = useState<number>()

  useLayoutEffect(() => {
    const updatePosition = (): void => {
      const element = menu.current
      const panel = element?.offsetParent
      if (!(panel instanceof HTMLElement) || !element) return
      const inset = 12
      const canvas = panel.querySelector<HTMLElement>('.diagram') ?? panel
      const parentBounds = panel.getBoundingClientRect()
      const bounds = canvas.getBoundingClientRect()
      const left = bounds.left - parentBounds.left
      const top = bounds.top - parentBounds.top
      const availableHeight = Math.max(0, bounds.height - inset * 2)
      setMaxHeight(availableHeight)
      setPosition({
        x: Math.max(left + inset, Math.min(screenPosition.x, left + bounds.width - element.offsetWidth - inset)),
        y: Math.max(
          top + inset,
          Math.min(screenPosition.y, top + bounds.height - Math.min(element.offsetHeight, availableHeight) - inset),
        ),
      })
    }
    updatePosition()
    const observer = new ResizeObserver(updatePosition)
    if (menu.current) observer.observe(menu.current)
    if (menu.current?.offsetParent instanceof HTMLElement) {
      observer.observe(menu.current.offsetParent)
      const canvas = menu.current.offsetParent.querySelector('.diagram')
      if (canvas) observer.observe(canvas)
    }
    window.addEventListener('resize', updatePosition)
    return () => {
      observer.disconnect()
      window.removeEventListener('resize', updatePosition)
    }
  }, [screenPosition.x, screenPosition.y])

  useEffect(() => {
    if (!menu.current?.contains(document.activeElement)) {
      menu.current?.querySelector<HTMLButtonElement>('[role^="menuitem"]:not(:disabled)')?.focus({
        preventScroll: true,
      })
    }
  }, [children])

  const enabledItems = (): HTMLButtonElement[] => {
    return Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('[role^="menuitem"]') ?? [])
      .filter(item => !item.disabled)
  }

  const moveFocus = (key: string): boolean => {
    const enabled = enabledItems()
    const current = enabled.findIndex(item => item === document.activeElement)
    const next = canvasMenuFocusIndex(current, enabled.length, key)
    if (next === null) return false
    const item = enabled[next]
    item?.focus({ preventScroll: true })
    const container = menu.current
    if (item && container) {
      if (item.offsetTop < container.scrollTop) container.scrollTop = item.offsetTop
      const bottom = item.offsetTop + item.offsetHeight
      if (bottom > container.scrollTop + container.clientHeight) container.scrollTop = bottom - container.clientHeight
    }
    return true
  }

  return (
    <section
      ref={menu}
      className="canvas-quick-menu"
      data-canvas-quick-menu
      role="menu"
      aria-label={label}
      style={{ left: position.x, top: position.y, maxHeight }}
      onContextMenu={event => {
        event.preventDefault()
        event.stopPropagation()
      }}
      onKeyDown={event => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229) return
        if (event.key === 'Escape') {
          event.preventDefault()
          event.stopPropagation()
          dismissCanvasMenu(menu.current, 'escape', onCancel, false, returnFocusTo)
        } else if (event.key === 'Tab') {
          event.preventDefault()
          event.stopPropagation()
          dismissCanvasMenu(menu.current, 'tab', onCancel, event.shiftKey)
        } else if (moveFocus(event.key)) {
          event.preventDefault()
          event.stopPropagation()
        }
      }}>
      {children}
    </section>
  )
}
