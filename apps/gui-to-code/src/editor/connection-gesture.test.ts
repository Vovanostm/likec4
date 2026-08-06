import type { ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { canCompleteConnectionGesture, captureConnectionGesture } from './connection-gesture'

const current = {
  enabled: true,
  revision: 7,
  viewId: 'index' as ViewId,
} as const

describe('direct connection gesture guard', () => {
  it('captures the current view and revision only when authoring is enabled', () => {
    expect(captureConnectionGesture(current)).toEqual({ revision: 7, viewId: 'index' })
    expect(captureConnectionGesture({ ...current, enabled: false })).toBeNull()
  })

  it('accepts completion only for the exact captured context', () => {
    const started = captureConnectionGesture(current)
    expect(canCompleteConnectionGesture(started, current)).toBe(true)
  })

  it('rejects view changes during a gesture', () => {
    const started = captureConnectionGesture(current)
    expect(canCompleteConnectionGesture(started, { ...current, viewId: 'secondary' as ViewId })).toBe(false)
  })

  it('rejects revision changes during a gesture', () => {
    const started = captureConnectionGesture(current)
    expect(canCompleteConnectionGesture(started, { ...current, revision: 8 })).toBe(false)
  })

  it('rejects completion while authoring is disabled', () => {
    const started = captureConnectionGesture(current)
    expect(canCompleteConnectionGesture(started, { ...current, enabled: false })).toBe(false)
    expect(canCompleteConnectionGesture(null, current)).toBe(false)
  })
})
