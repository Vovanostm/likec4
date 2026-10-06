import type { Fqn } from '@likec4/core/types'
import type { ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { StructureTree } from './StructureTree'
import type { StructureTreeProps } from './StructureTree'

// Node handler probes verify tree state and callbacks; native focus/renderer acceptance belongs to browser checks.
const hooks = vi.hoisted(() => ({ collapsed: new Set<string>() }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useState: (initial: unknown) =>
    typeof initial === 'string' ?
      [initial, () => undefined] :
      [hooks.collapsed, (next: Set<string> | ((current: Set<string>) => Set<string>)) => {
        hooks.collapsed = typeof next === 'function' ? next(hooks.collapsed) : next
      }],
}))

interface ProbeProps {
  children?: ReactNode
  role?: string
  disabled?: boolean
  tabIndex?: number
  'aria-label'?: string
  'aria-expanded'?: boolean
  'aria-pressed'?: boolean
  'data-element-id'?: Fqn
  title?: string
  onClick?: () => void
  onFocus?: () => void
  onKeyDown?: (event: ProbeKeyEvent) => void
}

class FocusButton {
  readonly focus = vi.fn<() => void>()
  readonly classList = { contains: (name: string) => this.isRow && name === 'structure-item' }
  row: {
    getAttribute(name: string): string | null
    querySelector(selector: string): { click(): void } | FocusButton | null
  } | null = null
  constructor(readonly isRow = true) {}
  closest(): typeof this.row {
    return this.row
  }
}

interface ProbeKeyEvent {
  key: string
  target: FocusButton
  currentTarget: { querySelectorAll(selector: string): FocusButton[] }
  nativeEvent: { isComposing: boolean }
  preventDefault(): void
  stopPropagation(): void
}

function controls(tree: ReactNode): ProbeProps[] {
  const result: ProbeProps[] = []
  const visit = (node: ReactNode): void => {
    if (!isValidElement<ProbeProps>(node)) return
    if (typeof node.type === 'function') {
      visit((node.type as (props: ProbeProps) => ReactNode)(node.props))
      return
    }
    result.push(node.props)
    Children.toArray(node.props.children).forEach(visit)
  }
  visit(tree)
  return result
}

function control(tree: ReactNode, label: string): ProbeProps {
  const found = controls(tree).find(props => props['aria-label'] === label || props.children === label)
  if (!found) throw new Error(`Missing control ${label}`)
  return found
}

function setup() {
  const parent = 'shop' as Fqn
  const child = 'shop.api' as Fqn
  const props: { -readonly [K in keyof StructureTreeProps]: StructureTreeProps[K] } = {
    nodes: [{ id: parent, title: 'Магазин', children: [{ id: child, title: 'API', children: [] }] }],
    selectedId: child,
    disabled: false,
    onSelect: vi.fn<(id: Fqn) => void>(),
    hiddenIds: new Set(),
    lockedIds: new Set(),
    onToggleHidden: vi.fn<(id: Fqn) => void>(),
    onToggleLocked: vi.fn<(id: Fqn) => void>(),
    onResetLayers: vi.fn<() => void>(),
  }
  return { props, parent, child, render: () => StructureTree(props) }
}

