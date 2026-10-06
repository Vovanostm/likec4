import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { EditorHistory } from '../contracts'
import { HistoryPanel } from './HistoryPanel'

const history: EditorHistory = {
  past: [{
    revision: 0,
    document: { sources: [], manualLayouts: {} },
    action: { type: 'workspace.open', label: 'Начальное состояние' },
  }],
  current: { type: 'element.patch', label: 'Свойства элемента: api' },
  future: [{
    revision: 2,
    document: { sources: [], manualLayouts: {} },
    action: { type: 'layout.save', label: 'Ручная раскладка: index' },
  }],
}

describe('history panel', () => {
  it('distinguishes the selected state and redo states in the chronological list', () => {
    const html = renderToStaticMarkup(
      createElement(HistoryPanel, { history, disabledReason: null, onSelect: () => {} }),
    )
    expect(html.match(/aria-current="step"/g)).toHaveLength(1)
    expect(html).toContain('Сейчас')
    expect(html).toContain('Отменено')
    expect(html.indexOf('Начальное состояние')).toBeLessThan(html.indexOf('Свойства элемента: api'))
    expect(html.indexOf('Свойства элемента: api')).toBeLessThan(html.indexOf('Ручная раскладка: index'))
    expect(html).not.toContain('disabled=""')
  })

  it('disables every state and explains why while mutation is unavailable', () => {
    const html = renderToStaticMarkup(createElement(HistoryPanel, {
      history,
      disabledReason: 'Дождитесь сохранения раскладки.',
      onSelect: () => {},
    }))
    expect(html.match(/disabled=""/g)).toHaveLength(3)
    expect(html).toContain('Дождитесь сохранения раскладки.')
  })
})
