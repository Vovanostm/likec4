import type { ElementKind } from '@likec4/core/types'
import type { KeyboardEvent } from 'react'
import { useState } from 'react'
import { availableCanvasElementKinds, canvasElementKinds } from './canvas-element-kinds'

export interface CanvasToolbarProps {
  viewType: 'element' | 'dynamic' | 'deployment' | null
  activeKind: ElementKind | null
  availableKinds: ReadonlySet<string>
  kindTitles?: ReadonlyMap<string, string>
  disabled: boolean
  relationActive: boolean
  relationDisabled: boolean
  onSelect: () => void
  onCreate: (kind: ElementKind) => void
  onConnect: () => void
}

interface CanvasTool {
  id: string
  label: string
  accessibleName: string
  shortcut: string
  icon: string
  pressed: boolean
  disabled: boolean
  onClick: () => void
}

export function CanvasToolbar({
  viewType,
  activeKind,
  availableKinds,
  kindTitles,
  disabled,
  relationActive,
  relationDisabled,
  onSelect,
  onCreate,
  onConnect,
}: CanvasToolbarProps) {
  const [focusedTool, setFocusedTool] = useState('select')
  const tools: CanvasTool[] = [{
    id: 'select',
    label: 'Выбор',
    accessibleName: 'Выбор элементов',
    shortcut: 'V',
    icon: 'M5 3v16l4-5 4 7 3-2-4-7 6-1Z',
    pressed: activeKind === null && !relationActive,
    disabled: false,
    onClick: onSelect,
  }]

  if (viewType === 'element') {
    availableCanvasElementKinds(availableKinds, kindTitles).forEach(([kind, label]) => {
      const shortcutIndex = canvasElementKinds.findIndex(([known]) => known === kind)
      tools.push({
        id: kind,
        label,
        accessibleName: `Создать: ${label}`,
        shortcut: shortcutIndex < 0 ? '' : String(shortcutIndex + 1),
        icon: 'M4 4h16v16H4ZM8 12h8m-4-4v8',
        pressed: activeKind === kind,
        disabled: disabled || !availableKinds.has(kind),
        onClick: () => onCreate(kind),
      })
    })
  }

  if (viewType !== null) {
    const accessibleName = viewType === 'dynamic'
      ? 'Добавить шаг на холсте'
      : viewType === 'deployment'
      ? 'Создать связь развёртывания'
      : 'Связать элементы'
    tools.push({
      id: 'connect',
      label: viewType === 'dynamic' ? 'Добавить шаг' : viewType === 'deployment' ? 'Связь развёртывания' : 'Связать',
      accessibleName,
      shortcut: 'L',
      icon: 'M4 12h16m-6-6 6 6-6 6',
      pressed: relationActive,
      disabled: disabled || relationDisabled,
      onClick: onConnect,
    })
  }

  const tabStop = tools.some(tool => tool.id === focusedTool && !tool.disabled) ? focusedTool : 'select'

  function navigate(event: KeyboardEvent<HTMLDivElement>) {
    if (
      !(event.target instanceof HTMLButtonElement)
      || event.target.parentElement !== event.currentTarget
      || event.target.disabled
      || event.altKey
      || event.ctrlKey
      || event.metaKey
    ) {
      return
    }

    const buttons = Array.from(
      event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button:not(:disabled)'),
    )
    const currentIndex = buttons.indexOf(event.target)
    let nextIndex: number
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        nextIndex = (currentIndex + 1) % buttons.length
        break
      case 'ArrowLeft':
      case 'ArrowUp':
        nextIndex = (currentIndex - 1 + buttons.length) % buttons.length
        break
      case 'Home':
        nextIndex = 0
        break
      case 'End':
        nextIndex = buttons.length - 1
        break
      default:
        return
    }
    event.preventDefault()
    event.stopPropagation()
    buttons[nextIndex]?.focus()
  }

  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Инструменты диаграммы" onKeyDown={navigate}>
      {tools.map(tool => (
        <button
          key={tool.id}
          type="button"
          className={tool.id === 'select' || tool.id === 'connect' ? 'canvas-tool' : 'canvas-tool canvas-kind-tool'}
          aria-label={tool.accessibleName}
          aria-pressed={tool.pressed}
          aria-keyshortcuts={tool.shortcut}
          disabled={tool.disabled}
          tabIndex={tool.id === tabStop ? 0 : -1}
          onFocus={() => setFocusedTool(tool.id)}
          onClick={tool.onClick}
        >
          <svg
            className="canvas-tool-icon"
            aria-hidden="true"
            focusable="false"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={tool.icon} />
          </svg>
          <span className="canvas-tool-label">{tool.label}</span>
        </button>
      ))}
      {viewType === 'element' && (
        <details className="canvas-add-menu">
          <summary>Добавить</summary>
          <div className="canvas-add-options" role="group" aria-label="Тип нового элемента">
            {tools.filter(tool => tool.id !== 'select' && tool.id !== 'connect').map(tool => (
              <button
                key={tool.id}
                type="button"
                disabled={tool.disabled}
                onClick={event => {
                  tool.onClick()
                  const menu = event.currentTarget.closest('details')
                  if (menu) menu.open = false
                }}>
                {tool.label}
              </button>
            ))}
          </div>
        </details>
      )}
    </div>
  )
}
