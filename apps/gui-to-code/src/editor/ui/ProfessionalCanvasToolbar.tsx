import type { ElementKind } from '@likec4/core/types'
import type { MultiNodeLayoutAction } from '../professional-layout'

const knownKindLabels: Readonly<Record<string, string>> = {
  actor: 'Актор',
  system: 'Система',
  container: 'Контейнер',
  component: 'Компонент',
}

export interface ProfessionalCanvasToolbarProps {
  readonly availableKinds: ReadonlySet<ElementKind>
  readonly activeKind: ElementKind | null
  readonly busy: boolean
  readonly gridVisible: boolean
  readonly snapEnabled: boolean
  readonly gridStep: number
  readonly onCreate: (kind: ElementKind) => void
  readonly onLayout: (action: MultiNodeLayoutAction) => void
  readonly onSelectAll: () => void
  readonly onFitSelection: () => void
  readonly onFitView: () => void
  readonly onGridVisibleChange: (visible: boolean) => void
  readonly onSnapEnabledChange: (enabled: boolean) => void
  readonly onGridStepChange: (step: number) => void
}

export function ProfessionalCanvasToolbar({
  availableKinds,
  activeKind,
  busy,
  gridVisible,
  snapEnabled,
  gridStep,
  onCreate,
  onLayout,
  onSelectAll,
  onFitSelection,
  onFitView,
  onGridVisibleChange,
  onSnapEnabledChange,
  onGridStepChange,
}: ProfessionalCanvasToolbarProps) {
  const kinds = [...availableKinds].sort((a, b) => String(a).localeCompare(String(b)))

  return (
    <div className="professional-canvas-toolbar" aria-label="Профессиональные инструменты диаграммы">
      <details>
        <summary>+ Добавить</summary>
        <div className="toolbar-popover" role="group" aria-label="Создать элемент">
          {kinds.map(kind => (
            <button
              key={kind}
              type="button"
              aria-pressed={activeKind === kind}
              disabled={busy}
              onClick={() => onCreate(kind)}>
              {knownKindLabels[kind] ?? kind}
            </button>
          ))}
        </div>
      </details>

      <details>
        <summary>Раскладка</summary>
        <div className="toolbar-popover layout-command-grid" role="group" aria-label="Выравнивание и распределение">
          <button type="button" disabled={busy} onClick={() => onLayout('align-left')}>По левому краю</button>
          <button type="button" disabled={busy} onClick={() => onLayout('align-center-horizontal')}>По центру X</button>
          <button type="button" disabled={busy} onClick={() => onLayout('align-right')}>По правому краю</button>
          <button type="button" disabled={busy} onClick={() => onLayout('align-top')}>По верхнему краю</button>
          <button type="button" disabled={busy} onClick={() => onLayout('align-center-vertical')}>По центру Y</button>
          <button type="button" disabled={busy} onClick={() => onLayout('align-bottom')}>По нижнему краю</button>
          <button type="button" disabled={busy} onClick={() => onLayout('distribute-horizontal')}>Распределить по X</button>
          <button type="button" disabled={busy} onClick={() => onLayout('distribute-vertical')}>Распределить по Y</button>
        </div>
      </details>

      <button type="button" disabled={busy} onClick={onSelectAll}>Выделить всё</button>
      <button type="button" onClick={onFitSelection}>Показать выделение</button>
      <button type="button" onClick={onFitView}>Показать весь вид</button>

      <label className="compact-toggle">
        <input type="checkbox" checked={gridVisible} onChange={event => onGridVisibleChange(event.target.checked)} />
        Сетка
      </label>
      <label className="compact-toggle">
        <input type="checkbox" checked={snapEnabled} onChange={event => onSnapEnabledChange(event.target.checked)} />
        Привязка
      </label>
      <label className="grid-step-control">
        Шаг
        <input
          aria-label="Шаг сетки"
          type="number"
          min={4}
          max={128}
          step={1}
          value={gridStep}
          onChange={event => onGridStepChange(Number(event.target.value))} />
      </label>
    </div>
  )
}
