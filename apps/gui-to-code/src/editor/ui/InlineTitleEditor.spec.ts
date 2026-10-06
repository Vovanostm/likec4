import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  inlineTitlePlacement,
  isTitleComposition,
  observeInlineTitlePlacement,
  saveInlineTitleOnce,
} from './InlineTitleEditor'

describe('inline title placement (Node geometry, not browser layout)', () => {
  afterEach(() => vi.unstubAllGlobals())

  it.each([
    [{ x: 180, y: 120 }, { x: 180, y: 120 }],
    [{ x: -20, y: -10 }, { x: 12, y: 12 }],
    [{ x: 590, y: 390 }, { x: 268, y: 278 }],
    [null, { x: 12, y: 64 }],
  ])('keeps the form inside a normal canvas for anchor %j', (anchor, expected) => {
    const placement = inlineTitlePlacement(anchor, { width: 600, height: 400 }, { width: 320, height: 110 })
    expect(placement).toEqual({ ...expected, maxWidth: 576, maxHeight: 376 })
    expect(placement.x + 320).toBeLessThanOrEqual(588)
    expect(placement.y + 110).toBeLessThanOrEqual(388)
  })

  it('limits an oversized form to the scrollable space of a tiny canvas without changing the anchor', () => {
    const anchor = { x: 115, y: 75 }
    expect(inlineTitlePlacement(anchor, { width: 120, height: 80 }, { width: 320, height: 240 })).toEqual({
      x: 12,
      y: 12,
      maxWidth: 96,
      maxHeight: 56,
    })
    expect(anchor).toEqual({ x: 115, y: 75 })
    expect(inlineTitlePlacement(null, { width: 20, height: 16 }, { width: 320, height: 240 })).toEqual({
      x: 4,
      y: 4,
      maxWidth: 12,
      maxHeight: 8,
    })
  })

  it('remeasures panel resize and error growth, and disconnects all subscriptions on cleanup', () => {
    // Minimal measured-element doubles exercise the production observer callback, not DOM rendering.
    class MeasuredElement {
      clientWidth = 600
      clientHeight = 400
      width = 320
      height = 110
      offsetParent: MeasuredElement | null = null
      style = { left: '', top: '', maxWidth: '', maxHeight: '' }
      get offsetWidth() {
        return Math.min(this.width, Number.parseFloat(this.style.maxWidth))
      }
      get offsetHeight() {
        return Math.min(this.height, Number.parseFloat(this.style.maxHeight))
      }
    }
    const observed: unknown[] = []
    const disconnect = vi.fn<() => void>()
    let resized: () => void = () => {}
    class Observer {
      constructor(callback: () => void) {
        resized = callback
      }
      observe(element: unknown) {
        observed.push(element)
      }
      disconnect = disconnect
    }
    const viewport = new EventTarget()
    const addListener = vi.spyOn(viewport, 'addEventListener')
    const removeListener = vi.spyOn(viewport, 'removeEventListener')
    vi.stubGlobal('HTMLElement', MeasuredElement)
    vi.stubGlobal('ResizeObserver', Observer)
    vi.stubGlobal('window', viewport)
    const panel = new MeasuredElement()
    const form = new MeasuredElement()
    form.offsetParent = panel
    const cleanup = observeInlineTitlePlacement(form as unknown as HTMLElement, { x: 590, y: 390 })
    expect(observed).toEqual([panel, form])
    expect(form.style).toEqual({ left: '268px', top: '278px', maxWidth: '576px', maxHeight: '376px' })

    panel.clientWidth = 400
    panel.clientHeight = 260
    resized()
    expect(form.style).toEqual({ left: '68px', top: '138px', maxWidth: '376px', maxHeight: '236px' })

    form.height = 220
    resized()
    expect(form.style.top).toBe('28px')
    form.height = 500
    resized()
    expect(form.style.top).toBe('12px')

    panel.clientWidth = 120
    panel.clientHeight = 80
    viewport.dispatchEvent(new Event('resize'))
    expect(form.style).toEqual({ left: '12px', top: '12px', maxWidth: '96px', maxHeight: '56px' })
    const finalStyle = { ...form.style }
    cleanup()
    expect(disconnect).toHaveBeenCalledOnce()
    expect(removeListener).toHaveBeenCalledWith('resize', addListener.mock.calls[0]?.[1])
    panel.clientWidth = 600
    panel.clientHeight = 400
    viewport.dispatchEvent(new Event('resize'))
    resized() // Even a previously queued observer callback is inert after cleanup.
    expect(form.style).toEqual(finalStyle)
  })
})

describe('inline title save', () => {
  it('serializes Enter, click and outside blur before busy is rendered', async () => {
    let finish: (saved: boolean) => void = () => {}
    const save = vi.fn<() => Promise<boolean>>(() =>
      new Promise<boolean>(resolve => {
        finish = resolve
      })
    )
    const focus = vi.fn<() => void>()
    const lock = { current: false }
    const first = saveInlineTitleOnce(lock, false, 'Название', 'explicit', save, focus)
    expect(await saveInlineTitleOnce(lock, false, 'Название', 'blur', save, focus)).toBeNull()
    expect(await saveInlineTitleOnce(lock, false, 'Название', 'explicit', save, focus)).toBeNull()
    expect(save).toHaveBeenCalledTimes(1)
    finish(true)
    expect(await first).toBe(true)
    expect(focus).toHaveBeenCalledTimes(1)
    expect(lock.current).toBe(false)
  })

  it('commits outside blur without stealing focus', async () => {
    const focus = vi.fn<() => void>()
    expect(await saveInlineTitleOnce({ current: false }, false, 'Название', 'blur', async () => true, focus)).toBe(true)
    expect(focus).not.toHaveBeenCalled()
  })

  it('releases a rejected or thrown save for retry without returning focus', async () => {
    const lock = { current: false }
    const focus = vi.fn<() => void>()
    expect(await saveInlineTitleOnce(lock, false, 'Название', 'explicit', async () => false, focus)).toBe(false)
    await expect(saveInlineTitleOnce(lock, false, 'Название', 'blur', async () => {
      throw new Error('compiler failure')
    }, focus)).rejects.toThrow('compiler failure')
    expect(lock.current).toBe(false)
    expect(focus).not.toHaveBeenCalled()
    expect(await saveInlineTitleOnce(lock, false, 'Название', 'explicit', async () => true, focus)).toBe(true)
  })

  it.each([[true, 'Название'], [false, '   '], [false, '']])(
    'does not submit busy=%s title=%j',
    async (busy, title) => {
      const save = vi.fn<() => Promise<boolean>>(async () => true)
      expect(await saveInlineTitleOnce({ current: false }, busy, title, 'explicit', save, vi.fn<() => void>()))
        .toBeNull()
      expect(save).not.toHaveBeenCalled()
    },
  )
})

describe('inline and connected title IME guard', () => {
  it.each([
    [{ isComposing: true, keyCode: 13 }, false, true],
    [{ isComposing: false, keyCode: 229 }, false, true],
    [{ isComposing: false, keyCode: 27 }, true, true],
    [{ isComposing: false, keyCode: 13 }, false, false],
    [{ isComposing: false, keyCode: 27 }, false, false],
  ])('recognizes composition before consuming Enter/Escape', (event, composing, expected) => {
    expect(isTitleComposition(event, composing)).toBe(expected)
  })
})
