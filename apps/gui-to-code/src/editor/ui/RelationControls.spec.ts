import { describe, expect, it } from 'vitest'
import { filterRelationElements } from './RelationControls'

describe('cross-level relationship endpoint search', () => {
  const elements = [
    { id: 'root.a.worker', title: 'Обработчик заказов' },
    { id: 'root.b.db', title: 'База данных' },
    { id: 'external', title: 'Платёжная система' },
  ]
  it('matches title and path tokens, independently of case', () => {
    expect(filterRelationElements(elements, 'Заказов ROOT.A', '', '')).toEqual([elements[0]])
    expect(filterRelationElements(elements, 'missing', '', '')).toEqual([])
    expect(filterRelationElements(elements, ' ', '', '')).toEqual(elements)
  })
  it('retains chosen endpoints when searching for a different branch or getting no matches', () => {
    expect(filterRelationElements(elements, 'данных', 'root.a.worker', 'external')).toEqual(elements)
    expect(filterRelationElements(elements, 'missing', 'root.a.worker', 'external'))
      .toEqual([elements[0], elements[2]])
  })
})
