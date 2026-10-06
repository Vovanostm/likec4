import type { ElementKind } from '@likec4/core/types'
import { canvasElementKinds } from './ui/canvas-element-kinds'

export type EditorShortcut =
  | {
    readonly action:
      | 'copy'
      | 'paste'
      | 'duplicate'
      | 'select-all'
      | 'undo'
      | 'redo'
      | 'cancel'
      | 'select'
      | 'connect'
      | 'rename'
      | 'remove'
      | 'edit'
      | 'context'
      | 'create-at-center'
  }
  | { readonly action: 'create'; readonly kind: ElementKind }

interface ShortcutKey {
  readonly key: string
  readonly code?: string
  readonly ctrlKey?: boolean
  readonly metaKey?: boolean
  readonly altKey?: boolean
  readonly shiftKey?: boolean
  readonly repeat?: boolean
  readonly isComposing?: boolean
  readonly nativeEvent?: { readonly isComposing: boolean }
  readonly defaultPrevented?: boolean
}

interface ShortcutContext {
  readonly editingText: boolean
  readonly inOverlay: boolean
  readonly interactive: boolean
  readonly inCanvas: boolean
  readonly inStructure: boolean
  readonly activeCreation: boolean
  readonly canMutate: boolean
}

/** Resolve editor actions while leaving native text editing and control activation to the browser. */
export function resolveEditorShortcut(event: ShortcutKey, context: ShortcutContext): EditorShortcut | null {
  if (
    event.defaultPrevented || event.isComposing || event.nativeEvent?.isComposing || event.repeat ||
    context.editingText || context.inOverlay
  ) return null
  if (event.altKey) return null
  const key = event.key.toLowerCase()
  const primaryModifier = event.ctrlKey || event.metaKey
  if (primaryModifier) {
    if (!context.canMutate) return null
    if (key === 'z' || event.code === 'KeyZ') return { action: event.shiftKey ? 'redo' : 'undo' }
    if ((key === 'y' || event.code === 'KeyY') && !event.shiftKey) return { action: 'redo' }
    if (!context.inCanvas || context.interactive || event.shiftKey) return null
    if (key === 'c' || event.code === 'KeyC') return { action: 'copy' }
    if (key === 'v' || event.code === 'KeyV') return { action: 'paste' }
    if (key === 'd' || event.code === 'KeyD') return { action: 'duplicate' }
    if (key === 'a' || event.code === 'KeyA') return { action: 'select-all' }
    return null
  }
  if (key === 'escape') return { action: 'cancel' }
  if (context.interactive || !context.inCanvas) return null
  if (event.shiftKey) return key === 'f10' ? { action: 'context' } : null
  if (key === 'enter') {
    if (context.activeCreation && !context.inStructure) return context.canMutate ? { action: 'create-at-center' } : null
    return { action: 'edit' }
  }
  if (key === 'v' || event.code === 'KeyV') return { action: 'select' }
  if (!context.canMutate) return null
  if (key === 'f2') return { action: 'rename' }
  if (key === 'delete' || key === 'backspace') return { action: 'remove' }
  if (key === 'l' || event.code === 'KeyL') return { action: 'connect' }
  const kind = canvasElementKinds.find((_, index) => key === String(index + 1) || event.code === `Digit${index + 1}`)
  return kind ? { action: 'create', kind: kind[0] } : null
}

/** Include ancestor editors and overlays so nested contenteditable and menu controls remain isolated. */
export function shortcutTargetContext(
  target: EventTarget | null,
  origin?: EventTarget,
): Omit<ShortcutContext, 'canMutate' | 'activeCreation'> {
  if (origin && origin !== target) {
    const outer = shortcutTargetContext(target)
    const inner = shortcutTargetContext(origin)
    return {
      editingText: outer.editingText || inner.editingText,
      inOverlay: outer.inOverlay || inner.inOverlay,
      interactive: outer.interactive || inner.interactive,
      inCanvas: outer.inCanvas || inner.inCanvas,
      inStructure: outer.inStructure || inner.inStructure,
    }
  }
  if (!(target instanceof Element)) {
    return {
      editingText: false,
      inOverlay: false,
      interactive: false,
      inCanvas: false,
      inStructure: false,
    }
  }
  const contentEditable = target.closest('[contenteditable]')
  return {
    editingText: !!target.closest('input, textarea, select, [role="textbox"]')
      || (target instanceof HTMLElement && target.isContentEditable)
      || (!!contentEditable && contentEditable.getAttribute('contenteditable') !== 'false'),
    inOverlay: !!target.closest(
      'dialog, [role="dialog"], [role="menu"], .canvas-create-menu, .inline-title-editor, .toolbar-menu[open], .view-create-form',
    ) || (!!target.closest('.panel:not(.diagram-panel)') && !target.closest('.structure-item')),
    interactive: !!target.closest('button, a[href], summary, [role="button"], [role="menuitem"]')
      && !target.closest('.structure-item[aria-current="true"], .react-flow__node, .react-flow__edge'),
    inCanvas: !!target.closest('.diagram-panel, .structure-item'),
    inStructure: !!target.closest('.structure-item'),
  }
}
