import type { ReactNode } from 'react'
import { Children, createElement, isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WorkspacePanel } from './WorkspacePanel'
import type { WorkspacePanelProps } from './WorkspacePanel'

// Node probes exercise rendered handlers/effect transitions with focus doubles, not native DOM behavior.
const hooks = vi.hoisted(() => ({
  cursor: 0,
  refs: [] as unknown[],
  effect: null as (() => void | (() => void)) | null,
  deps: [] as unknown[],
  changed: false,
  cleanup: undefined as (() => void) | undefined,
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useRef: <T>(initial: T) => hooks.refs[hooks.cursor++] ??= { current: initial },
  useLayoutEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    hooks.changed = deps.length !== hooks.deps.length || deps.some((dep, i) => dep !== hooks.deps[i])
    hooks.deps = deps
    hooks.effect = effect
  },
}))

class FocusDocument {
  readonly body = new FocusElement(this)
  activeElement: FocusElement = this.body
  canvas: FocusElement | null = new FocusElement(this)
  readonly listeners = new Set<(event: { target: FocusElement }) => void>()
  readonly defaultView = { getComputedStyle: (element: FocusElement) => ({ visibility: element.visibility }) }
  readonly querySelector = vi.fn<(selector: string) => FocusElement | null>((selector: string) =>
    selector === '[aria-label="Холст диаграммы"]' ? this.canvas : null
  )
  addEventListener(_type: string, listener: (event: { target: FocusElement }) => void): void {
    this.listeners.add(listener)
  }
  removeEventListener(_type: string, listener: (event: { target: FocusElement }) => void): void {
    this.listeners.delete(listener)
  }
}

class FocusElement {
  isConnected = true
  disabled = false
  hidden = false
  inert = false
  visibleRect = true
  visibility = 'visible'
  overlay: string | null = null
  readonly descendants = new Set<FocusElement>()
  readonly focus = vi.fn<() => void>(() => {
    this.ownerDocument.activeElement = this
    for (const listener of this.ownerDocument.listeners) listener({ target: this })
  })
  constructor(readonly ownerDocument: FocusDocument) {}
  matches(selector: string): boolean {
    return selector === ':disabled' && this.disabled
  }
  closest(selector: string): FocusElement | null {
    if (selector === '[hidden], [inert]') return this.hidden || this.inert ? this : null
    return this.overlay && selector.includes(this.overlay) ? this : null
  }
  getClientRects(): { length: number } {
    return { length: this.visibleRect ? 1 : 0 }
  }
  contains(element: unknown): boolean {
    return element === this || element instanceof FocusElement && this.descendants.has(element)
  }
}

interface ProbeEvent {
  key: string
  target: FocusElement
  currentTarget: FocusElement
  defaultPrevented: boolean
  nativeEvent: {
    defaultPrevented: boolean
    isComposing: boolean
    keyCode: number
    composedPath(): FocusElement[]
  }
  isPropagationStopped(): boolean
  preventDefault(): void
  stopPropagation(): void
}

interface ProbeProps {
  id?: string
  children?: ReactNode
  className?: string
  hidden?: boolean
  role?: string
  inert?: boolean
  'aria-modal'?: boolean
  'aria-label'?: string
  ref?: { current: FocusElement | null }
  onKeyDown?: (event: ProbeEvent) => void
  onKeyDownCapture?: (event: ProbeEvent) => void
  onClick?: () => void
}

function find(tree: ReactNode, type: string): ProbeProps {
  const pending: ReactNode[] = [tree]
  while (pending.length) {
    const node = pending.shift()
    if (!isValidElement<ProbeProps>(node)) continue
    if (node.type === type) return node.props
    pending.push(...Children.toArray(node.props.children))
  }
  throw new Error(`Missing ${type}`)
}

function setup(open = false) {
  const document = new FocusDocument()
  const trigger = new FocusElement(document)
  const panel = new FocusElement(document)
  const close = new FocusElement(document)
  const input = new FocusElement(document)
  panel.descendants.add(close)
  panel.descendants.add(input)
  document.activeElement = trigger
  const children = createElement('input', { defaultValue: 'Несохранённое название' })
  const props: { -readonly [K in keyof WorkspacePanelProps]: WorkspacePanelProps[K] } = {
    id: 'inspector',
    title: 'Свойства',
    className: 'inspector-panel',
    open,
    onClose: vi.fn<() => void>(),
    children,
  }
  const render = () => {
    hooks.cursor = 0
    const tree = WorkspacePanel(props)
    const section = find(tree, 'section')
    const button = find(tree, 'button')
    if (section.ref) section.ref.current = panel
    if (button.ref) button.ref.current = close
    if (hooks.changed) {
      hooks.cleanup?.()
      hooks.cleanup = hooks.effect?.() || undefined
    }
    return tree
  }
  const event = (overrides: Partial<ProbeEvent> = {}): ProbeEvent => ({
    key: 'Escape',
    target: input,
    currentTarget: panel,
    defaultPrevented: false,
    nativeEvent: { defaultPrevented: false, isComposing: false, keyCode: 27, composedPath: () => [input, panel] },
    isPropagationStopped: () => false,
    preventDefault: vi.fn<() => void>(),
    stopPropagation: vi.fn<() => void>(),
    ...overrides,
  })
  const keyDown = (probe = event()) => find(render(), 'section').onKeyDown?.(probe)
  return { props, document, trigger, panel, close, input, children, render, event, keyDown }
}

