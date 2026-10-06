import { describe, expect, it, vi } from 'vitest'
import { canvasMenuFocusIndex, dismissCanvasMenu } from './CanvasQuickCreateMenu'

describe('canvas menu keyboard navigation', () => {
  it.each([
    [0, 3, 'ArrowUp', 2],
    [2, 3, 'ArrowDown', 0],
    [-1, 3, 'ArrowUp', 2],
    [-1, 3, 'ArrowDown', 0],
    [1, 3, 'Home', 0],
    [1, 3, 'End', 2],
    [0, 1, 'ArrowDown', 0],
    [0, 0, 'ArrowDown', null],
    [0, 3, 'Tab', null],
    [0, 3, 'Enter', null],
  ])('moves from %i among %i enabled items with %s', (current, count, key, expected) => {
    expect(canvasMenuFocusIndex(current, count, key)).toBe(expected)
  })

  it('outside dismissal reports its reason without scheduling focus restoration', () => {
    const close = vi.fn<() => void>()
    const microtask = vi.spyOn(globalThis, 'queueMicrotask')
    dismissCanvasMenu(null, 'outside', close)
    expect(close).toHaveBeenCalledWith('outside')
    expect(microtask).not.toHaveBeenCalled()
    microtask.mockRestore()
  })
})
