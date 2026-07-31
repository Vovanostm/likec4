import type { ElementKind, Fqn } from '@likec4/core/types'
import { describe, expect, it } from 'vitest'
import { fromSource, fromSources } from '../node'
import {
  applyDocumentTextEdits,
  createDocumentEditService,
  DocumentEditError,
  sourceRevision,
} from './DocumentEditService'
import type { SourceEditPlan } from './DocumentEditService'

const source = `specification {
  element actor
  element system
  element component
  tag ui
  tag backend
}

model {
  // shop must stay unchanged in this comment
  actor user 'User'
  system shop 'Shop' {
    // nested comment must move with the subtree
    component web 'Web application' {
      #ui
      description 'Frontend'
      technology 'TypeScript'
    }
    component api 'API'
  }
  system platform 'Platform'
  user -> shop.web
  shop.api -> user
}

views {
  view index of shop {
    include shop.web
  }
}
`

function applySingleDocumentPlan(currentSource: string, plan: SourceEditPlan): string {
  const uri = plan.affectedDocuments[0]!
  return applyDocumentTextEdits(
    currentSource,
    plan.edits.filter(edit => edit.uri === uri),
    plan.baseRevisions[uri]!,
  )
}

async function expectValid(candidate: string) {
  const reparsed = await fromSource(candidate)
  expect(reparsed.hasErrors()).toBe(false)
  return reparsed
}

