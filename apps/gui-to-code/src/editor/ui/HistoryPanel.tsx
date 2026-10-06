import type { EditorHistory } from '../contracts'
import { historySteps } from '../history'

export interface HistoryPanelProps {
  readonly history: EditorHistory
  readonly disabledReason: string | null
  readonly onSelect: (index: number) => void
}

/** A derived command timeline; the workspace alone restores or branches its state. */
export function HistoryPanel({ history, disabledReason, onSelect }: HistoryPanelProps) {
  const steps = historySteps(history)
  return (
    <div className="history-content">
      <p className="history-hint">Выберите действие, чтобы вернуться к этому состоянию диаграммы.</p>
      {disabledReason && <p role="status">{disabledReason}</p>}
      <ol className="history-list" aria-label="Состояния диаграммы">
        {steps.map(step => (
          <li key={step.index} data-undone={step.undone}>
            <button
              type="button"
              aria-current={step.current ? 'step' : undefined}
              disabled={!!disabledReason}
              onClick={() => onSelect(step.index)}>
              <span className="history-number">{step.index}</span>
              <span className="history-label">{step.action.label}</span>
              <span className="history-state">
                {step.current ? 'Сейчас' : step.undone ? 'Отменено' : ''}
              </span>
            </button>
          </li>
        ))}
      </ol>
      <p className="history-hint">
        Новое изменение после возврата заменит отменённые шаги. История хранится до перезагрузки или замены проекта.
      </p>
    </div>
  )
}
