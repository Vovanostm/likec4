import { useEffect, useRef } from 'react'
import type { RemovalDependencyReport } from '../contracts'
import { dependencyKindLabels } from './element-form'

export interface RemoveElementConfirmationProps {
  readonly report: RemovalDependencyReport
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => Promise<void>
}

export function RemoveElementConfirmation({
  report,
  busy,
  onCancel,
  onConfirm,
}: RemoveElementConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const unsupported = report.dependencies.some(dependency => dependency.removal === 'unsupported')

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div className="dialog-backdrop">
      <section
        className="remove-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-dialog-title"
        onKeyDown={event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (!busy) onCancel()
        }}>
        <h2 id="remove-dialog-title">Удалить элемент?</h2>
        <p>Элемент <code>{report.target}</code> и его поддерево будут удалены.</p>
        <h3>Будут также удалены зависимости:</h3>
        {report.dependencies.length === 0
          ? <p className="empty">Зависимостей нет.</p>
          : (
            <ul className="dependency-list">
              {report.dependencies.map(dependency => (
                <li key={dependency.id}>
                  <strong>{dependencyKindLabels[dependency.kind]}</strong>
                  <span>{dependency.uri}:{dependency.range.start.line + 1}</span>
                  {dependency.removal === 'unsupported' && <span> — нельзя удалить безопасно</span>}
                </li>
              ))}
            </ul>
          )}
        {unsupported && <p className="error" role="alert">Некоторые зависимости нельзя удалить безопасно</p>}
        <div className="dialog-actions">
          <button ref={cancelRef} type="button" disabled={busy} onClick={onCancel}>Отмена</button>
          <button
            type="button"
            className="danger-button"
            disabled={busy || unsupported}
            onClick={() => void onConfirm()}>
            Удалить
          </button>
        </div>
      </section>
    </div>
  )
}