describe('DocumentEditService', () => {
  it('adds an element and relation at CST-backed model boundaries', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    const elementPlan = await service.planAddElement({
      id: 'billing',
      kind: 'system' as ElementKind,
      title: 'Billing',
    })
    const withElement = applySingleDocumentPlan(source, elementPlan)
    await expectValid(withElement)
    expect(withElement).toContain("system billing 'Billing'")

    const withElementModel = await fromSources({ 'model.c4': withElement })
    const relationPlan = await createDocumentEditService(withElementModel).planAddRelation({
      source: 'billing' as Fqn,
      target: 'user' as Fqn,
    })
    const candidate = applySingleDocumentPlan(withElement, relationPlan)
    expect(candidate).toContain('billing -> user')
    expect(candidate).toContain('// shop must stay unchanged in this comment')
    await expectValid(candidate)
  })

  it('patches title description technology and tags without rewriting nested declarations', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    const plan = await service.planPatchElement({
      target: 'shop.web' as Fqn,
      patch: {
        title: 'Storefront',
        description: null,
        technology: 'React',
        tags: ['backend', 'ui', 'ui'],
      },
    })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain("title 'Storefront'")
    expect(candidate).not.toContain("description 'Frontend'")
    expect(candidate).toContain("technology 'React'")
    expect(candidate).toContain('#backend, #ui')
    expect(candidate).toContain("component api 'API'")
    expect(candidate).toContain('// nested comment must move with the subtree')
    await expectValid(candidate)
  })

  it('rejects invalid title and unknown tags before producing a plan', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    await expect(service.planPatchElement({ target: 'shop.web' as Fqn, patch: { title: '   ' } })).rejects
      .toMatchObject({ code: 'invalid-title' })
    await expect(service.planPatchElement({ target: 'shop.web' as Fqn, patch: { tags: ['unknown'] } })).rejects
      .toMatchObject({ code: 'invalid-tag' })
  })

  it('renames a root subtree and remaps typed references to descendants', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    const plan = await service.planRenameElement({ target: 'shop' as Fqn, newId: 'store' })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain("system store 'Shop'")
    expect(candidate).toContain('user -> store.web')
    expect(candidate).toContain('store.api -> user')
    expect(candidate).toContain('view index of store')
    expect(candidate).toContain('include store.web')
    expect(candidate).toContain('// shop must stay unchanged in this comment')
    expect(candidate).not.toContain('system shop')
    await expectValid(candidate)
  })

  it('moves a nested subtree to another parent and updates references', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    const plan = await service.planMoveElement({ target: 'shop.web' as Fqn, parent: 'platform' as Fqn })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain("system platform 'Platform' {")
    expect(candidate).toContain("component web 'Web application'")
    expect(candidate).toContain('// nested comment must move with the subtree')
    expect(candidate).toContain('user -> platform.web')
    expect(candidate).toContain('include platform.web')
    expect(candidate).not.toContain('user -> shop.web')
    await expectValid(candidate)
  })

  it('moves a root subtree under a parent and back to root', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const nestedPlan = await createDocumentEditService(likec4).planMoveElement({
      target: 'shop' as Fqn,
      parent: 'platform' as Fqn,
    })
    const nested = applySingleDocumentPlan(source, nestedPlan)
    await expectValid(nested)
    expect(nested).toContain('platform.shop.web')

    const nestedModel = await fromSources({ 'model.c4': nested })
    const rootPlan = await createDocumentEditService(nestedModel).planMoveElement({
      target: 'platform.shop' as Fqn,
      parent: null,
    })
    const root = applySingleDocumentPlan(nested, rootPlan)
    await expectValid(root)
    expect(root).toContain("system shop 'Shop'")
  })

  it('rejects move cycles and subtree collisions', async () => {
    const collisionSource = source.replace("system platform 'Platform'", "system platform 'Platform' { component web 'Existing' }")
    const likec4 = await fromSources({ 'model.c4': collisionSource })
    const service = createDocumentEditService(likec4)

    await expect(service.planMoveElement({ target: 'shop' as Fqn, parent: 'shop.web' as Fqn })).rejects
      .toMatchObject({ code: 'move-cycle' })
    await expect(service.planMoveElement({ target: 'shop.web' as Fqn, parent: 'platform' as Fqn })).rejects
      .toMatchObject({ code: 'collision' })
  })

  it('inspects the complete subtree and requires exact approval even without dependencies', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    const report = service.inspectRemoveElement({ target: 'shop' as Fqn })

    expect(report.dependencies.some(dependency => dependency.kind === 'child-element')).toBe(true)
    expect(report.dependencies.some(dependency => dependency.kind === 'incoming-relation')).toBe(true)
    expect(report.dependencies.some(dependency => dependency.kind === 'scoped-view')).toBe(true)
    expect(() => service.planRemoveElement({ target: 'shop' as Fqn })).toThrowError(DocumentEditError)
    expect(() => service.planRemoveElement({
      target: 'shop' as Fqn,
      dependencyRevision: report.revision,
      approvedDependencyIds: report.dependencies.slice(1).map(dependency => dependency.id),
    })).toThrowError(expect.objectContaining({ code: 'dependencies-not-approved' }))
  })

  it('removes the subtree and every explicitly approved removable dependency atomically', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    const report = service.inspectRemoveElement({ target: 'shop' as Fqn })
    const unsupported = report.dependencies.filter(dependency => dependency.removal === 'unsupported')
    expect(unsupported).toEqual([])

    const plan = service.planRemoveElement({
      target: 'shop' as Fqn,
      dependencyRevision: report.revision,
      approvedDependencyIds: report.dependencies.map(dependency => dependency.id),
    })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain('// shop must stay unchanged in this comment')
    expect(candidate).not.toContain("system shop 'Shop'")
    expect(candidate).not.toContain('user -> shop.web')
    expect(candidate).not.toContain('view index of shop')
    await expectValid(candidate)
  })

  it('rejects invalid identifiers, collisions and stale source application', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)
    await expect(service.planRenameElement({ target: 'shop' as Fqn, newId: 'platform' })).rejects
      .toMatchObject({ code: 'collision' })
    await expect(service.planRenameElement({ target: 'shop' as Fqn, newId: 'not valid' })).rejects
      .toMatchObject({ code: 'invalid-identifier' })

    const expected = sourceRevision(source)
    expect(() => applyDocumentTextEdits(
      `${source}// changed\n`,
      [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: '' }],
      expected,
    )).toThrowError(expect.objectContaining({ code: 'stale-document' }))
  })
})