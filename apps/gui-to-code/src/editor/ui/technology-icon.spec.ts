import { createElement, Fragment } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { technologyCatalogue } from './technology-catalogue'
import { renderTechnologyIcon } from './technology-icon'

describe('bundled technology icon renderer', () => {
  it.each(technologyCatalogue)('renders the $label logo as a local SVG', entry => {
    const markup = renderToStaticMarkup(createElement(
      Fragment,
      null,
      renderTechnologyIcon({
        node: { id: 'service', title: 'Сервис', icon: entry.icon },
        className: 'diagram-icon',
      }),
    ))
    expect(markup).toContain('<svg')
    expect(markup).toContain('<path')
    expect(markup).toContain('class="diagram-icon"')
    expect(markup).toContain(`data-technology-icon="${entry.icon}"`)
    expect(markup).toContain(`aria-label="Логотип технологии ${entry.label}"`)
    expect(markup).not.toContain('<img')
    expect(markup).not.toMatch(/(?:src|href)="(?:https?:)?\/\//)
  })

  it('has no stale fallback image after clearing or using an unknown icon', () => {
    for (const icon of [null, undefined, 'tech:unknown']) {
      expect(renderTechnologyIcon({ node: { id: 'service', title: 'Сервис', icon } })).toBeNull()
    }
  })
})
