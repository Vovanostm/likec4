export const userMessages = {
  commandFailed: 'Не удалось применить команду.',
  commandInvalidDsl: 'Команда создаёт невалидный код LikeC4.',
  importFailed: 'Не удалось импортировать файл.',
  importEmpty: 'Выбранный файл пуст.',
} as const

export function userError(context: string, cause?: string): string {
  return cause ? `${context}\n${cause}` : context
}
