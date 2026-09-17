import { useEffect, useRef } from 'react'
import type { MultiRemovalInspection } from '../professional-removal'
import { inspectionHasUnsupportedDependencies } from '../professional-removal'
import { dependencyKindLabels } from './element-form'

export interface RemoveSelectionConfirmationProps {
  readonly inspection: MultiRemovalInspection
  readonly busy: boolean
  readonly onCancel: () => void
  readonly onConfirm: () => Promise<void>
}

export function RemoveSelectionConfirmation({
  inspection,
  busy,
  onCancel,
  onConfirm,
}: RemoveSelectionConfirmationProps) {
  const cancelRef = useRef<HTMLButtonElement>(null)
  const unsupported = inspectionHasUnsupportedDependencies(inspection)
  const dependencies = [...new Map(
    inspection.reports.flatMap(report => report.dependencies).map(dependency => [dependency.id, dependency]),
  ).values()]

  useEffect(() => {
    cancelRef.current?.focus()
  }, [])

  return (
    <div className="dialog-backdrop">
      <section
        className="remove-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="remove-selection-dialog-title"
        onKeyDown={event => {
          if (event.key !== 'Escape') return
          event.preventDefault()
          event.stopPropagation()
          if (!busy) onCancel()
        }}>
        <h2 id="remove-selection-dialog-title">Удалить выбранные элементы?</h2>
        <p>Операция удалит {inspection.roots.length} выбранных корневых элементов и их поддеревья одним изменением.</p>
        <ul className="dependency-list">
          {inspection.roots.map(root => <li key={root}><strong><code>{root}</code></strong></li>)}
        </ul>
        <h3>Будут также удалены зависимости:</h3>
        {dependencies.length === 0
          ? <p className="empty">Зависимостей нет.</p>
          : (
            <ul className="dependency-list">
              {dependencies.map(dependency => (
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
            Удалить выбранные
          </button>
        </div>
      </section>
    </div>
  )
}
