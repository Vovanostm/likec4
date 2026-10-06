import type { EditorWorkspaceState } from './contracts'

/** One explanation for semantic and layout controls; viewing and recovery stay available. */
export function mutationDisabledReason(
  state: Pick<EditorWorkspaceState, 'compilation'> | null,
  readOnly: boolean,
  busy: boolean,
): string | null {
  if (!state) return 'Редактор ещё загружается.'
  if (readOnly) return 'Редактирование заблокировано. Экспортируйте локальную версию или загрузите актуальную.'
  if (busy) return 'Дождитесь завершения текущего действия.'
  if (state.compilation.status !== 'valid') return 'Исправьте ошибки в коде и дождитесь проверки.'
  return null
}
