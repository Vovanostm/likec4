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
  // keep this comment and spacing
  view index of shop {
    include *
  }
}
`

function apply(current: string, plan: Awaited<ReturnType<ReturnType<typeof createElementViewDocumentEditService>['planAddElementView']>>): string {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(
    current,
    plan.edits.filter(edit => edit.uri === uri),
    plan.baseRevisions[uri]!,
  )
}

describe('ElementViewDocumentEditService WP-05 safety', () => {
  it('rejects applying a plan to a stale source revision', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const plan = await createElementViewDocumentEditService(likec4).planAddElementView({
      id: 'web',
      viewOf: 'shop.web' as Fqn,
      documentUri: 'model.c4',
    })

    expect(() => apply(`${source}\n// concurrent edit\n`, plan)).toThrowError(
      expect.objectContaining({ code: 'stale-document' }),
    )
  })

  it('preserves every byte outside the single CST-backed insertion range', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const plan = await createElementViewDocumentEditService(likec4).planAddElementView({
      id: 'web',
      title: 'Web',
      viewOf: 'shop.web' as Fqn,
      documentUri: 'model.c4',
    })

    expect(plan.edits).toHaveLength(1)
    const candidate = apply(source, plan)
    const inserted = "\n  view web of shop.web {\n    title 'Web'\n    include *\n  }\n"
    expect(candidate.replace(inserted, '')).toBe(source)
    expect(candidate.match(/view web of shop\.web/g)).toHaveLength(1)
  })

  it('fails a retry after the first candidate has already created the view', async () => {
    const first = await fromSources({ 'model.c4': source })
    const firstPlan = await createElementViewDocumentEditService(first).planAddElementView({
      id: 'web',
      viewOf: 'shop.web' as Fqn,
      documentUri: 'model.c4',
    })
    const candidate = apply(source, firstPlan)
    const second = await fromSources({ 'model.c4': candidate })

    await expect(createElementViewDocumentEditService(second).planAddElementView({
      id: 'web',
      viewOf: 'shop.web' as Fqn,
      documentUri: 'model.c4',
    })).rejects.toMatchObject({ code: 'collision' })
  })
})
