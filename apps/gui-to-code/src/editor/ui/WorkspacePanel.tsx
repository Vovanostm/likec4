import type { ReactNode } from 'react'
import { useLayoutEffect, useRef } from 'react'

export interface WorkspacePanelProps {
  readonly id: string
  readonly title: string
  readonly className?: string
  readonly open: boolean
  readonly onClose: () => void
  readonly children: ReactNode
}

function canReceiveFocus(element: HTMLElement | null): element is HTMLElement {
  if (
    !element?.isConnected || element === element.ownerDocument.body || element.matches(':disabled')
    || element.closest('[hidden], [inert]')
    || element.getClientRects().length === 0
  ) return false
  const visibility = element.ownerDocument.defaultView?.getComputedStyle(element).visibility
  return visibility !== 'hidden' && visibility !== 'collapse'
}

/** A nonmodal panel keeps editor drafts mounted while its host controls visibility. */
export function WorkspacePanel({ id, title, className, open, onClose, children }: WorkspacePanelProps) {
  const panelRef = useRef<HTMLElement>(null)
  const closeRef = useRef<HTMLButtonElement>(null)
  const focusSession = useRef<{ opener: HTMLElement | null; focusedInside: boolean } | null>(null)

  useLayoutEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const document = panel.ownerDocument
    if (!open) {
      const session = focusSession.current
      focusSession.current = null
      // Hiding a focused subtree can reset activeElement to body before this effect runs.
      if (
        session?.focusedInside
        && (panel.contains(document.activeElement) || document.activeElement === document.body)
      ) {
        const canvas = document.querySelector<HTMLElement>('[aria-label="Холст диаграммы"]')
        const target = canReceiveFocus(session.opener) ? session.opener : canvas
        if (canReceiveFocus(target)) target.focus()
      }
      return
    }
    if (!focusSession.current) {
      const active = document.activeElement
      focusSession.current = {
        opener: active instanceof HTMLElement ? active : null,
        focusedInside: true,
      }
      closeRef.current?.focus()
    }
    const trackFocus = (event: FocusEvent): void => {
      if (focusSession.current) {
        focusSession.current.focusedInside = event.target instanceof Node && panel.contains(event.target)
      }
    }
    document.addEventListener('focusin', trackFocus)
    // Cleanup only releases the listener: StrictMode/unmount must not steal focus.
    return () => document.removeEventListener('focusin', trackFocus)
  }, [open])

  return (
    <section
      ref={panelRef}
      id={id}
      className={className ? `panel ${className}` : 'panel'}
      hidden={!open}
      aria-label={title}
      onKeyDown={event => {
        if (
          !open || event.key !== 'Escape' || event.defaultPrevented || event.isPropagationStopped()
          || event.nativeEvent.defaultPrevented || event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229
        ) return
        const origin = event.nativeEvent.composedPath()[0] ?? event.target
        if (!(origin instanceof Element) || !event.currentTarget.contains(origin)) return
        // Portalled/nested dialogs and menus own Escape, even when they have no custom handler.
        if (
          origin.closest(
            'dialog, [role="dialog"], [role="menu"], [role="listbox"], '
              + '.inline-title-editor, .view-create-form, .canvas-create-menu, .toolbar-menu[open]',
          )
        ) return
        event.preventDefault()
        event.stopPropagation()
        onClose()
      }}>
      <header className="panel-header">
        <h2>{title}</h2>
        <button ref={closeRef} type="button" aria-label={`Закрыть панель «${title}»`} onClick={onClose}>
          Закрыть
        </button>
      </header>
      <div className="panel-body">{children}</div>
    </section>
  )
}
