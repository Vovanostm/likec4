import { type Page, expect, test } from '@playwright/test'
import { openPanel } from './panels'

const fixture = `specification {
  element actor { style { shape person } }
  element system
  element component
  element database { style { shape cylinder } }
  element queue { style { shape queue } }
  element service { title 'Сервис проекта' }
  tag backend
  tag critical
  color brand #ff00aa
}
model {
  // Preserve model comment
  api = component 'API' { description 'Keep description' }
  other = system 'Other'
  api -> other 'Calls'
}
views { view index { include * } }
`

const menu = (page: Page) => page.getByRole('menu', { name: 'Действия выбранной сущности' })
const source = (page: Page) => page.getByLabel('Исходный код LikeC4')

async function settings(page: Page, section: string): Promise<void> {
  await page.locator('.react-flow__node[data-id="api"]').click({ button: 'right' })
  await menu(page).getByRole('menuitem', { name: new RegExp(`^${section} `) }).click()
}

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await openPanel(page, 'Код')
  await source(page).fill(fixture)
  await expect(page.locator('.react-flow__node[data-id="api"]')).toBeVisible()
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
})

test('context type choices follow the project, render actor/database and retain exact Undo/Redo', async ({ page }) => {
  await settings(page, 'Тип')
  await expect(menu(page).getByRole('menuitemradio', { name: 'Сервис проекта', exact: true })).toBeVisible()
  await menu(page).getByRole('menuitemradio', { name: 'Актор', exact: true }).click()
  await expect(source(page)).toHaveValue(/api = actor 'API'/)
  await settings(page, 'Форма')
  await expect(menu(page).getByRole('menuitemradio', { name: 'Актор', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
  await page.keyboard.press('Escape')

  await settings(page, 'Тип')
  await menu(page).getByRole('menuitemradio', { name: 'База данных', exact: true }).click()
  await expect(source(page)).toHaveValue(/api = database 'API'/)
  const after = await source(page).inputValue()
  expect(after).toContain('// Preserve model comment')
  expect(after).toContain('description \'Keep description\'')
  expect(after).toContain('api -> other \'Calls\'')
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source(page)).toHaveValue(/api = actor 'API'/)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source(page)).toHaveValue(fixture)
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect(source(page)).toHaveValue(after)
  await settings(page, 'Форма')
  await expect(menu(page).getByRole('menuitemradio', { name: 'База данных', exact: true })).toHaveAttribute(
    'aria-checked',
    'true',
  )
})

test('shape, custom color, tags and technology are durable and use one history entry per action', async ({ page }) => {
  await settings(page, 'Форма')
  await menu(page).getByRole('menuitemradio', { name: 'Очередь', exact: true }).click()
  await expect(source(page)).toHaveValue(/shape queue/)
  await settings(page, 'Цвет')
  await menu(page).getByRole('menuitemradio', { name: 'brand', exact: true }).click()
  await expect(source(page)).toHaveValue(/color brand/)
  await settings(page, 'Теги')
  await menu(page).getByRole('menuitemcheckbox', { name: '#backend', exact: true }).click()
  await expect(source(page)).toHaveValue(/#backend/)
  await settings(page, 'Теги')
  await expect(menu(page).getByRole('menuitemcheckbox', { name: '#backend' })).toHaveAttribute('aria-checked', 'true')
  await menu(page).getByRole('menuitemcheckbox', { name: '#critical' }).click()
  await expect(source(page)).toHaveValue(/#backend, #critical/)
  await settings(page, 'Технология')
  await menu(page).getByRole('menuitemradio', { name: 'PostgreSQL', exact: true }).click()
  await expect(source(page)).toHaveValue(/technology 'PostgreSQL'/)
  await expect(source(page)).toHaveValue(/icon tech:postgresql/)
  const after = await source(page).inputValue()
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source(page)).not.toHaveValue(/technology 'PostgreSQL'/)
  await expect(source(page)).toHaveValue(/#backend, #critical/)
  await expect(source(page)).toHaveValue(/color brand/)
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect(source(page)).toHaveValue(after)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
  await page.reload()
  await openPanel(page, 'Код')
  await expect(source(page)).toHaveValue(after)
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await settings(page, 'Теги')
  await menu(page).getByRole('menuitemcheckbox', { name: '#backend' }).click()
  await expect(source(page)).toHaveValue(/#critical/)
  await expect(source(page)).not.toHaveValue(/#backend/)
  const exportedSource = await source(page).inputValue()
  await page.getByText('Файл и действия', { exact: true }).click()
  const sourceDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать .c4', exact: true }).click()
  const sourceStream = await (await sourceDownloadEvent).createReadStream()
  if (!sourceStream) throw new Error('Expected source download')
  const chunks: Buffer[] = []
  for await (const chunk of sourceStream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf8')).toBe(exportedSource)
  const zipDownloadEvent = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Экспортировать ZIP', exact: true }).click()
  const zipPath = await (await zipDownloadEvent).path()
  if (!zipPath) throw new Error('Expected ZIP download')
  await page.getByText('Файл и действия', { exact: true }).click()
  await settings(page, 'Цвет')
  await menu(page).getByRole('menuitemradio', { name: 'Синий', exact: true }).click()
  await expect(source(page)).toHaveValue(/color blue/)
  page.on('dialog', dialog => dialog.accept())
  await page.getByText('Файл и действия', { exact: true }).click()
  await page.getByLabel('Импортировать архив рабочего пространства').setInputFiles(zipPath)
  await expect(source(page)).toHaveValue(exportedSource)
  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
})

test('settings respect locked layers and preserve a cancelled inspector draft', async ({ page }) => {
  await openPanel(page, 'Структура')
  await page.getByRole('button', { name: 'Заблокировать «API»', exact: true }).click()
  await page.locator('.react-flow__node[data-id="api"]').click({ button: 'right' })
  await expect(menu(page).getByRole('menuitem', { name: /^Тип / })).toBeDisabled()
  await expect(menu(page).getByRole('menuitem', { name: /^Цвет / })).toBeDisabled()
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Разблокировать «API»', exact: true }).click()
  await page.locator('.react-flow__node[data-id="api"]').click()
  await openPanel(page, 'Инспектор')
  const title = page.getByRole('textbox', { name: 'Название', exact: true })
  await title.fill('Несохранённое название')
  await settings(page, 'Цвет')
  await menu(page).getByRole('menuitemradio', { name: 'Красный', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'Сохранить изменения элемента?' })
  await expect(dialog).toBeVisible()
  await dialog.getByRole('button', { name: 'Остаться', exact: true }).click()
  await expect(title).toHaveValue('Несохранённое название')
  await expect(source(page)).toHaveValue(fixture)
  await expect(menu(page)).toBeHidden()
})

test('keyboard settings and back navigation keep the canvas fixed and Escape returns to the node', async ({ page }) => {
  const node = page.locator('.react-flow__node[data-id="api"]')
  await node.click()
  const canvas = page.getByRole('region', { name: 'Холст диаграммы' })
  const box = await canvas.boundingBox()
  await node.focus()
  await node.press('Shift+F10')
  await expect(menu(page).getByRole('menuitem', { name: 'Изменить название' })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(menu(page).getByRole('menuitem', { name: '← Назад', exact: true })).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(menu(page).getByRole('menuitemradio', { name: 'Актор', exact: true })).toBeFocused()
  expect(await canvas.boundingBox()).toEqual(box)
  await menu(page).getByRole('menuitem', { name: '← Назад', exact: true }).click()
  await expect(menu(page).getByRole('menuitem', { name: /^Цвет / })).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(menu(page)).toBeHidden()
  await expect(node).toBeFocused()
  await expect(source(page)).toHaveValue(fixture)
})
