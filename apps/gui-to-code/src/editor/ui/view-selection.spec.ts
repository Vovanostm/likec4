import type { LayoutedView, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { reconcileActiveView, viewOptions } from './view-selection'

function view(id: string): LayoutedView {
  return { id, sourcePath: 'model.c4' } as LayoutedView
}

describe('active view reconciliation', () => {
  it('keeps an existing active view', () => {
    expect(reconcileActiveView('details' as ViewId, [view('index'), view('details')])).toBe('details')
  })

  it('falls back to index and then the first available view', () => {
    expect(reconcileActiveView('removed' as ViewId, [view('details'), view('index')])).toBe('index')
    expect(reconcileActiveView('removed' as ViewId, [view('beta'), view('alpha')])).toBe('alpha')
    expect(reconcileActiveView(null, [])).toBeNull()
  })

  it('selects an authored diagram instead of the compiler fallback after reload or redo', () => {
    const synthetic = { id: 'index' } as LayoutedView
    expect(reconcileActiveView(null, [synthetic, view('main')])).toBe('main')
    expect(reconcileActiveView('index' as ViewId, [synthetic, view('main')])).toBe('main')
    expect(viewOptions([synthetic, view('main')]).map(item => item.id)).toEqual(['main'])
    expect(reconcileActiveView(null, [synthetic])).toBe('index')
    expect(reconcileActiveView(null, [view('index'), view('main')])).toBe('index')
  })

  it('orders index first without mutating the input', () => {
    const input = [view('zeta'), view('index'), view('alpha')]
    expect(viewOptions(input).map(item => item.id)).toEqual(['index', 'alpha', 'zeta'])
    expect(input.map(item => item.id)).toEqual(['zeta', 'index', 'alpha'])
  })
})
