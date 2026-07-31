import type { Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSources } from '../node'
import { applyDocumentTextEdits } from './DocumentEditService'
import { createElementViewDocumentEditService } from './ElementViewDocumentEditService'

const source = `specification {
  element system
  element component
}

model {
  system shop 'Shop' {
    component web 'Web'
  }
}

views {
  // existing view must stay byte-identical
  view index of shop {
    include *
  }
}
`

function applyPlan(current: string, plan: Awaited<ReturnType<ReturnType<typeof createElementViewDocumentEditService>['planAddElementView']>>): string {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(current, plan.edits.filter(edit => edit.uri === uri), plan.baseRevisions[uri]!)
}

describe('ElementViewDocumentEditService', () => {
  it('adds one scoped element view without rewriting neighbours', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const plan = await createElementViewDocumentEditService(likec4).planAddElementView({
      id: 'web',
      viewOf: 'shop.web' as Fqn,
      title: 'Web view',
      documentUri: 'model.c4',
    })
    const candidate = applyPlan(source, plan)

    expect(candidate).toContain("view web of shop.web {\n    title 'Web view'\n    include *\n  }")
    expect(candidate).toContain('// existing view must stay byte-identical')
    expect(candidate.match(/view web of/g)).toHaveLength(1)
    const reparsed = await fromSources({ 'model.c4': candidate })
    expect(reparsed.hasErrors()).toBe(false)
  })

  it('creates a views block at a CST-backed document boundary', async () => {
    const withoutViews = source.slice(0, source.indexOf('\nviews {'))
    const likec4 = await fromSources({ 'model.c4': withoutViews })
    const plan = await createElementViewDocumentEditService(likec4).planAddElementView({
      id: 'shop_view',
      viewOf: 'shop' as Fqn,
      documentUri: 'model.c4',
    })
    const candidate = applyPlan(withoutViews, plan)

    expect(candidate).toContain('views {\n  view shop_view of shop {\n    include *\n  }\n}')
    const reparsed = await fromSources({ 'model.c4': candidate })
    expect(reparsed.hasErrors()).toBe(false)
  })

  it('targets the requested source document in a multi-file workspace', async () => {
    const modelOnly = source.slice(0, source.indexOf('\nviews {'))
    const viewsOnly = `views {\n  view index of shop { include * }\n}\n`
    const likec4 = await fromSources({ 'model.c4': modelOnly, 'views.c4': viewsOnly })
    const plan = await createElementViewDocumentEditService(likec4).planAddElementView({
      id: 'web',
      viewOf: 'shop.web' as Fqn,
      documentUri: 'views.c4',
    })

    expect(plan.affectedDocuments).toHaveLength(1)
    expect(plan.affectedDocuments[0]).toContain('views.c4')
    expect(applyPlan(viewsOnly, plan)).toContain('view web of shop.web')
  })

  it('rejects duplicate and invalid view IDs', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createElementViewDocumentEditService(likec4)

    await expect(service.planAddElementView({ id: 'index', viewOf: 'shop' as Fqn })).rejects
      .toMatchObject({ code: 'collision' })
    await expect(service.planAddElementView({ id: 'bad id', viewOf: 'shop' as Fqn })).rejects
      .toMatchObject({ code: 'invalid-identifier' })
  })

  it('rejects a missing logical scope without producing edits', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    await expect(createElementViewDocumentEditService(likec4).planAddElementView({
      id: 'missing',
      viewOf: 'missing' as Fqn,
    })).rejects.toMatchObject({ code: 'not-found' })
  })
})
