import { ElementShapes, isCustomColor, ThemeColors } from '@likec4/core/styles'
import type { Color, ElementShape, ThemeColor } from '@likec4/core/types'

export const shapeTitles: Readonly<Record<ElementShape, string>> = {
  rectangle: 'Прямоугольник',
  person: 'Актор',
  component: 'Компонент',
  cylinder: 'База данных',
  storage: 'Хранилище',
  queue: 'Очередь',
  bucket: 'Бакет',
  browser: 'Веб-приложение',
  mobile: 'Мобильное приложение',
  document: 'Документ',
}

const colorPresentation: Readonly<Record<ThemeColor, readonly [string, string]>> = {
  primary: ['Основной', '#6366f1'],
  secondary: ['Вторичный', '#8b5cf6'],
  muted: ['Приглушённый', '#64748b'],
  amber: ['Янтарный', '#f59e0b'],
  blue: ['Синий', '#3b82f6'],
  gray: ['Серый', '#6b7280'],
  slate: ['Графитовый', '#475569'],
  green: ['Зелёный', '#22c55e'],
  indigo: ['Индиго', '#6366f1'],
  red: ['Красный', '#ef4444'],
  sky: ['Голубой', '#38bdf8'],
}

export const shapeOptions = ElementShapes.map(shape => ({ shape, title: shapeTitles[shape] }))

/** Custom colors are choices only when declared by the loaded project. */
export function elementColorOptions(
  custom: Readonly<Record<string, { readonly elements: { readonly fill: string } }>>,
) {
  const options: { readonly color: Color; readonly title: string; readonly swatch: string }[] = ThemeColors.map(
    color => ({
      color,
      title: colorPresentation[color][0],
      swatch: colorPresentation[color][1],
    }),
  )
  for (const [color, definition] of Object.entries(custom)) {
    if (isCustomColor(color)) options.push({ color, title: color, swatch: definition.elements.fill })
  }
  return options
}
