import type { Fqn } from '@likec4/core/types'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compile } from '../compiler'
import { starterSource } from '../document'
import type { CommandResult, RemovalDependencyReport } from './contracts'
import { useSemanticEditor } from './use-semantic-editor'
import type { useWorkspaceRuntime } from './use-workspace-runtime'
import { EditorWorkspace } from './workspace'

const hooks = vi.hoisted(() => ({
  index: 0,
  error: vi.fn<(value: unknown) => void>(),
  report: vi.fn<(value: unknown) => void>(),
  removal: null as RemovalDependencyReport | null,
}))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useEffect: () => undefined,
  useCallback: <T>(callback: T) => callback,
  useRef: <T>(current: T) => ({ current }),
  useState: <T>(initial: T) => {
    const index = hooks.index++
    return [
      index === 0 ? { type: 'element', id: 'shop.web' } : index === 6 ? hooks.removal : initial,
      index === 5 ? hooks.error : index === 6 ? hooks.report : vi.fn<(value: unknown) => void>(),
    ]
  },
}))
vi.mock('@likec4/diagram', async importOriginal => ({
  ...await importOriginal<typeof import('@likec4/diagram')>(),
  createCanvasIntentController: () => ({ cancel: vi.fn<() => void>() }),
}))

afterEach(() => {
  hooks.removal = null
  vi.unstubAllGlobals()
})

describe('removal inspection feedback without an open inspector', () => {
  it.each(['conflict', 'rejected', 'throw'] as const)(
    'surfaces %s and clears busy without a false dialog',
    async outcome => {
      hooks.index = 0
      hooks.error.mockClear()
      hooks.report.mockClear()
      vi.stubGlobal('HTMLElement', class {})
      vi.stubGlobal('document', { activeElement: null })
      const workspace = await EditorWorkspace.create([{ uri: 'model.c4', content: starterSource }], compile)
      const before = workspace.state
      vi.spyOn(workspace, 'inspectElementRemoval').mockImplementation(async () => {
        if (outcome === 'throw') throw new Error('unavailable')
        return outcome === 'conflict' ?
          { status: 'conflict', revision: 0 }
          : {
            status: 'rejected',
            revision: 0,
            issues: [{ code: 'remove-source-edit-failed', message: 'Проверка недоступна.' }],
          }
      })
      const runtime: Pick<
        ReturnType<typeof useWorkspaceRuntime>,
        'workspace' | 'state' | 'refresh' | 'setBusy' | 'setCommandError' | 'assertMutationAvailable' | 'selectedViewId'
      > = {
        workspace: { current: workspace },
        state: workspace.state,
        refresh: () => workspace.state,
        setBusy: vi.fn<(value: boolean) => void>(),
        setCommandError: vi.fn<ReturnType<typeof useWorkspaceRuntime>['setCommandError']>(),
        assertMutationAvailable: () => true,
        selectedViewId: null,
      }
      // This probe calls only inspection; unrelated runtime members are never used.
      const semantic = useSemanticEditor(runtime as ReturnType<typeof useWorkspaceRuntime>)
      await semantic.inspectRemoval()
      expect(runtime.setBusy).toHaveBeenLastCalledWith(false)
      expect(runtime.setCommandError).toHaveBeenLastCalledWith(expect.any(String))
      expect(hooks.error).toHaveBeenLastCalledWith(expect.any(String))
      expect(hooks.report).toHaveBeenCalledExactlyOnceWith(null)
      expect(workspace.state).toBe(before)
      expect(semantic.selection?.id).toBe('shop.web' as Fqn)
    },
  )
})

describe('removal confirmation outcome for the modal', () => {
  it.each(['applied', 'rejected', 'conflict', 'null'] as const)(
    'reports %s without closing a failed confirmation',
    async outcome => {
      hooks.index = 0
      hooks.error.mockClear()
      hooks.report.mockClear()
      const id = 'shop.web' as Fqn
      hooks.removal = { target: id, revision: 'current-source-revision', dependencies: [] }
      const result: CommandResult | null = outcome === 'applied'
        ? { status: 'applied', command: 'element.remove', revision: 1, removedElementId: id }
        : outcome === 'rejected'
        ? {
          status: 'rejected',
          revision: 0,
          issues: [{ code: 'remove-source-edit-failed', message: 'Повторите проверку.' }],
        }
        : outcome === 'conflict'
        ? { status: 'conflict', revision: 0 }
        : null
      const dispatchSemantic = vi.fn<ReturnType<typeof useWorkspaceRuntime>['dispatchSemantic']>()
        .mockResolvedValue(result)
      const setFeedback = vi.fn<ReturnType<typeof useWorkspaceRuntime>['setFeedback']>()
      vi.stubGlobal('document', { querySelector: () => null })
      const runtime: Pick<ReturnType<typeof useWorkspaceRuntime>, 'dispatchSemantic' | 'setFeedback'> = {
        dispatchSemantic,
        setFeedback,
      }
      // Confirmation uses only these runtime members; the modal owns pending state and native focus.
      const semantic = useSemanticEditor(runtime as ReturnType<typeof useWorkspaceRuntime>)
      expect(await semantic.confirmRemoval()).toBe(outcome === 'applied')
      expect(dispatchSemantic).toHaveBeenCalledExactlyOnceWith({
        type: 'element.remove',
        input: { id, dependencyRevision: 'current-source-revision', approvedDependencyIds: [] },
      }, 'Не удалось удалить элемент.')
      expect(hooks.report.mock.calls).toEqual(outcome === 'applied' ? [[null]] : [])
      expect(setFeedback.mock.calls).toEqual(
        outcome === 'applied' ? [['Элемент и подтверждённые зависимости удалены.']] : [],
      )
      expect(hooks.error).toHaveBeenLastCalledWith(
        outcome === 'conflict'
          ? 'Проект изменился. Повторите действие на актуальной версии.'
          : outcome === 'rejected'
          ? 'Повторите проверку.'
          : null,
      )
    },
  )
})
