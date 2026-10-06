import type { Fqn } from '@likec4/core/types'
import type { ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { removalReturnFocusTarget, RemoveElementConfirmation } from './RemoveElementConfirmation'
import type { RemoveElementConfirmationProps } from './RemoveElementConfirmation'

// Exercise the component's rendered handlers in Node, following ViewToolbar.spec.ts.
// Native dialog effects and DOM focus still require browser acceptance.
const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: () => undefined,
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

interface ProbeEvent {
  key?: string
  preventDefault(): void
  stopPropagation(): void
}

interface ProbeProps {
  children?: ReactNode
  role?: string
  disabled?: boolean
  'aria-busy'?: boolean
  onClick?: () => void | Promise<void>
  onCancel?: (event: ProbeEvent) => void
  onKeyDown?: (event: ProbeEvent) => void
}

function find(root: ReactNode, predicate: (type: unknown, props: ProbeProps) => boolean): ProbeProps {
  const pending: ReactNode[] = [root]
  while (pending.length) {
    const node = pending.shift()
    if (!isValidElement<ProbeProps>(node)) continue
    if (predicate(node.type, node.props)) return node.props
    pending.push(...Children.toArray(node.props.children))
  }
  throw new Error('Expected dialog control')
}

function setup(overrides: Partial<RemoveElementConfirmationProps> = {}) {
  const onConfirm = vi.fn<() => Promise<boolean>>(async () => false)
  const onCancel = vi.fn<() => void>()
  const props: { -readonly [K in keyof RemoveElementConfirmationProps]: RemoveElementConfirmationProps[K] } = {
    report: { target: 'shop' as Fqn, revision: '1', dependencies: [] },
    busy: false,
    onConfirm,
    onCancel,
    ...overrides,
  }
  const render = () => {
    hooks.cursor = 0
    return RemoveElementConfirmation(props)
  }
  const confirm = (tree = render()) => find(tree, (type, p) => type === 'button' && p.children === 'Удалить')
  const cancel = (tree = render()) => find(tree, (type, p) => type === 'button' && p.children === 'Отмена')
  const dialog = (tree = render()) => find(tree, type => type === 'dialog')
  const alert = () => find(render(), (_, p) => p.role === 'alert')
  return { props, render, confirm, cancel, dialog, alert, onConfirm, onCancel }
}

beforeEach(() => {
  hooks.cursor = 0
  hooks.slots = []
})

describe('removal dialog confirmation handlers', () => {
  it.each(['false', 'throw', 'reject'] as const)(
    'explains %s failure inside the dialog and allows retry and cancel',
    async failure => {
      const ui = setup()
      if (failure === 'throw') {
        ui.onConfirm.mockImplementationOnce(() => {
          throw new Error('internal compiler detail')
        })
      }
      if (failure === 'reject') ui.onConfirm.mockRejectedValueOnce(new Error('internal compiler detail'))
      await ui.confirm().onClick?.()
      expect(ui.alert().children).toBe(
        'Не удалось удалить элемент. Закройте окно и проверьте зависимости перед повторной попыткой.',
      )
      expect(ui.onCancel).not.toHaveBeenCalled()
      expect(ui.dialog()['aria-busy']).toBe(false)
      expect(ui.confirm().disabled).toBe(false)
      expect(ui.cancel().disabled).toBe(false)
      ui.onConfirm.mockResolvedValueOnce(true)
      await ui.confirm().onClick?.()
      expect(() => ui.alert()).toThrow('Expected dialog control')
      expect(ui.onConfirm).toHaveBeenCalledTimes(2)
      await ui.cancel().onClick?.()
      expect(ui.onCancel).toHaveBeenCalledOnce()
    },
  )

  it.each(['false', 'throw'] as const)('shows the parent error instead of fallback after %s', async failure => {
    const ui = setup()
    ui.onConfirm.mockImplementationOnce(async () => {
      ui.props.error = 'Ревизия изменилась. Закройте окно и проверьте зависимости.'
      if (failure === 'throw') throw new Error('internal detail')
      return false
    })
    await ui.confirm().onClick?.()
    expect(ui.alert().children).toBe(ui.props.error)
  })

  it('treats blank parent feedback as absent', async () => {
    const ui = setup({ error: '  ' })
    await ui.confirm().onClick?.()
    expect(ui.alert().children).toContain('Закройте окно и проверьте зависимости')
  })

  it('leaves success closure to the parent without reporting a failure', async () => {
    const ui = setup()
    ui.onConfirm.mockResolvedValueOnce(true)
    await ui.confirm().onClick?.()
    expect(ui.onConfirm).toHaveBeenCalledOnce()
    expect(ui.onCancel).not.toHaveBeenCalled()
    expect(() => ui.alert()).toThrow('Expected dialog control')
    expect(ui.dialog()['aria-busy']).toBe(false)
  })

  it('locks duplicate submission and all cancellation routes before pending renders', async () => {
    const ui = setup()
    let complete: (success: boolean) => void = () => {}
    ui.onConfirm.mockImplementationOnce(() =>
      new Promise<boolean>(resolve => {
        complete = resolve
      })
    )
    const tree = ui.render()
    const first = ui.confirm(tree).onClick?.()
    await ui.confirm(tree).onClick?.()
    await ui.cancel(tree).onClick?.()
    const event = { key: 'Escape', preventDefault: vi.fn<() => void>(), stopPropagation: vi.fn<() => void>() }
    ui.dialog(tree).onCancel?.(event)
    ui.dialog(tree).onKeyDown?.(event)
    expect(ui.onConfirm).toHaveBeenCalledOnce()
    expect(ui.onCancel).not.toHaveBeenCalled()
    expect(event.preventDefault).toHaveBeenCalledTimes(2)
    expect(event.stopPropagation).toHaveBeenCalledOnce()
    expect(ui.dialog()['aria-busy']).toBe(true)
    expect(ui.confirm().disabled).toBe(true)
    expect(ui.cancel().disabled).toBe(true)
    complete(false)
    await first
    expect(ui.dialog()['aria-busy']).toBe(false)
    ui.dialog().onKeyDown?.(event)
    expect(ui.onCancel).toHaveBeenCalledOnce()
  })

  it('clears local failure feedback while a retry is pending', async () => {
    const ui = setup()
    await ui.confirm().onClick?.()
    expect(ui.alert()).toBeDefined()
    let complete: (success: boolean) => void = () => {}
    ui.onConfirm.mockImplementationOnce(() =>
      new Promise<boolean>(resolve => {
        complete = resolve
      })
    )
    const retry = ui.confirm().onClick?.()
    expect(() => ui.alert()).toThrow('Expected dialog control')
    complete(false)
    await retry
    expect(ui.alert()).toBeDefined()
  })

  it('guards busy confirmation and cancellation', async () => {
    const ui = setup({ busy: true })
    await ui.confirm().onClick?.()
    await ui.cancel().onClick?.()
    const event = { key: 'Escape', preventDefault: vi.fn<() => void>(), stopPropagation: vi.fn<() => void>() }
    ui.dialog().onCancel?.(event)
    ui.dialog().onKeyDown?.(event)
    expect(ui.onConfirm).not.toHaveBeenCalled()
    expect(ui.onCancel).not.toHaveBeenCalled()
    expect(ui.dialog()['aria-busy']).toBe(true)
  })

  it.each(['unsupported', 'disabled'] as const)('blocks %s deletion while preserving cancellation', async reason => {
    const ui = setup()
    if (reason === 'unsupported') {
      ui.props.report = {
        ...ui.props.report,
        dependencies: [{
          id: 'dependency',
          kind: 'view-reference',
          uri: 'model.c4',
          range: { start: { line: 0, character: 0 }, end: { line: 0, character: 1 } },
          removal: 'unsupported',
        }],
      }
    } else ui.props.mutationDisabledReason = 'Редактирование недоступно.'
    expect(ui.confirm().disabled).toBe(true)
    await ui.confirm().onClick?.()
    expect(ui.onConfirm).not.toHaveBeenCalled()
    expect(ui.alert().children).toBe(
      reason === 'unsupported' ? 'Некоторые зависимости нельзя удалить безопасно' : 'Редактирование недоступно.',
    )
    ui.dialog().onCancel?.({ preventDefault: vi.fn<() => void>(), stopPropagation: vi.fn<() => void>() })
    expect(ui.onCancel).toHaveBeenCalledOnce()
  })
})

describe('removal dialog focus restoration', () => {
  const canvas = { isConnected: true, matches: () => false }

  it('restores the connected enabled opener', () => {
    const opener = { isConnected: true, matches: () => false }
    expect(removalReturnFocusTarget(opener, canvas)).toBe(opener)
  })

  it.each([
    null,
    { isConnected: false, matches: () => false },
    { isConnected: true, matches: () => true },
  ])('falls back to canvas when opener is unavailable', opener => {
    expect(removalReturnFocusTarget(opener, canvas)).toBe(canvas)
  })
})
