import type { ElementKind, Fqn } from '@likec4/core/types'
import { flattenMarkdownOrString } from '@likec4/core/types'
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
  it.each(['tech:react', 'https://example.com/react.svg'])(
    'replaces an icon with %s and preserves unrelated properties and comments',
    async icon => {
      const current = source.replace(
        'technology \'TypeScript\'',
        'technology \'TypeScript\'\n      icon: /* keep icon note */ tech:docker; // keep logo note',
      )
      const likec4 = await fromSources({ 'model.c4': current })
      const plan = await createDocumentEditService(likec4).planPatchElement({
        target: 'shop.web' as Fqn,
        patch: { icon },
      })
      const candidate = applySingleDocumentPlan(current, plan)
      expect(candidate).toBe(current.replace('tech:docker', `${icon}${icon.startsWith('https:') ? ' ' : ''}`))
      const parsed = await expectValid(candidate)
      expect((await parsed.parsedModel()).element('shop.web').icon).toBe(icon)
    },
  )

  it('replaces a URI icon with a library icon without quoting either syntax', async () => {
    const current = source.replace('technology \'TypeScript\'', 'icon https://example.com/logo.svg // keep logo note')
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.web' as Fqn,
      patch: { icon: 'tech:react' },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toBe(current.replace('https://example.com/logo.svg', 'tech:react'))
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.web').icon).toBe('tech:react')
  })

  it('adds an icon to a declaration without a body while preserving its header', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.api' as Fqn,
      patch: { icon: 'tech:docker' },
    })
    const candidate = applySingleDocumentPlan(source, plan)
    expect(candidate).toBe(
      source.replace('component api \'API\'', 'component api \'API\' {\n      icon tech:docker\n    }'),
    )
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.api').icon).toBe('tech:docker')
  })

  it.each(['tech:react', 'https://example.com/react.svg'])(
    'adds %s to a compact body without merging it with the following property',
    async icon => {
      const current = source.replace('component api \'API\'', 'component api \'API\' {technology \'Rust\'}')
      const likec4 = await fromSources({ 'model.c4': current })
      const plan = await createDocumentEditService(likec4).planPatchElement({
        target: 'shop.api' as Fqn,
        patch: { icon },
      })
      const candidate = applySingleDocumentPlan(current, plan)
      expect(candidate).toContain('technology \'Rust\'')
      const parsed = await expectValid(candidate)
      expect((await parsed.parsedModel()).element('shop.api').icon).toBe(icon)
      expect((await parsed.parsedModel()).element('shop.api').technology).toBe('Rust')
    },
  )

  it('separates a replacement URI from a compact closing brace', async () => {
    const current = source.replace('component api \'API\'', 'component api \'API\' {icon tech:docker}')
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.api' as Fqn,
      patch: { icon: 'https://example.com/logo.svg' },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toBe(current.replace('tech:docker', 'https://example.com/logo.svg '))
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.api').icon).toBe('https://example.com/logo.svg')
  })

  it('clears direct and element-owned style icons without revealing an older logo', async () => {
    const current = source.replace(
      'technology \'TypeScript\'',
      'technology \'TypeScript\'\n      icon tech:react\n      style { icon tech:docker color blue }',
    )
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.web' as Fqn,
      patch: { icon: null },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toContain('style {  color blue }')
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.web').icon).toBeNull()
  })

  it.each(['inherited', 'direct', 'style'] as const)(
    'clears a %s logo over a kind default with an explicit none override',
    async ownership => {
      const withKind = source.replace('element component', 'element component { style { icon tech:docker } }')
      const current = ownership === 'inherited' ? withKind : withKind.replace(
        'technology \'TypeScript\'',
        `technology 'TypeScript'\n      ${ownership === 'style' ? 'style { icon tech:react }' : 'icon tech:react'}`,
      )
      const likec4 = await fromSources({ 'model.c4': current })
      const plan = await createDocumentEditService(likec4).planPatchElement({
        target: 'shop.web' as Fqn,
        patch: { icon: null },
      })
      const candidate = applySingleDocumentPlan(current, plan)
      expect(candidate).toContain('icon none')
      expect(candidate).toContain('element component { style { icon tech:docker } }')
      expect(candidate).toContain('technology \'TypeScript\'')
      expect(candidate).toContain('// nested comment must move with the subtree')
      const parsed = await expectValid(candidate)
      expect((await parsed.parsedModel()).element('shop.web').icon).toBe('none')
      expect((await parsed.parsedModel()).element('shop.api').icon).toBe('tech:docker')
      expect((await parsed.computedModel()).$data.views['index']?.nodes.find(node => node.id === 'shop.web')?.icon)
        .toBeUndefined()
    },
  )

  it('clears a kind default while sparsely setting custom technology on a bodyless element', async () => {
    const current = source.replace('element component', 'element component { style { icon tech:docker } }')
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.api' as Fqn,
      patch: { icon: null, technology: 'Custom runtime' },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toBe(current.replace(
      'component api \'API\'',
      'component api \'API\' {\n      technology \'Custom runtime\'\n      icon none\n    }',
    ))
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.api').icon).toBe('none')
    expect((await parsed.parsedModel()).element('shop.api').technology).toBe('Custom runtime')
  })

  it('clears an icon without removing its trailing comment or neighboring properties', async () => {
    const current = source.replace(
      'technology \'TypeScript\'',
      'technology \'TypeScript\'\n      icon tech:docker // keep logo note',
    )
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.web' as Fqn,
      patch: { icon: null },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toBe(current.replace('      icon tech:docker', ''))
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.web').icon).toBeNull()
    expect((await parsed.parsedModel()).$data.elements['shop.web']?.technology).toBe('TypeScript')
  })

  it.each(['tech:react', null])('patches an element-owned style icon to %s without changing its style', async icon => {
    const current = source.replace(
      'technology \'TypeScript\'',
      'technology \'TypeScript\'\n      style {\n        color blue\n        icon tech:docker // keep style note\n      }',
    )
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.web' as Fqn,
      patch: { icon },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toBe(current.replace(icon === null ? '        icon tech:docker' : 'tech:docker', icon ?? ''))
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.web').icon).toBe(icon)
  })

  it('preserves omitted icons including child icons in a sparse parent patch', async () => {
    const current = source.replace(
      'component api \'API\'',
      'component api \'API\' { icon tech:docker }',
    )
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop' as Fqn,
      patch: { icon: 'tech:react' },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toContain('component api \'API\' { icon tech:docker }')
    const parsed = await expectValid(candidate)
    expect((await parsed.parsedModel()).element('shop.api').icon).toBe('tech:docker')
    const titlePlan = await createDocumentEditService(await fromSources({ 'model.c4': candidate })).planPatchElement({
      target: 'shop' as Fqn,
      patch: { title: 'Store' },
    })
    expect(applySingleDocumentPlan(candidate, titlePlan)).toBe(
      candidate.replace('system shop \'Shop\'', 'system shop \'Store\''),
    )
  })

  it.each(['tech:does-not-exist', '\'tech:react\'', 'file:///logo.svg', '', 'tech:react\n  title \'Injected\''])(
    'rejects invalid icon %s before producing a plan',
    async icon => {
      const likec4 = await fromSources({ 'model.c4': source })
      await expect(
        createDocumentEditService(likec4).planPatchElement({
          target: 'shop.web' as Fqn,
          patch: { icon },
        }),
      ).rejects.toMatchObject({ code: 'invalid-operation' })
    },
  )

  it.each(['description', 'technology'] as const)(
    'clears positional %s without shifting or rewriting neighbors',
    async key => {
      const current = source.replace(
        'component api \'API\'',
        'component api \'API\' /* header note */ \'Summary\' \'Rust\'',
      )
      const likec4 = await fromSources({ 'model.c4': current })
      const plan = await createDocumentEditService(likec4).planPatchElement({
        target: 'shop.api' as Fqn,
        patch: { [key]: null },
      })
      const candidate = applySingleDocumentPlan(current, plan)
      expect(candidate).toContain('/* header note */')
      const parsed = await expectValid(candidate)
      const element = (await parsed.parsedModel()).$data.elements['shop.api']
      if (key === 'description') {
        expect(flattenMarkdownOrString(element?.description)).toBeNull()
        expect(element?.technology).toBe('Rust')
      } else {
        expect(element?.technology ?? null).toBeNull()
      }
      expect(flattenMarkdownOrString(element?.summary)).toBe('Summary')
    },
  )

  it('preserves omitted Markdown properties and comments in a title-only patch', async () => {
    const current = source.replace('description \'Frontend\'', 'description \'\'\'**Frontend**\'\'\' // keep markdown')
    const likec4 = await fromSources({ 'model.c4': current })
    const plan = await createDocumentEditService(likec4).planPatchElement({
      target: 'shop.web' as Fqn,
      patch: { title: 'Storefront' },
    })
    const candidate = applySingleDocumentPlan(current, plan)
    expect(candidate).toContain('description \'\'\'**Frontend**\'\'\' // keep markdown')
    expect(candidate).toContain('technology \'TypeScript\'')
    expect(candidate).toContain('#ui')
    expect(candidate).toContain('// nested comment must move with the subtree')
    const parsed = await expectValid(candidate)
    expect(candidate).toBe(current.replace('component web \'Web application\'', 'component web \'Storefront\''))
    expect((await parsed.parsedModel()).$data.elements['shop.web']?.description).toEqual({ md: '**Frontend**' })
    expect((await parsed.parsedModel()).$data.elements['shop.web']?.title).toBe('Storefront')
  })

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
    expect(withElement).toContain('system billing \'Billing\'')

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

  it('resolves a source-relative document URI inside the virtual workspace', async () => {
    const likec4 = await fromSources({ 'model.c4': source })
    const service = createDocumentEditService(likec4)

    const plan = await service.planAddRelation({
      source: 'shop.web' as Fqn,
      target: 'user' as Fqn,
      documentUri: 'model.c4',
    })
    const candidate = applySingleDocumentPlan(source, plan)

    expect(candidate).toContain('shop.web -> user')
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

    expect(candidate).toContain('component web \'Storefront\'')
    expect(candidate).not.toContain('description \'Frontend\'')
    expect(candidate).toContain('technology \'React\'')
    expect(candidate).toContain('#backend, #ui')
    expect(candidate).toContain('component api \'API\'')
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

    expect(candidate).toContain('system store \'Shop\'')
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

    expect(candidate).toContain('system platform \'Platform\' {')
    expect(candidate).toContain('component web \'Web application\'')
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
    expect(root).toContain('system shop \'Shop\'')
  })

  it('rejects move cycles and subtree collisions', async () => {
    const collisionSource = source.replace(
      'system platform \'Platform\'',
      'system platform \'Platform\' { component web \'Existing\' }',
    )
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
    expect(() =>
      service.planRemoveElement({
        target: 'shop' as Fqn,
        dependencyRevision: report.revision,
        approvedDependencyIds: report.dependencies.slice(1).map(dependency => dependency.id),
      })
    ).toThrowError(expect.objectContaining({ code: 'dependencies-not-approved' }))
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
    expect(candidate).not.toContain('system shop \'Shop\'')
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
    expect(() =>
      applyDocumentTextEdits(
        `${source}// changed\n`,
        [{ range: { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } }, newText: '' }],
        expected,
      )
    ).toThrowError(expect.objectContaining({ code: 'stale-document' }))
  })
})
