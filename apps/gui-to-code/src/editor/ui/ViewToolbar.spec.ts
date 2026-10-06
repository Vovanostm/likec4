import type { LayoutedView, ViewId } from '@likec4/core/types'
import type { DependencyList, EffectCallback, ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ViewToolbarProps } from './ViewToolbar'
import { ViewToolbar } from './ViewToolbar'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as EffectCallback[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: EffectCallback, deps: DependencyList) => {
    const slot = hooks.cursor++
    const previous = hooks.slots[slot] as DependencyList | undefined
    if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) hooks.effects.push(effect)
    hooks.slots[slot] = deps
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    return hooks.slots[slot] ??= { current: initial }
  },
  useState: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: unknown) => {
      hooks.slots[slot] = value
    }]
  },
}))

interface ProbeProps {
  children?: ReactNode
  'aria-label'?: string
  'aria-current'?: string
  type?: string
  disabled?: boolean
  required?: boolean
  value?: string
  placeholder?: string
  ref?: { current: unknown }
  onClick?: () => void
  onChange?: (event: { target: { value: string } }) => void
  onSubmit?: (event: { preventDefault: () => void }) => void
  onCompositionStart?: () => void
  onCompositionEnd?: () => void
  onKeyDown?: (
    event: {
      key: string
      nativeEvent: { isComposing: boolean; keyCode?: number }
      preventDefault: () => void
      stopPropagation: () => void
    },
  ) => void
}

function find(root: ReactNode, predicate: (type: unknown, props: ProbeProps) => boolean): ProbeProps {
  const pending: ReactNode[] = Children.toArray(root)
  while (pending.length) {
    const node = pending.shift()
    if (!isValidElement<ProbeProps>(node)) continue
    if (predicate(node.type, node.props)) return node.props
    pending.push(...Children.toArray(node.props.children))
  }
  throw new Error('Expected component control')
}

function fixture(overrides: Partial<ViewToolbarProps> = {}) {
  const create = vi.fn<ViewToolbarProps['onCreateView']>().mockResolvedValue(true)
  const props: ViewToolbarProps = {
    views: [],
    selectedViewId: null,
    layoutMode: 'auto',
    scopeId: 'shop',
    busy: false,
    mutationDisabledReason: null,
    hasManualLayout: false,
    onCreateView: create,
    onSelectView: () => {},
    onLayoutModeChange: () => {},
    onImportLayout: () => {},
    onExportLayout: () => {},
    onResetLayout: () => {},
    ...overrides,
  }
  const focusTitle = vi.fn<() => void>()
  const focusCreate = vi.fn<() => void>()
  const focusSelector = vi.fn<() => void>()
  const render = (next: Partial<ViewToolbarProps> = {}) => {
    Object.assign(props, next)
    hooks.cursor = 0
    const tree = ViewToolbar(props)
    find(tree, (type, p) => type === 'button' && p.children === 'Создать вид').ref!.current = { focus: focusCreate }
    find(tree, (_, p) => p['aria-label'] === 'Текущий вид').ref!.current = { focus: focusSelector }
    try {
      find(tree, (_, p) => p['aria-label'] === 'Название нового вида').ref!.current = { focus: focusTitle }
    } catch {
      // The input is unmounted when the form is closed.
    }
    for (const effect of hooks.effects.splice(0)) effect()
    return tree
  }
  const open = () => {
    find(render(), (type, p) => type === 'button' && p.children === 'Создать вид').onClick?.()
    return render()
  }
  const input = (tree: ReactNode, label: string, value: string) => {
    find(tree, (_, p) => p['aria-label'] === label).onChange?.({ target: { value } })
    return render()
  }
  return { create, render, open, input, focusTitle, focusCreate, focusSelector }
}

function submit(tree: ReactNode) {
  find(tree, type => type === 'form').onSubmit?.({ preventDefault: vi.fn<() => void>() })
}

