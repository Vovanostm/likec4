import { useEffect, useId, useRef, useState } from 'react'
import { technologyByName, technologyCatalogue } from './technology-catalogue'
import { renderTechnologyIcon } from './technology-icon'

/** Searchable technology choice; only the inspector owns the semantic draft. */
export function TechnologySelect({ value, icon, disabled, label = 'Технология', onChange }: {
  readonly value: string
  readonly icon?: string | null
  readonly disabled: boolean
  readonly label?: string
  readonly onChange: (value: string) => void
}) {
  const id = useId()
  const input = useRef<HTMLInputElement>(null)
  const list = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(-1)
  const [placement, setPlacement] = useState({ above: false, height: 272 })
  const expanded = open && !disabled
  const normalized = query.trim().toLowerCase()
  const entries = technologyCatalogue.filter(entry => entry.label.toLowerCase().includes(normalized))
  const custom = query.trim() && !technologyByName(query) ? query.trim() : null
  const options = [...entries.map(entry => entry.label), ...(custom ? [custom] : [])]
  const selected = technologyByName(value)
  const showIcon = selected && (icon === undefined || selected.icon === icon)
  useEffect(() => {
    if (expanded && active >= 0) list.current?.children.item(active)?.scrollIntoView({ block: 'nearest' })
  }, [expanded, active])
  const showOptions = () => {
    const control = input.current?.closest('.technology-select')?.getBoundingClientRect()
    const panel = input.current?.closest('.panel-body')?.getBoundingClientRect()
    if (control) {
      const bottom = Math.min(panel?.bottom ?? window.innerHeight, window.innerHeight)
      const top = Math.max(panel?.top ?? 0, 0)
      const below = bottom - control.bottom - 8
      const above = control.top - top - 8
      const upwards = below < 250 && above > below
      setPlacement({ above: upwards, height: Math.max(72, Math.min(272, upwards ? above : below)) })
    }
    setQuery('')
    setActive(-1)
    setOpen(true)
  }
  const choose = (technology: string) => {
    onChange(technology)
    setOpen(false)
    setActive(-1)
  }
  return (
    <div
      className="technology-select"
      onBlur={event => {
        if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false)
      }}>
      <label htmlFor={id}>{label}</label>
      <div className="technology-select-control">
        {showIcon && (
          <span className="technology-option-icon technology-selected-icon">
            {renderTechnologyIcon({ node: { id: selected.icon, title: selected.label, icon: selected.icon } })}
          </span>
        )}
        <input
          ref={input}
          id={id}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={expanded}
          aria-controls={expanded ? `${id}-options` : undefined}
          aria-activedescendant={expanded && active >= 0 ? `${id}-option-${active}` : undefined}
          autoComplete="off"
          placeholder="Выберите или введите технологию"
          value={value}
          disabled={disabled}
          onFocus={showOptions}
          onClick={() => {
            if (!open) showOptions()
          }}
          onChange={event => {
            onChange(event.target.value)
            if (!open) showOptions()
            setQuery(event.target.value)
            setActive(-1)
          }}
          onKeyDown={event => {
            if (event.nativeEvent.isComposing) return
            switch (event.key) {
              case 'ArrowDown':
              case 'ArrowUp': {
                event.preventDefault()
                event.stopPropagation()
                if (!expanded) showOptions()
                const count = expanded ? options.length : technologyCatalogue.length
                setActive(index =>
                  event.key === 'ArrowDown'
                    ? (index + 1) % count
                    : (index < 0 ? count - 1 : (index - 1 + count) % count)
                )
                break
              }
              case 'Enter':
                if (!expanded) break
                event.preventDefault()
                event.stopPropagation()
                choose(options[active] ?? value)
                break
              case 'Escape':
                if (!expanded) break
                event.preventDefault()
                event.stopPropagation()
                setOpen(false)
                break
            }
          }} />
        {(value || icon) && (
          <button
            type="button"
            className="technology-select-action"
            aria-label="Очистить технологию"
            disabled={disabled}
            onClick={() => {
              input.current?.focus()
              choose('')
            }}>
            ×
          </button>
        )}
        <button
          type="button"
          className="technology-select-action"
          aria-label={`Показать варианты: ${label.toLowerCase()}`}
          aria-expanded={expanded}
          disabled={disabled}
          onMouseDown={event => event.preventDefault()}
          onClick={() => {
            input.current?.focus()
            if (expanded) setOpen(false)
            else showOptions()
          }}>
          <span aria-hidden="true">⌄</span>
        </button>
      </div>
      {expanded && (
        <div
          ref={list}
          className="technology-select-dropdown"
          data-above={placement.above}
          style={{ maxHeight: placement.height }}
          id={`${id}-options`}
          role="listbox"
          aria-label={label}>
          {options.map((option, index) => {
            const entry = technologyByName(option)
            return (
              <div
                key={option}
                id={`${id}-option-${index}`}
                role="option"
                aria-label={option}
                aria-selected={option === value}
                data-active={index === active}
                className="technology-select-option"
                onMouseDown={event => event.preventDefault()}
                onMouseEnter={() => setActive(index)}
                onClick={() => choose(option)}>
                {entry && (
                  <span className="technology-option-icon">
                    {renderTechnologyIcon({ node: { id: entry.icon, title: entry.label, icon: entry.icon } })}
                  </span>
                )}
                <span>{entry ? option : `Использовать «${option}»`}</span>
                {option === value && <span className="technology-select-check" aria-hidden="true">✓</span>}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