beforeEach(() => {
  hooks.cursor = 0
  hooks.refs = []
  hooks.deps = []
  hooks.effect = null
  hooks.cleanup = undefined
  vi.stubGlobal('HTMLElement', FocusElement)
  vi.stubGlobal('Element', FocusElement)
  vi.stubGlobal('Node', FocusElement)
})

afterEach(() => {
  hooks.cleanup?.()
  vi.unstubAllGlobals()
})

describe('workspace panel surface', () => {
  it('retains the exact child slot when hidden, open and hidden again', () => {
    const ui = setup()
    for (const open of [false, true, false]) {
      ui.props.open = open
      const section = find(ui.render(), 'section')
      expect(section.hidden).toBe(!open)
      expect(section.id).toBe('inspector')
      expect(section.className).toBe('panel inspector-panel')
      expect(section['aria-label']).toBe('Свойства')
      expect(Children.toArray(section.children)).toHaveLength(2)
      const body = find(ui.render(), 'div')
      expect(body.className).toBe('panel-body')
      expect(body.children).toBe(ui.children)
      expect(section.role).toBeUndefined()
      expect(section['aria-modal']).toBeUndefined()
      expect(section.inert).toBeUndefined()
      expect(section.onKeyDownCapture).toBeUndefined()
    }
  })

  it('renders a Russian heading/close control and accepts no extra class', () => {
    const ui = setup(true)
    delete ui.props.className
    const tree = ui.render()
    expect(find(tree, 'section').className).toBe('panel')
    expect(find(tree, 'h2').children).toBe('Свойства')
    expect(find(tree, 'button')['aria-label']).toBe('Закрыть панель «Свойства»')
    expect(find(tree, 'button').children).toBe('Закрыть')
    find(tree, 'button').onClick?.()
    expect(ui.props.onClose).toHaveBeenCalledOnce()
  })
})

describe('workspace panel Escape ownership', () => {
  it('closes from inside and consumes Escape', () => {
    const ui = setup(true)
    const event = ui.event()
    ui.keyDown(event)
    expect(ui.props.onClose).toHaveBeenCalledOnce()
    expect(event.preventDefault).toHaveBeenCalledOnce()
    expect(event.stopPropagation).toHaveBeenCalledOnce()
  })

  it.each(['hidden', 'other-key', 'consumed', 'native-consumed', 'stopped', 'composing', 'ime-code', 'outside'])(
    'leaves %s events untouched',
    reason => {
      const ui = setup(reason !== 'hidden')
      const event = ui.event()
      if (reason === 'other-key') event.key = 'Tab'
      if (reason === 'consumed') event.defaultPrevented = true
      if (reason === 'native-consumed') event.nativeEvent.defaultPrevented = true
      if (reason === 'stopped') event.isPropagationStopped = () => true
      if (reason === 'composing') event.nativeEvent.isComposing = true
      if (reason === 'ime-code') event.nativeEvent.keyCode = 229
      if (reason === 'outside') event.nativeEvent.composedPath = () => [ui.trigger]
      ui.keyDown(event)
      expect(ui.props.onClose).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(event.stopPropagation).not.toHaveBeenCalled()
    },
  )

  it.each([
    'dialog',
    '[role="dialog"]',
    '[role="menu"]',
    '[role="listbox"]',
    '.inline-title-editor',
    '.view-create-form',
  ])(
    'lets nested %s own Escape',
    overlay => {
      const ui = setup(true)
      ui.input.overlay = overlay
      const event = ui.event()
      ui.keyDown(event)
      expect(ui.props.onClose).not.toHaveBeenCalled()
      expect(event.preventDefault).not.toHaveBeenCalled()
      expect(event.stopPropagation).not.toHaveBeenCalled()
    },
  )
})