function key(tree: ReactNode, key: string, isComposing = false, keyCode?: number) {
  const event = {
    key,
    nativeEvent: { isComposing, ...(keyCode === undefined ? {} : { keyCode }) },
    preventDefault: vi.fn<() => void>(),
    stopPropagation: vi.fn<() => void>(),
  }
  find(tree, type => type === 'form').onKeyDown?.(event)
  return event
}

async function settle() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('static view creation form', () => {
  beforeEach(() => {
    hooks.cursor = 0
    hooks.slots = []
    hooks.effects = []
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('focuses the optional title, hides the optional ID in details and submits an allocated ID request', async () => {
    const form = fixture()
    let tree = form.open()
    await settle()
    expect(form.focusTitle).toHaveBeenCalledOnce()
    expect(find(tree, (_, p) => p['aria-label'] === 'Название нового вида').placeholder).toBe('Новая диаграмма')
    const details = find(
      tree,
      (type, p) =>
        type === 'details' &&
        Children.toArray(p.children).some(child =>
          isValidElement<ProbeProps>(child) && child.type === 'summary' && child.props.children === 'Подробности'
        ),
    )
    expect(find(details.children, (_, p) => p['aria-label'] === 'ID нового вида').required).toBeUndefined()
    tree = form.input(tree, 'Название нового вида', '  Контекст магазина  ')
    submit(tree)
    expect(form.create).toHaveBeenCalledExactlyOnceWith('', 'Контекст магазина', 'shop')
    await settle()
    expect(() => find(form.render(), type => type === 'form')).toThrow('Expected component control')
    expect(form.focusSelector).toHaveBeenCalledOnce()
  })

  it('uses a Russian default title when both optional fields are empty', () => {
    const form = fixture()
    submit(form.open())
    expect(form.create).toHaveBeenCalledExactlyOnceWith('', 'Новая диаграмма', 'shop')
  })

  it('creates a root C1 context without requiring an element selection', () => {
    const form = fixture({ scopeId: null })
    expect(find(form.render(), (type, p) => type === 'button' && p.children === 'Создать вид').disabled).toBe(false)
    const tree = form.input(form.open(), 'Название нового вида', 'Контекст сервиса')
    expect(find(tree, (_, p) => p['aria-label'] === 'Область нового вида').value).toBe('root')
    submit(tree)
    expect(form.create).toHaveBeenCalledExactlyOnceWith('', 'Контекст сервиса', null)
  })

  it('keeps a root draft independent of later element selection changes', () => {
    const form = fixture({ scopeId: null })
    const original = form.input(form.open(), 'Название нового вида', 'Контекст')
    const tree = form.render({ scopeId: 'shop.api' })
    expect(find(tree, (_, p) => p['aria-label'] === 'Название нового вида').value).toBe('Контекст')
    expect(find(tree, (type, p) => type === 'button' && p.type === 'submit').disabled).toBe(false)
    submit(original)
    expect(form.create).toHaveBeenCalledExactlyOnceWith('', 'Контекст', null)
  })

  it('permits explicit context scope choice without discarding a captured scoped draft', () => {
    const form = fixture()
    const original = form.input(form.open(), 'Название нового вида', 'Сохранённый ввод')
    let tree = form.render({ scopeId: 'shop.api' })
    expect(find(tree, (type, p) => type === 'button' && p.type === 'submit').disabled).toBe(true)
    tree = form.input(tree, 'Область нового вида', 'root')
    expect(find(tree, (_, p) => p['aria-label'] === 'Название нового вида').value).toBe('Сохранённый ввод')
    expect(find(tree, (type, p) => type === 'button' && p.type === 'submit').disabled).toBe(false)
    submit(original)
    expect(form.create).not.toHaveBeenCalled()
    submit(tree)
    expect(form.create).toHaveBeenCalledExactlyOnceWith('', 'Сохранённый ввод', null)
  })

  it('passes a selected nested element as the exact C3 view scope', () => {
    const form = fixture({ scopeId: 'customSystem.customContainer' })
    submit(form.open())
    expect(form.create).toHaveBeenCalledExactlyOnceWith('', 'Новая диаграмма', 'customSystem.customContainer')
  })

  it('navigates breadcrumbs, parent and selected element details through the consumer callback', () => {
    const select = vi.fn<ViewToolbarProps['onSelectView']>()
    const root = { id: 'overview', _type: 'element', title: 'Обзор', sourcePath: 'model.c4' } as LayoutedView
    const containers = {
      id: 'system-details',
      _type: 'element',
      viewOf: 'shop',
      title: 'Система',
      sourcePath: 'model.c4',
    } as LayoutedView
    const components = {
      id: 'service-details',
      _type: 'element',
      viewOf: 'shop.api',
      title: 'Сервис',
      sourcePath: 'model.c4',
    } as LayoutedView
    const form = fixture({
      views: [root, containers, components],
      selectedViewId: 'service-details' as ViewId,
      onSelectView: select,
    })
    let tree = form.render()
    const nav = find(tree, (_, p) => p['aria-label'] === 'Уровни архитектуры')
    find(
      nav.children,
      (type, p) =>
        type === 'button'
        && Children.toArray(p.children).filter(child => typeof child === 'string').join('') === 'C1 · Контекст: Обзор',
    )
      .onClick?.()
    expect(select).toHaveBeenLastCalledWith('overview')
    expect(find(nav.children, (_, p) => p['aria-current'] === 'page').disabled).toBe(true)
    find(tree, (type, p) => type === 'button' && p.children === 'Назад к родителю').onClick?.()
    expect(select).toHaveBeenLastCalledWith('system-details')
    tree = form.render({ selectedViewId: 'system-details' as ViewId, scopeId: 'shop.api' })
    find(tree, (type, p) => type === 'button' && p.children === 'Открыть детализацию').onClick?.()
    expect(select).toHaveBeenLastCalledWith('service-details')
    tree = form.render({ busy: true })
    expect(find(tree, (type, p) => type === 'button' && p.children === 'Открыть детализацию').disabled).toBe(true)
    expect(find(tree, (type, p) => type === 'button' && p.children === 'Назад к родителю').disabled).toBe(true)
  })

  it('retains a scoped form draft when requesting level navigation', () => {
    const select = vi.fn<ViewToolbarProps['onSelectView']>()
    const root = { id: 'context', _type: 'element', title: 'Контекст', sourcePath: 'model.c4' } as LayoutedView
    const detail = { ...root, id: 'detail', viewOf: 'shop', title: 'Система' } as LayoutedView
    const form = fixture({ views: [root, detail], selectedViewId: 'detail' as ViewId, onSelectView: select })
    const tree = form.input(form.open(), 'Название нового вида', 'Не терять')
    find(tree, (type, p) => type === 'button' && p.children === 'Назад к родителю').onClick?.()
    expect(select).toHaveBeenCalledExactlyOnceWith('context')
    const next = form.render({ scopeId: null, selectedViewId: 'context' as ViewId })
    expect(find(next, (_, p) => p['aria-label'] === 'Название нового вида').value).toBe('Не терять')
    expect(find(next, (type, p) => type === 'button' && p.type === 'submit').disabled).toBe(true)
  })

  it('passes a trimmed manual ID override to the owner for validation', () => {
    const form = fixture()
    const tree = form.input(form.open(), 'ID нового вида', '  custom-view  ')
    expect(find(tree, (_, p) => p['aria-label'] === 'ID нового вида').required).toBeUndefined()
    submit(tree)
    expect(form.create).toHaveBeenCalledExactlyOnceWith('custom-view', 'Новая диаграмма', 'shop')
  })

  it.each([
    { busy: true },
    { mutationDisabledReason: 'Редактирование недоступно.' },
  ])('blocks direct submission and reopening while unavailable: %j', next => {
    const form = fixture()
    form.open()
    const tree = form.render(next)
    submit(tree)
    expect(form.create).not.toHaveBeenCalled()
    expect(find(tree, (type, p) => type === 'button' && p.type === 'submit').disabled).toBe(true)
    expect(find(tree, (type, p) => type === 'button' && p.children === 'Создать вид').disabled).toBe(true)
  })

  it('locks input, duplicate submission and Escape until the awaited creation completes', async () => {
    const form = fixture()
    let complete!: (success: boolean) => void
    const completion = new Promise<boolean>(resolve => {
      complete = resolve
    })
    form.create.mockReturnValue(completion)
    let tree = form.input(form.open(), 'ID нового вида', 'first')
    submit(tree)
    submit(tree)
    tree = form.render()
    expect(form.create).toHaveBeenCalledExactlyOnceWith('first', 'Новая диаграмма', 'shop')
    expect(find(tree, (_, p) => p['aria-label'] === 'ID нового вида').disabled).toBe(true)
    expect(find(tree, (_, p) => p['aria-label'] === 'Название нового вида').disabled).toBe(true)
    key(tree, 'Escape')
    expect(find(form.render(), type => type === 'form')).toBeDefined()
    complete(false)
    await completion
    await Promise.resolve()
    tree = form.render()
    expect(find(tree, (_, p) => p['aria-label'] === 'ID нового вида').disabled).toBe(false)
  })

  it.each(['rejected', 'thrown', 'promise-rejected'] as const)(
    'retains input and restores title focus after %s creation, then permits retry',
    async failure => {
      const form = fixture()
      switch (failure) {
        case 'rejected':
          form.create.mockResolvedValueOnce(false)
          break
        case 'thrown':
          form.create.mockImplementationOnce(() => {
            throw new Error('failure')
          })
          break
        case 'promise-rejected':
          form.create.mockRejectedValueOnce(new Error('failure'))
          break
      }
      let tree = form.input(form.open(), 'ID нового вида', 'draft')
      tree = form.input(tree, 'Название нового вида', 'Черновик')
      await settle()
      form.focusTitle.mockClear()
      submit(tree)
      form.render()
      await settle()
      tree = form.render()
      await settle()
      expect(find(tree, (_, p) => p['aria-label'] === 'ID нового вида').value).toBe('draft')
      expect(find(tree, (_, p) => p['aria-label'] === 'Название нового вида').value).toBe('Черновик')
      expect(form.focusTitle).toHaveBeenCalledOnce()
      submit(tree)
      expect(form.create).toHaveBeenCalledTimes(2)
      await settle()
      expect(() => find(form.render(), type => type === 'form')).toThrow('Expected component control')
    },
  )

  it('ignores composing Enter/Escape and direct submit, then allows normal keyboard cancellation', async () => {
    const form = fixture()
    const tree = form.open()
    find(tree, type => type === 'form').onCompositionStart?.()
    for (const value of ['Enter', 'Escape']) expect(key(tree, value, true).preventDefault).toHaveBeenCalledOnce()
    expect(key(tree, 'Enter', false, 229).preventDefault).toHaveBeenCalledOnce()
    submit(tree)
    expect(form.create).not.toHaveBeenCalled()
    expect(find(form.render(), type => type === 'form')).toBeDefined()
    find(tree, type => type === 'form').onCompositionEnd?.()
    key(tree, 'Escape')
    await settle()
    expect(() => find(form.render(), type => type === 'form')).toThrow('Expected component control')
    expect(form.focusCreate).toHaveBeenCalledOnce()
  })

  it.each(['other', null])(
    'retains the captured scope and draft, blocking current and stale submits after scope becomes %s',
    nextScope => {
      const form = fixture()
      const originalTree = form.input(form.open(), 'Название нового вида', 'Исходный вид')
      const tree = form.render({ scopeId: nextScope })
      submit(originalTree)
      submit(tree)
      expect(form.create).not.toHaveBeenCalled()
      expect(find(tree, (type, p) => type === 'button' && p.type === 'submit').disabled).toBe(true)
      expect(find(tree, (_, p) => p['aria-label'] === 'Название нового вида').value).toBe('Исходный вид')
      expect(find(tree, (type, p) => type === 'code' && p.children === 'shop')).toBeDefined()
      key(tree, 'Escape')
      expect(() => find(form.render(), type => type === 'form')).toThrow('Expected component control')
    },
  )
})
