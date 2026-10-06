import { useEffect, useRef, useState } from 'react'
import type { RemovalDependencyReport, SourceFile } from '../contracts'
import { dependencyKindLabels } from './element-form'

export interface RemoveElementConfirmationProps {
  readonly report: RemovalDependencyReport
  readonly targetTitle?: string | undefined
  readonly sources?: readonly SourceFile[] | undefined
  readonly elementTitles?: Readonly<Record<string, string>> | undefined
  readonly busy: boolean
  readonly error?: string | null
  readonly mutationDisabledReason?: string | null
  readonly onCancel: () => void
  readonly onConfirm: () => Promise<boolean>
}

/** A deleted or disabled opener cannot receive restored focus. */
export function removalReturnFocusTarget<
  T extends { readonly isConnected: boolean; matches(selector: string): boolean },
>(
  opener: T | null,
  canvas: T | null,
): T | null {
  return opener?.isConnected && !opener.matches(':disabled') ? opener : canvas
}

export function RemoveElementConfirmation({
  report,
  targetTitle,
  sources,
  elementTitles,
  busy,
  error,
  mutationDisabledReason,
  onCancel,
  onConfirm,
}: RemoveElementConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const dialogRef = useRef<HTMLDialogElement>(null)
  const confirming = useRef(false)
  const [pending, setPending] = useState(false)
  const [confirmationError, setConfirmationError] = useState<string | null>(null)
  const displayedError = error?.trim() || confirmationError
  const failureMessage = 'Не удалось удалить элемент. Закройте окно и проверьте зависимости перед повторной попыткой.'
  const blocked = busy || pending
  const unsupported = report.dependencies.some(dependency => dependency.removal === 'unsupported')

  useEffect(() => {
    const dialog = dialogRef.current
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null
    dialog?.showModal()
    cancelRef.current?.focus()
    return () => {
      dialog?.close()
      const fallback = document.querySelector<HTMLElement>('.diagram-panel')
      const target = removalReturnFocusTarget(opener, fallback)
      target?.focus()
    }
  }, [])

  useEffect(() => {
    if (blocked) dialogRef.current?.focus()
    if (
      !blocked && (
        document.activeElement === dialogRef.current
        || (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled
          && dialogRef.current?.contains(document.activeElement))
      )
    ) cancelRef.current?.focus()
  }, [blocked, mutationDisabledReason, unsupported])

  return (
    <dialog
      ref={dialogRef}
      className="remove-dialog"
      tabIndex={-1}
      aria-busy={blocked}
      data-removal-target={report.target}
      aria-labelledby="remove-dialog-title"
      onCancel={event => {
        event.preventDefault()
        if (!busy && !confirming.current) onCancel()
      }}
      onKeyDown={event => {
        if (event.key !== 'Escape') return
        event.preventDefault()
        event.stopPropagation()
        if (!busy && !confirming.current) onCancel()
      }}>
      <h2 id="remove-dialog-title">Удалить элемент?</h2>
      <p>
        Элемент «{targetTitle ?? report.target}» и его поддерево будут удалены.
      </p>
      <h3>Будут также удалены зависимости:</h3>
      {report.dependencies.length === 0
        ? <p className="empty">Зависимостей нет.</p>
        : (
          <ul className="dependency-list">
            {report.dependencies.map(dependency => {
              const source = sources?.find(file =>
                dependency.uri.endsWith(`/${file.uri}`) || dependency.uri === file.uri
              )
              const line = source?.content.split('\n')[dependency.range.start.line]?.trim()
              const label = line?.replace(/[A-Za-z_][A-Za-z0-9_.]*/g, id => elementTitles?.[id] ?? id)
                .replaceAll('->', '→')
              return (
                <li key={dependency.id}>
                  <strong>{dependencyKindLabels[dependency.kind]}</strong>
                  {label && <span>{label}</span>}
                  <details>
                    <summary>Исходный файл и строка</summary>
                    <code>{source?.uri ?? dependency.uri}:{dependency.range.start.line + 1}</code>
                  </details>
                  {dependency.removal === 'unsupported' && <span>— нельзя удалить безопасно</span>}
                </li>
              )
            })}
          </ul>
        )}
      {unsupported && <p className="error" role="alert">Некоторые зависимости нельзя удалить безопасно</p>}
      {mutationDisabledReason && <p className="error" role="alert">{mutationDisabledReason}</p>}
      {displayedError && <p className="error" role="alert">{displayedError}</p>}
      <div className="dialog-actions">
        <button
          ref={cancelRef}
          type="button"
          disabled={blocked}
          onClick={() => {
            if (!busy && !confirming.current) onCancel()
          }}>
          Отмена
        </button>
        <button
          type="button"
          className="danger-button"
          disabled={blocked || unsupported || !!mutationDisabledReason}
          onClick={async () => {
            if (busy || confirming.current || unsupported || mutationDisabledReason) return
            confirming.current = true
            setPending(true)
            setConfirmationError(null)
            try {
              if (!await onConfirm()) setConfirmationError(failureMessage)
            } catch {
              setConfirmationError(failureMessage)
            } finally {
              confirming.current = false
              setPending(false)
            }
          }}>
          Удалить
        </button>
      </div>
    </dialog>
  )
}
