import type { ElementKind } from '@likec4/core/types'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import { CanvasCreateMenu, submitCanvasCreation } from './CanvasCreateMenu'
import { CanvasQuickCreateMenu } from './CanvasQuickCreateMenu'

describe('canvas create catalogue and keyboard surface', () => {
  const props = {
    screenPosition: { x: 10, y: 20 },
    availableKinds: new Set(['service']),
    kindTitles: new Map([['service', 'Сервис']]),
    busy: false,
    onCancel: vi.fn<() => void>(),
  }

  it('uses the declared custom kind and keeps plain creation controls outside Tab order', () => {
    const markup = renderToStaticMarkup(createElement(CanvasCreateMenu, {
      ...props,
      connected: false,
      onCreate: vi.fn<() => Promise<boolean>>(async () => true),
    }))
    expect(markup).toContain('Сервис')
    expect(markup).not.toContain('Актор')
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(2)
  })

  it('keeps connected title and actions in ordinary form navigation', () => {
    const markup = renderToStaticMarkup(createElement(CanvasCreateMenu, {
      ...props,
      connected: true,
      onCreate: vi.fn<() => Promise<boolean>>(async () => true),
    }))
    expect(markup).toContain('Название нового элемента')
    expect(markup).not.toContain('tabindex="-1"')
  })

  it('uses the same catalogue for quick creation and removes every menu item from Tab order', () => {
    const markup = renderToStaticMarkup(createElement(CanvasQuickCreateMenu, {
      ...props,
      description: 'Создание элемента',
      relationLabel: 'Создать связь',
      relationDisabled: true,
      onCreateElement: vi.fn<() => void>(),
      onCreateRelation: vi.fn<() => void>(),
    }))
    expect(markup).toContain('Создать: Сервис')
    expect(markup).not.toContain('Актор')
    expect(markup.match(/role="menuitem"/g)).toHaveLength(3)
    expect(markup.match(/tabindex="-1"/g)).toHaveLength(3)
  })
})

it('releases submission after rejection without an intermediate busy render, allowing retry and cancel', async () => {
  const lock = { current: false }
  const request = { kind: 'service' as ElementKind, title: 'Exact draft' }
  expect(await submitCanvasCreation(lock, request, async () => false)).toBe(false)
  expect(lock.current).toBe(false)
  await expect(submitCanvasCreation(lock, request, async () => {
    throw new Error('failure')
  })).rejects.toThrow('failure')
  expect(lock.current).toBe(false)
  expect(await submitCanvasCreation(lock, request, async value => value.title === 'Exact draft')).toBe(true)
})
