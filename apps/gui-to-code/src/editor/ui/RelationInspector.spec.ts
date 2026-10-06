import type { RelationId, ViewId } from '@likec4/core/types'
import type { DependencyList, EffectCallback, ReactNode } from 'react'
import { Children, isValidElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { InspectorSelectionGuard } from './ElementInspector'
import { RelationInspector } from './RelationInspector'

const hooks = vi.hoisted(() => ({ cursor: 0, slots: [] as unknown[], effects: [] as EffectCallback[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: (effect: EffectCallback, deps: DependencyList) => {
    const slot = hooks.cursor++
    const previous = hooks.slots[slot] as DependencyList | undefined
    if (!previous || deps.some((value, index) => !Object.is(value, previous[index]))) hooks.effects.push(effect)
    hooks.slots[slot] = deps
  },
  useRef: <T>(initial: T) => {
    const slot = hooks.cursor++
    return hooks.slots[slot] ??= { current: initial }
  },
  useState: <T>(initial: T) => {
    const slot = hooks.cursor++
    if (!(slot in hooks.slots)) hooks.slots[slot] = initial
    return [hooks.slots[slot], (value: unknown) => hooks.slots[slot] = value]
  },
}))

interface ProbeProps {
  children?: ReactNode
  value?: string
  disabled?: boolean
  type?: string
  onChange?: (event: { target: { value: string } }) => void
  onClick?: () => void
  onSubmit?: (event: { preventDefault: () => void }) => void
}

function find(root: ReactNode, predicate: (type: unknown, props: ProbeProps) => boolean): ProbeProps {
  const pending = Children.toArray(root)
  while (pending.length) {
    const node = pending.shift()
    if (!isValidElement<ProbeProps>(node)) continue
    if (predicate(node.type, node.props)) return node.props
    pending.push(...Children.toArray(node.props.children))
  }
  throw new Error('Expected inspector control')
}

function fixture(relationTitle = 'Запрос') {
  let guard: InspectorSelectionGuard | null = null
  const dirtyChanged = vi.fn<(dirty: boolean) => void>()
  const patch = vi.fn<(title: string) => Promise<boolean>>().mockResolvedValue(true)
  const remove = vi.fn<() => Promise<boolean>>().mockResolvedValue(true)
  const select = vi.fn<(id: RelationId) => void>()
  const props: Parameters<typeof RelationInspector>[0] = {
    selection: { family: 'logical-relation', id: 'relation1' as RelationId, viewId: 'index' as ViewId, revision: 1 },
    relation: { id: 'relation1', title: relationTitle, sourceId: 'web', targetId: 'api' },
    dynamicStep: null,
    deploymentRelation: null,
    alternatives: ['relation1', 'relation2'] as RelationId[],
    busy: false,
    onDirtyChange: dirtyChanged,
    onSelectionGuardChange: next => guard = next,
    onSelectAlternative: select,
    onPatch: patch,
    onRemove: remove,
    onPatchDynamicStep: patch,
    onRemoveDynamicStep: remove,
    onPatchDeploymentRelation: patch,
    onRemoveDeploymentRelation: remove,
  }
  const render = (next: Partial<typeof props> = {}) => {
    Object.assign(props, next)
    hooks.cursor = 0
    const tree = RelationInspector(props)
    for (const effect of hooks.effects.splice(0)) effect()
    return tree
  }
  const edit = (title: string) => {
    find(render(), type => type === 'input').onChange?.({ target: { value: title } })
    return render()
  }
  const navigate = (proceed: () => void, cancel?: () => void) => guard?.(null, proceed, cancel)
  return { render, edit, navigate, patch, remove, select, dirtyChanged }
}

describe('relation inspector drafts', () => {
  const confirm = vi.fn<(message: string) => boolean>()
  beforeEach(() => {
    hooks.cursor = 0
    hooks.slots = []
    hooks.effects = []
    confirm.mockReset().mockReturnValue(false)
    vi.stubGlobal('window', { confirm })
  })
  afterEach(() => vi.unstubAllGlobals())

  it('keeps a dirty title on status renders and cancelled element/view navigation', () => {
    const inspector = fixture()
    inspector.edit('Черновик названия')
    expect(find(inspector.render({ busy: true }), type => type === 'input').value).toBe('Черновик названия')
    const proceed = vi.fn<() => void>()
    const cancel = vi.fn<() => void>()
    inspector.navigate(proceed, cancel)
    expect(proceed).not.toHaveBeenCalled()
    expect(cancel).toHaveBeenCalledOnce()
    expect(inspector.dirtyChanged).toHaveBeenLastCalledWith(true)
    expect(find(inspector.render({ busy: false }), type => type === 'input').value).toBe('Черновик названия')
  })

  it('allows clean navigation and explicitly confirmed discard', () => {
    const inspector = fixture()
    inspector.render()
    const proceed = vi.fn<() => void>()
    inspector.navigate(proceed)
    expect(confirm).not.toHaveBeenCalled()
    inspector.edit('Черновик')
    confirm.mockReturnValue(true)
    inspector.navigate(proceed)
    expect(proceed).toHaveBeenCalledTimes(2)
    expect(find(inspector.render(), type => type === 'input').value).toBe('Запрос')
    expect(inspector.dirtyChanged).toHaveBeenLastCalledWith(false)
    confirm.mockClear()
    inspector.navigate(proceed)
    expect(confirm).not.toHaveBeenCalled()
  })

  it('guards switching parallel relations and deleting a dirty relation', () => {
    const inspector = fixture()
    const tree = inspector.edit('Черновик')
    const alternative = find(tree, (_, p) => {
      const children = Children.toArray(p.children)
      return children[0] === 'Связь ' && children[1] === 2
    })
    const deletion = find(tree, (_, p) => p.children === 'Удалить связь')
    alternative.onClick?.()
    deletion.onClick?.()
    expect(inspector.select).not.toHaveBeenCalled()
    expect(inspector.remove).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    alternative.onClick?.()
    expect(inspector.select).toHaveBeenCalledExactlyOnceWith('relation2')
    deletion.onClick?.()
    expect(inspector.remove).toHaveBeenCalledOnce()
  })

  it('does not reset dirty inputs for an equivalent compiled relation', () => {
    const inspector = fixture()
    inspector.edit('Черновик')
    const tree = inspector.render({ relation: { id: 'relation1', title: 'Запрос', sourceId: 'web', targetId: 'api' } })
    expect(find(tree, type => type === 'input').value).toBe('Черновик')
  })

  it('prevents empty, unchanged and busy submissions and submits the edited title', () => {
    const inspector = fixture()
    const submit = (tree: ReactNode) => find(tree, type => type === 'form').onSubmit?.({ preventDefault: () => {} })
    submit(inspector.render())
    submit(inspector.edit('  '))
    inspector.edit('Новый запрос')
    submit(inspector.render({ busy: true }))
    expect(inspector.patch).not.toHaveBeenCalled()
    submit(inspector.render({ busy: false }))
    expect(inspector.patch).toHaveBeenCalledExactlyOnceWith('Новый запрос', { title: 'Новый запрос' })
  })
  it('preserves metadata drafts across status updates and sends only the edited fields', () => {
    const inspector = fixture()
    find(inspector.render(), type => type === 'textarea').onChange?.({ target: { value: 'Описание' } })
    const tree = inspector.render({ busy: false })
    expect(find(tree, type => type === 'textarea').value).toBe('Описание')
    find(tree, type => type === 'form').onSubmit?.({ preventDefault: () => {} })
    expect(inspector.patch).toHaveBeenCalledExactlyOnceWith('Запрос', { description: 'Описание' })
  })

  it('guards unsaved metadata navigation and restores it on confirmed discard', () => {
    const inspector = fixture()
    find(inspector.render(), type => type === 'textarea').onChange?.({ target: { value: 'Черновик описания' } })
    inspector.render()
    const proceed = vi.fn<() => void>()
    inspector.navigate(proceed)
    expect(proceed).not.toHaveBeenCalled()
    confirm.mockReturnValue(true)
    inspector.navigate(proceed)
    expect(find(inspector.render(), type => type === 'textarea').value).toBe('')
  })
  it('edits metadata on an untitled relation without requiring a new title', () => {
    const inspector = fixture('')
    find(inspector.render(), type => type === 'textarea').onChange?.({ target: { value: 'Описание без названия' } })
    const tree = inspector.render()
    find(tree, type => type === 'form').onSubmit?.({ preventDefault: () => {} })
    expect(inspector.patch).toHaveBeenCalledExactlyOnceWith('', { description: 'Описание без названия' })
  })
})
