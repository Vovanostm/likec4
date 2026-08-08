import { describe, expect, it } from 'vitest'
import { pointerScreenPosition, resolveCanvasConnectionOutcome } from './CanvasConnection'

describe('CanvasConnection', () => {
  it('distinguishes connected, empty and cancelled completion', () => {
    expect(resolveCanvasConnectionOutcome(true, false)).toBe('connected')
    expect(resolveCanvasConnectionOutcome(false, true)).toBe('empty')
    expect(resolveCanvasConnectionOutcome(false, false)).toBe('cancelled')
  })

  it('normalizes mouse and touch screen coordinates', () => {
    expect(pointerScreenPosition({ clientX: 12, clientY: 34 } as MouseEvent)).toEqual({ x: 12, y: 34 })
    expect(pointerScreenPosition({
      changedTouches: { item: () => ({ clientX: 56, clientY: 78 }) },
    } as unknown as TouchEvent)).toEqual({ x: 56, y: 78 })
  })
})
