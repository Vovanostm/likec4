import type { LayoutedView, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { reconcileActiveView, viewOptions } from './view-selection'

function view(id: string): LayoutedView {
  return { id } as LayoutedView
}

describe('active view reconciliation', () => {
  it('keeps an existing active view', () => {
    expect(reconcileActiveView('details' as ViewId, [view('index'), view('details')])).toBe('details')
  })

  it('falls back to index and then the first available view', () => {
    expect(reconcileActiveView('removed' as ViewId, [view('details'), view('index')])).toBe('index')
    expect(reconcileActiveView('removed' as ViewId, [view('beta'), view('alpha')])).toBe('beta')
    expect(reconcileActiveView(null, [])).toBeNull()
  })

  it('orders index first without mutating the input', () => {
    const input = [view('zeta'), view('index'), view('alpha')]
    expect(viewOptions(input).map(item => item.id)).toEqual(['index', 'alpha', 'zeta'])
    expect(input.map(item => item.id)).toEqual(['zeta', 'index', 'alpha'])
  })
})
