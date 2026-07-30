import type { ElementKind, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSource, fromSources } from '../node'
import {
  applyDocumentTextEdits,
  createDocumentEditService,
  DocumentEditError,
  sourceRevision,
} from './DocumentEditService'

const source = `specification {
  element actor
  element system
}

model {
  // shop must stay unchanged in this comment
  actor user 'User'
  system shop 'shop title must stay unchanged'
  user -> shop
}

views {
  view index of shop {
    include shop
  }
}
`

function applySingleDocumentPlan(
  currentSource: string,
  plan: Awaited<ReturnType<ReturnType<typeof createDocumentEditService>['planRenameElement']>>,
) {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(
    currentSource,
    plan.edits.filter(edit => edit.uri === uri),
    plan.baseRevisions[uri]!,
  )
}

describe('DocumentEditService', () => {
  it('adds an element at a CST-backed model boundary without rewriting neighbors', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)

    const plan = await service.planAddElement({
      id: 'billing',
      kind: 'system' as ElementKind,
      title: 'Billing',
    })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain('  system billing \'Billing\'\n}')
    expect(candidate).toContain('// shop must stay unchanged in this comment')
    expect(candidate).toContain('system shop \'shop title must stay unchanged\'')

    const reparsed = await fromSource(candidate)
    expect(reparsed.hasErrors()).toBe(false)
  })

  it('adds one directed relation without rewriting comments or neighboring declarations', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)

    const plan = await service.planAddRelation({
      source: 'shop' as Fqn,
      target: 'user' as Fqn,
    })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain('// shop must stay unchanged in this comment')
    expect(candidate).toContain('system shop \'shop title must stay unchanged\'')
    expect(candidate.match(/shop -> user/g)).toHaveLength(1)
    expect(candidate.indexOf('shop -> user')).toBeGreaterThan(candidate.indexOf('user -> shop'))

    const reparsed = await fromSource(candidate)
    expect(reparsed.hasErrors()).toBe(false)
  })

  it('rejects missing and self relation endpoints without producing edits', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)

    await expect(service.planAddRelation({ source: 'missing' as Fqn, target: 'user' as Fqn })).rejects
      .toMatchObject({ code: 'not-found' })
    await expect(service.planAddRelation({ source: 'user' as Fqn, target: 'missing' as Fqn })).rejects
      .toMatchObject({ code: 'not-found' })
    await expect(service.planAddRelation({ source: 'user' as Fqn, target: 'user' as Fqn })).rejects
      .toMatchObject({ code: 'invalid-operation' })
  })

  it('renames only the declaration and resolved semantic references', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)

    const plan = await service.planRenameElement({
      target: 'shop' as Fqn,
      newId: 'store',
    })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain('// shop must stay unchanged in this comment')
    expect(candidate).toContain('system store \'shop title must stay unchanged\'')
    expect(candidate).toContain('user -> store')
    expect(candidate).toContain('view index of store')
    expect(candidate).toContain('include store')
    expect(candidate).not.toContain('system shop')

    const reparsed = await fromSource(candidate)
    expect(reparsed.hasErrors()).toBe(false)
  })

  it('rejects invalid identifiers and collisions without producing edits', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)

    await expect(service.planRenameElement({ target: 'shop' as Fqn, newId: 'user' })).rejects.toMatchObject({
      code: 'collision',
    })
    await expect(service.planRenameElement({ target: 'shop' as Fqn, newId: 'not valid' })).rejects.toMatchObject({
      code: 'invalid-identifier',
    })
  })

  it('inspects dependencies before remove and requires exact revision-bound approval', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)

    const report = service.inspectRemoveElement({ target: 'shop' as Fqn })

    expect(report.dependencies.length).toBeGreaterThanOrEqual(3)
    expect(report.dependencies.some(dependency => dependency.kind === 'scoped-view')).toBe(true)

    expect(() => service.planRemoveElement({ target: 'shop' as Fqn })).toThrowError(DocumentEditError)
    expect(() =>
      service.planRemoveElement({
        target: 'shop' as Fqn,
        dependencyRevision: 'stale',
        approvedDependencyIds: report.dependencies.map(dependency => dependency.id),
      })
    ).toThrowError(expect.objectContaining({ code: 'stale-document' }))
  })

  it('removes an element and every explicitly approved removable dependency atomically', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    const report = service.inspectRemoveElement({ target: 'shop' as Fqn })

    const plan = service.planRemoveElement({
      target: 'shop' as Fqn,
      dependencyRevision: report.revision,
      approvedDependencyIds: report.dependencies.map(dependency => dependency.id),
    })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain('// shop must stay unchanged in this comment')
    expect(candidate).not.toContain('system shop \'shop title must stay unchanged\'')
    expect(candidate).not.toContain('user -> shop')
    expect(candidate).not.toContain('view index of shop')

    const reparsed = await fromSource(candidate)
    expect(reparsed.hasErrors()).toBe(false)
  })

  it('rejects applying a plan to a stale source revision', () => {
    const expected = sourceRevision(source)
    expect(() =>
      applyDocumentTextEdits(
        `${source}// changed\n`,
        [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: '' }],
        expected,
      )
    ).toThrowError(expect.objectContaining({ code: 'stale-document' }))
  })
})
