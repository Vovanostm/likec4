import { describe, expect, it } from 'vitest'
import { availableCanvasElementKinds } from './canvas-element-kinds'

describe('specification-derived create catalogue', () => {
  it('only exposes declared kinds and uses custom specification titles', () => {
    expect(availableCanvasElementKinds(new Set(['service', 'database']), new Map([['database', 'База данных']])))
      .toEqual([['database', 'База данных'], ['service', 'service']])
  })
  it('keeps known types ordered without inventing unavailable buttons', () => {
    expect(availableCanvasElementKinds(new Set(['service', 'component', 'actor'])))
      .toEqual([['actor', 'Актор'], ['component', 'Компонент'], ['service', 'service']])
    expect(availableCanvasElementKinds(new Set())).toEqual([])
  })
})
