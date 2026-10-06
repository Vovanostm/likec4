import type { LayoutedView, ViewId } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { findDetailView, scopeLevelLabel, viewBreadcrumbs, viewLevelLabel } from './level-navigation'

function view(id: string, scope?: string): LayoutedView {
  return {
    id,
    _type: 'element',
    title: id,
    sourcePath: 'model.c4',
    ...(scope ? { viewOf: scope } : {}),
  } as LayoutedView
}

const selected = (id: string) => id as ViewId

describe('architecture level navigation', () => {
  it('derives context, containers and components from containment, regardless of view IDs or custom kinds', () => {
    expect(viewLevelLabel(view('arbitrary-context'))).toBe('C1 · Контекст')
    expect(viewLevelLabel(view('not-c2', 'customRoot'))).toBe('C2 · Контейнеры')
    expect(viewLevelLabel(view('not-c3', 'customRoot.worker'))).toBe('C3 · Компоненты')
    expect(scopeLevelLabel('customRoot.worker.part')).toBe('Уровень 4 · Детализация')
    expect(scopeLevelLabel('root.a.b.c.d.e.f.g')).toBe('Уровень 9 · Детализация')
  })

  it('returns root and scoped ancestors in order, excluding siblings and similar FQN prefixes', () => {
    const views = [
      view('siblings', 'shop.other'),
      view('leaf', 'shop.api'),
      view('unrelated', 'shopper'),
      view('root'),
      view('containers', 'shop'),
    ]
    expect(viewBreadcrumbs(views, selected('leaf')).map(item => item.id)).toEqual(['root', 'containers', 'leaf'])
    expect(views.map(item => item.id)).toEqual(['siblings', 'leaf', 'unrelated', 'root', 'containers'])
  })

  it('skips absent parent views and keeps current view last even with other views of the same scope', () => {
    expect(viewBreadcrumbs([view('root'), view('leaf', 'shop.api')], selected('leaf')).map(item => item.id))
      .toEqual(['root', 'leaf'])
    expect(viewBreadcrumbs([view('other', 'shop'), view('current', 'shop')], selected('current')).map(item => item.id))
      .toEqual(['current'])
  })

  it('chooses one deterministic authored view per ancestor scope', () => {
    const views = [view('z-context'), view('a-context'), view('z-details', 'shop'), view('a-details', 'shop')]
    expect(viewBreadcrumbs(views, selected('z-details')).map(item => item.id)).toEqual(['a-context', 'z-details'])
    expect(findDetailView(views, 'shop')?.id).toBe('a-details')
    expect(findDetailView(views, null)).toBeNull()
    expect(findDetailView(views, 'missing')).toBeNull()
  })

  it('does not expose the compiler synthetic index as an authored ancestor', () => {
    const synthetic = { ...view('index'), sourcePath: undefined }
    expect(viewBreadcrumbs([synthetic, view('leaf', 'shop')], selected('leaf')).map(item => item.id)).toEqual(['leaf'])
  })

  it('does not invent C4 navigation for dynamic or deployment views or missing selection', () => {
    const dynamic = { id: 'flow', _type: 'dynamic', title: 'Сценарий' } as LayoutedView
    const deployment = { id: 'infra', _type: 'deployment', title: 'Среда' } as LayoutedView
    expect(viewLevelLabel(dynamic)).toBe('Сценарий')
    expect(viewLevelLabel(deployment)).toBe('Среда')
    expect(viewBreadcrumbs([view('root'), dynamic], selected('flow'))).toEqual([dynamic])
    expect(viewBreadcrumbs([view('root')], selected('missing'))).toEqual([])
    expect(viewBreadcrumbs([view('root')], null)).toEqual([])
    expect(findDetailView([dynamic, deployment], 'shop')).toBeNull()
  })
})
