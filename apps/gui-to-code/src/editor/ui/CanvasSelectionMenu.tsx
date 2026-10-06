import { useState } from 'react'
import type { CanvasPosition, ElementPatch } from '../contracts'
import { CanvasElementSettingsMenu, settingsSections, settingsSummary } from './CanvasElementSettingsMenu'
import type { CanvasElementSettings, SettingsSection } from './CanvasElementSettingsMenu'
import { CanvasContextMenu } from './CanvasQuickCreateMenu'
import type { CanvasMenuDismissReason } from './CanvasQuickCreateMenu'

export function CanvasSelectionMenu(
  { screenPosition, title, element, disabled, connectDisabled, settings, onPatch, onAction, onCancel, returnFocusTo }: {
    readonly screenPosition: CanvasPosition
    readonly returnFocusTo: HTMLElement | null
    readonly title: string
    readonly element: boolean
    readonly disabled: boolean
    readonly settings?: CanvasElementSettings | undefined
    readonly onPatch?: ((patch: ElementPatch) => void) | undefined
    readonly connectDisabled: boolean
    readonly onAction: (action: 'rename' | 'properties' | 'connect' | 'duplicate' | 'remove' | 'clear') => void
    readonly onCancel: (reason: CanvasMenuDismissReason) => void
  },
) {
  const [section, setSection] = useState<SettingsSection | null>(null)
  if (section && settings && onPatch) {
    return (
      <CanvasElementSettingsMenu
        screenPosition={screenPosition}
        title={title}
        section={section}
        settings={settings}
        disabled={disabled}
        onPatch={onPatch}
        onBack={() => setSection(null)}
        onProperties={() => onAction('properties')}
        onCancel={onCancel}
        returnFocusTo={returnFocusTo} />
    )
  }
  return (
    <CanvasContextMenu
      screenPosition={screenPosition}
      label="Действия выбранной сущности"
      onCancel={onCancel}
      returnFocusTo={returnFocusTo}>
      <div className="canvas-menu-target" title={title}>{title}</div>
      <div className="canvas-quick-menu-items">
        {element && (
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => onAction('rename')}>
            <span>Изменить название</span>
            <kbd>F2</kbd>
          </button>
        )}
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => onAction('properties')}>
          <span>Свойства</span>
          <kbd>Enter</kbd>
        </button>
        {element && settings && onPatch &&
          settingsSections.map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              disabled={disabled}
              onClick={() => setSection(key)}>
              <span>{label}</span>
              <span className="canvas-setting-value" title={settingsSummary(settings, key)}>
                {settingsSummary(settings, key)} ›
              </span>
            </button>
          ))}
        {element && (
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={disabled || connectDisabled}
            onClick={() => onAction('connect')}>
            <span>Связать</span>
            <kbd>L</kbd>
          </button>
        )}
        {element && (
          <button
            type="button"
            role="menuitem"
            tabIndex={-1}
            disabled={disabled}
            onClick={() => onAction('duplicate')}>
            <span>Дублировать</span>
            <kbd>Ctrl+D</kbd>
          </button>
        )}
        <hr />
        <button
          type="button"
          role="menuitem"
          tabIndex={-1}
          className="canvas-delete-action"
          disabled={disabled}
          onClick={() => onAction('remove')}>
          <span>Удалить</span>
          <kbd>Del</kbd>
        </button>
        <button type="button" role="menuitem" tabIndex={-1} onClick={() => onAction('clear')}>
          <span>Снять выделение</span>
          <kbd>Esc</kbd>
        </button>
      </div>
    </CanvasContextMenu>
  )
}
