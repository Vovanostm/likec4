import type { Color, ElementShape } from '@likec4/core/types'
import type { CanvasPosition, ElementPatch } from '../contracts'
import { availableCanvasElementKinds } from './canvas-element-kinds'
import { CanvasContextMenu } from './CanvasQuickCreateMenu'
import type { CanvasMenuDismissReason } from './CanvasQuickCreateMenu'
import { shapeOptions } from './element-settings'
import { technologyCatalogue } from './technology-catalogue'

export type SettingsSection = 'kind' | 'shape' | 'color' | 'tags' | 'technology'

export const settingsSections: readonly (readonly [SettingsSection, string])[] = [
  ['kind', 'Тип'],
  ['shape', 'Форма'],
  ['color', 'Цвет'],
  ['tags', 'Теги'],
  ['technology', 'Технология'],
]

export interface CanvasElementSettings {
  readonly kind: string
  readonly shape: ElementShape
  readonly color: Color
  readonly tags: readonly string[]
  readonly technology: string | null
  readonly availableKinds: ReadonlySet<string>
  readonly kindTitles: ReadonlyMap<string, string>
  readonly availableTags: readonly string[]
  readonly colors: readonly { readonly color: Color; readonly title: string; readonly swatch: string }[]
}

export function settingsSummary(settings: CanvasElementSettings, section: SettingsSection): string {
  switch (section) {
    case 'kind':
      return availableCanvasElementKinds(settings.availableKinds, settings.kindTitles)
        .find(([kind]) => kind === settings.kind)?.[1] ?? settings.kind
    case 'shape':
      return shapeOptions.find(option => option.shape === settings.shape)?.title ?? ''
    case 'color':
      return settings.colors.find(option => option.color === settings.color)?.title ?? ''
    case 'tags':
      return settings.tags.length ? settings.tags.map(tag => `#${tag}`).join(', ') : 'Нет'
    case 'technology':
      return settings.technology || 'Не задана'
  }
}

export function CanvasElementSettingsMenu(
  { screenPosition, title, section, settings, disabled, onPatch, onBack, onProperties, onCancel, returnFocusTo }: {
    readonly screenPosition: CanvasPosition
    readonly title: string
    readonly section: SettingsSection
    readonly settings: CanvasElementSettings
    readonly disabled: boolean
    readonly onPatch: (patch: ElementPatch) => void
    readonly onBack: () => void
    readonly onProperties: () => void
    readonly onCancel: (reason: CanvasMenuDismissReason) => void
    readonly returnFocusTo: HTMLElement | null
  },
) {
  const choice = (key: string, label: string, selected: boolean, patch: ElementPatch, swatch?: string) => (
    <button
      key={key}
      type="button"
      role={section === 'tags' ? 'menuitemcheckbox' : 'menuitemradio'}
      aria-checked={selected}
      tabIndex={-1}
      disabled={disabled || (section !== 'tags' && selected)}
      onClick={() => onPatch(patch)}>
      <span className="canvas-setting-choice">
        {swatch && <span className="canvas-color-swatch" style={{ background: swatch }} />}
        {label}
      </span>
      <span aria-hidden="true">{selected ? '✓' : ''}</span>
    </button>
  )
  return (
    <CanvasContextMenu
      screenPosition={screenPosition}
      label="Действия выбранной сущности"
      onCancel={onCancel}
      returnFocusTo={returnFocusTo}>
      <div className="canvas-menu-target" title={title}>{title}</div>
      <div className="canvas-quick-menu-items canvas-settings-items">
        <button type="button" role="menuitem" tabIndex={-1} onClick={onBack}>← Назад</button>
        <div className="canvas-settings-heading">{settingsSections.find(([key]) => key === section)?.[1]}</div>
        {section === 'kind' &&
          availableCanvasElementKinds(settings.availableKinds, settings.kindTitles).map(([kind, label]) =>
            choice(kind, label, settings.kind === kind, { kind })
          )}
        {section === 'shape' &&
          shapeOptions.map(({ shape, title: label }) => choice(shape, label, settings.shape === shape, { shape }))}
        {section === 'color' && settings.colors.map(({ color, title: label, swatch }) =>
          choice(color, label, settings.color === color, { color }, swatch)
        )}
        {section === 'tags' && settings.availableTags.map(tag =>
          choice(tag, `#${tag}`, settings.tags.includes(tag), {
            tags: settings.tags.includes(tag) ? settings.tags.filter(value => value !== tag) : [...settings.tags, tag],
          })
        )}
        {section === 'tags' && settings.availableTags.length === 0 && <p>В проекте ещё нет тегов.</p>}
        {section === 'tags' && (
          <button type="button" role="menuitem" tabIndex={-1} disabled={disabled} onClick={onProperties}>
            Создать тег в свойствах…
          </button>
        )}
        {section === 'technology' && technologyCatalogue.map(({ label, icon }) =>
          choice(label, label, settings.technology === label, { technology: label, icon })
        )}
        {section === 'technology' &&
          choice('none', 'Без технологии', !settings.technology, { technology: null, icon: null })}
      </div>
    </CanvasContextMenu>
  )
}
