import { describe, expect, it } from 'vitest'
import type { EditorWorkspaceState } from './contracts'
import { mutationDisabledReason } from './mutation-availability'

function state(status: EditorWorkspaceState['compilation']['status']) {
  return { compilation: { status, revision: 0, model: null, diagnostics: [] } }
}

describe('shared mutation availability', () => {
  it('explains loading, invalid, compiling, busy and read-only independently', () => {
    expect(mutationDisabledReason(null, false, false)).toContain('загружается')
    expect(mutationDisabledReason(state('invalid'), false, false)).toContain('Исправьте ошибки')
    expect(mutationDisabledReason(state('compiling'), false, false)).toContain('дождитесь')
    expect(mutationDisabledReason(state('valid'), false, true)).toContain('Дождитесь')
    expect(mutationDisabledReason(state('valid'), true, false)).toContain('Экспортируйте')
    expect(mutationDisabledReason(state('valid'), false, false)).toBeNull()
  })
})