describe('workspace panel focus lifecycle with doubles', () => {
  it('captures the opener on each opening and restores after hiding a focused panel', () => {
    const ui = setup()
    ui.render()
    expect(ui.close.focus).not.toHaveBeenCalled()
    ui.props.open = true
    ui.render()
    expect(ui.document.activeElement).toBe(ui.close)
    ui.input.focus()
    ui.props.open = false
    ui.document.activeElement = ui.document.body
    ui.render()
    expect(ui.document.activeElement).toBe(ui.trigger)
    expect(ui.document.listeners.size).toBe(0)
    const nextTrigger = new FocusElement(ui.document)
    nextTrigger.focus()
    ui.props.open = true
    ui.render()
    ui.props.open = false
    ui.render()
    expect(ui.document.activeElement).toBe(nextTrigger)
  })

  it.each(['disconnected', 'hidden', 'inert', 'no-rect', 'css-hidden', 'css-collapse', 'disabled'])(
    'falls back to the labelled canvas for a %s opener',
    reason => {
      const ui = setup(true)
      ui.render()
      if (reason === 'disconnected') ui.trigger.isConnected = false
      if (reason === 'hidden') ui.trigger.hidden = true
      if (reason === 'inert') ui.trigger.inert = true
      if (reason === 'no-rect') ui.trigger.visibleRect = false
      if (reason === 'css-hidden') ui.trigger.visibility = 'hidden'
      if (reason === 'css-collapse') ui.trigger.visibility = 'collapse'
      if (reason === 'disabled') ui.trigger.disabled = true
      ui.props.open = false
      ui.render()
      expect(ui.document.activeElement).toBe(ui.document.canvas)
      expect(ui.trigger.focus).not.toHaveBeenCalled()
    },
  )

  it('does not focus a missing or hidden fallback', () => {
    const ui = setup(true)
    ui.render()
    ui.trigger.isConnected = false
    if (ui.document.canvas) ui.document.canvas.hidden = true
    ui.props.open = false
    ui.render()
    expect(ui.document.canvas?.focus).not.toHaveBeenCalled()
    ui.document.canvas = null
    ui.props.open = true
    ui.render()
    ui.props.open = false
    expect(() => ui.render()).not.toThrow()
  })

  it('uses canvas when opening without a focused trigger', () => {
    const ui = setup(true)
    ui.document.activeElement = ui.document.body
    ui.render()
    ui.props.open = false
    ui.render()
    expect(ui.document.activeElement).toBe(ui.document.canvas)
  })

  it('restores the trigger after focus leaves and subsequently returns inside', () => {
    const ui = setup(true)
    ui.render()
    const elsewhere = new FocusElement(ui.document)
    elsewhere.focus()
    ui.input.focus()
    ui.props.open = false
    ui.render()
    expect(ui.document.activeElement).toBe(ui.trigger)
  })

  it('does not recapture or move focus on title/class/callback rerenders or effect replay', () => {
    const ui = setup(true)
    ui.render()
    ui.input.focus()
    ui.props.title = 'Структура'
    ui.props.className = 'structure-panel'
    ui.props.onClose = vi.fn<() => void>()
    ui.render()
    expect(ui.document.activeElement).toBe(ui.input)
    hooks.cleanup?.()
    hooks.cleanup = hooks.effect?.() || undefined
    expect(ui.document.activeElement).toBe(ui.input)
    expect(ui.close.focus).toHaveBeenCalledOnce()
    ui.props.open = false
    ui.render()
    expect(ui.document.activeElement).toBe(ui.trigger)
  })

  it('never steals focus after moving outside, even if activeElement later resets to body', () => {
    const ui = setup(true)
    ui.render()
    const elsewhere = new FocusElement(ui.document)
    elsewhere.focus()
    ui.props.open = false
    ui.render()
    expect(ui.document.activeElement).toBe(elsewhere)
    expect(ui.trigger.focus).not.toHaveBeenCalled()
    ui.props.open = true
    ui.render()
    elsewhere.focus()
    ui.document.activeElement = ui.document.body
    ui.props.open = false
    ui.render()
    expect(ui.document.activeElement).toBe(ui.document.body)
    expect(ui.trigger.focus).not.toHaveBeenCalled()
  })

  it('unmount cleanup releases listeners without restoring focus', () => {
    const ui = setup(true)
    ui.render()
    const elsewhere = new FocusElement(ui.document)
    elsewhere.focus()
    hooks.cleanup?.()
    expect(ui.document.listeners.size).toBe(0)
    expect(ui.document.activeElement).toBe(elsewhere)
    expect(ui.trigger.focus).not.toHaveBeenCalled()
  })
})