describe('desktop structure layers', () => {
  beforeEach(() => {
    hooks.collapsed = new Set()
  })
  afterEach(() => vi.unstubAllGlobals())

  function key(tree: ReactNode, target: FocusButton, value: string, buttons: FocusButton[], composing = false) {
    const event: ProbeKeyEvent = {
      key: value,
      target,
      currentTarget: { querySelectorAll: () => buttons },
      nativeEvent: { isComposing: composing },
      preventDefault: vi.fn<() => void>(),
      stopPropagation: vi.fn<() => void>(),
    }
    controls(tree).find(props => props.role === 'tree')?.onKeyDown?.(event)
    return event
  }

  it('uses left/right arrows to collapse/expand a branch before moving to children', () => {
    vi.stubGlobal('HTMLButtonElement', FocusButton)
    const ui = setup()
    const button = new FocusButton()
    const child = new FocusButton()
    button.row = {
      getAttribute: () => String(!hooks.collapsed.has(ui.parent)),
      querySelector: selector =>
        selector.includes('data-layer-collapse')
          ? {
            click: () =>
              control(ui.render(), `${hooks.collapsed.has(ui.parent) ? 'Развернуть' : 'Свернуть'} «Магазин»`)
                .onClick?.(),
          }
          : child,
    }
    expect(key(ui.render(), button, 'ArrowLeft', [button, child]).preventDefault).toHaveBeenCalledOnce()
    expect(hooks.collapsed.has(ui.parent)).toBe(true)
    key(ui.render(), button, 'ArrowRight', [button])
    expect(hooks.collapsed.has(ui.parent)).toBe(false)
    expect(child.focus).not.toHaveBeenCalled()
    key(ui.render(), button, 'ArrowRight', [button, child])
    expect(child.focus).toHaveBeenCalledOnce()
  })

  it('navigates visible rows with arrows/Home/End and leaves layer controls or IME alone', () => {
    vi.stubGlobal('HTMLButtonElement', FocusButton)
    const ui = setup()
    const first = new FocusButton()
    const last = new FocusButton()
    const buttons = [first, last]
    key(ui.render(), first, 'ArrowDown', buttons)
    key(ui.render(), first, 'End', buttons)
    expect(last.focus).toHaveBeenCalledTimes(2)
    key(ui.render(), last, 'ArrowUp', buttons)
    key(ui.render(), last, 'Home', buttons)
    expect(first.focus).toHaveBeenCalledTimes(2)
    expect(key(ui.render(), new FocusButton(false), 'ArrowDown', buttons).preventDefault).not.toHaveBeenCalled()
    expect(key(ui.render(), first, 'ArrowDown', buttons, true).preventDefault).not.toHaveBeenCalled()
    expect(ui.props.onSelect).not.toHaveBeenCalled()
  })

  it('collapses and expands a branch while preserving selection and child rows', () => {
    const ui = setup()
    expect(controls(ui.render()).filter(p => p['data-element-id'])).toHaveLength(2)
    control(ui.render(), 'Свернуть «Магазин»').onClick?.()
    const collapsed = ui.render()
    expect(controls(collapsed).filter(p => p['data-element-id'])).toHaveLength(1)
    expect(controls(collapsed).find(p => p['data-element-id'] === ui.parent)?.tabIndex).toBe(0)
    expect(ui.props.selectedId).toBe(ui.child)
    expect(ui.props.onSelect).not.toHaveBeenCalled()
    control(collapsed, 'Развернуть «Магазин»').onClick?.()
    expect(controls(ui.render()).find(p => p['data-element-id'] === ui.child)?.tabIndex).toBe(0)
  })

  it('reveals a selected descendant and supports expanding every branch', () => {
    const ui = setup()
    control(ui.render(), 'Свернуть «Магазин»').onClick?.()
    control(ui.render(), 'Найти выбранный элемент').onClick?.()
    expect(controls(ui.render()).filter(p => p['data-element-id'])).toHaveLength(2)
    control(ui.render(), 'Свернуть «Магазин»').onClick?.()
    control(ui.render(), 'Развернуть всё').onClick?.()
    expect(controls(ui.render()).filter(p => p['data-element-id'])).toHaveLength(2)
  })

  it('keeps hidden and locked descendants selectable while explaining inherited controls', () => {
    const ui = setup()
    ui.props.hiddenIds = new Set([ui.parent])
    ui.props.lockedIds = new Set([ui.parent])
    const tree = ui.render()
    const child = controls(tree).find(p => p['data-element-id'] === ui.child)!
    expect(child.disabled).toBe(false)
    child.onFocus?.()
    child.onClick?.()
    expect(ui.props.onSelect).toHaveBeenNthCalledWith(1, ui.child)
    expect(ui.props.onSelect).toHaveBeenNthCalledWith(2, ui.child)
    expect(control(tree, 'Показать «API» на холсте').disabled).toBe(true)
    expect(control(tree, 'Показать «API» на холсте').title).toBe('Сначала покажите родительский слой')
    expect(control(tree, 'Разблокировать «API»').disabled).toBe(true)
    expect(control(tree, 'Разблокировать «API»').title).toBe('Сначала разблокируйте родительский слой')
  })

  it('routes layer controls only to their presentation callbacks', () => {
    const ui = setup()
    const tree = ui.render()
    control(tree, 'Скрыть «Магазин» на холсте').onClick?.()
    control(tree, 'Заблокировать «Магазин»').onClick?.()
    expect(ui.props.onToggleHidden).toHaveBeenCalledExactlyOnceWith(ui.parent)
    expect(ui.props.onToggleLocked).toHaveBeenCalledExactlyOnceWith(ui.parent)
    expect(ui.props.onSelect).not.toHaveBeenCalled()
    ui.props.hiddenIds = new Set([ui.parent])
    ui.props.lockedIds = new Set([ui.parent])
    control(ui.render(), 'Показать и разблокировать всё').onClick?.()
    expect(ui.props.onResetLayers).toHaveBeenCalledOnce()
  })

  it('restores child controls when parent flags are removed without clearing explicit child flags', () => {
    const ui = setup()
    ui.props.hiddenIds = new Set([ui.parent, ui.child])
    expect(control(ui.render(), 'Показать «API» на холсте').disabled).toBe(true)
    ui.props.hiddenIds = new Set([ui.child])
    expect(control(ui.render(), 'Показать «API» на холсте').disabled).toBe(false)
    expect(control(ui.render(), 'Показать «API» на холсте')['aria-pressed']).toBe(true)
  })

  it('reveals all or unlocks all without resetting the other presentation preference', () => {
    const ui = setup()
    ui.props.hiddenIds = new Set([ui.parent, ui.child])
    ui.props.lockedIds = new Set([ui.parent])
    control(ui.render(), 'Показать всё').onClick?.()
    expect(ui.props.onToggleHidden).toHaveBeenNthCalledWith(1, ui.parent)
    expect(ui.props.onToggleHidden).toHaveBeenNthCalledWith(2, ui.child)
    expect(ui.props.onToggleLocked).not.toHaveBeenCalled()
    control(ui.render(), 'Разблокировать всё').onClick?.()
    expect(ui.props.onToggleLocked).toHaveBeenCalledExactlyOnceWith(ui.parent)
    expect(ui.props.onResetLayers).not.toHaveBeenCalled()
  })

  it('disables controls while busy and resets only when flags exist', () => {
    const ui = setup()
    expect(control(ui.render(), 'Показать и разблокировать всё').disabled).toBe(true)
    ui.props.disabled = true
    expect(control(ui.render(), 'Свернуть «Магазин»').disabled).toBe(true)
    expect(control(ui.render(), 'Скрыть «API» на холсте').disabled).toBe(true)
    expect(control(ui.render(), 'Заблокировать «API»').disabled).toBe(true)
  })

  it('preserves existing consumers and the Russian empty state', () => {
    const ui = setup()
    delete ui.props.onToggleHidden
    delete ui.props.onToggleLocked
    delete ui.props.onResetLayers
    expect(controls(ui.render()).filter(p => p['aria-pressed'] !== undefined)).toHaveLength(0)
    ui.props.nodes = []
    expect(controls(ui.render()).find(p => p.children === 'В модели пока нет элементов.')).toBeDefined()
  })
})
