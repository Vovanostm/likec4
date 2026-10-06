import { expect, test } from '@playwright/test'

const emptySource = `// Imported comment remains intact
specification { element database { title 'База данных' } element service }
model {}
views {}
`

test('empty custom project creates its first element and view atomically, then offers inline naming', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
  await page.getByText('Файл и действия', { exact: true }).click()
  await page.getByLabel('Открыть файл .c4').setInputFiles({
    name: 'empty.c4',
    mimeType: 'text/plain',
    buffer: Buffer.from(emptySource),
  })
  const start = page.getByRole('region', { name: 'Начало работы' })
  await expect(start).toBeVisible()
  const view = page.getByLabel('Текущий вид')
  const originalView = await view.inputValue()
  await expect(start.getByRole('button', { name: 'Добавить первый элемент: Актор' })).toHaveCount(0)
  await start.getByRole('button', { name: 'Добавить первый элемент: База данных' }).click()
  const inlineTitle = page.getByRole('textbox', { name: 'Название элемента на холсте' })
  await expect(inlineTitle).toBeFocused()
  await expect(inlineTitle).toHaveValue('Новый элемент')
  const generatedId = await view.inputValue()
  expect(generatedId).toMatch(/^[A-Za-z_][\w]*$/)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  const rootId = await page.locator('.react-flow__node').getAttribute('data-id')
  if (!rootId) throw new Error('First visible root must have a model identity')
  await expect(page.getByRole('form', { name: 'Создание статического вида' })).toHaveCount(0)
  // Cancel only naming: initial element + view must remain one history entry.
  await inlineTitle.press('Escape')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByLabel('Исходный код LikeC4')
  const created = await source.inputValue()
  expect(created).toContain('Imported comment remains intact')
  expect(created).toContain(`view ${generatedId} {`)
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(source).toHaveValue(emptySource)
  await expect(start).toBeVisible()
  await expect(view).toHaveValue(originalView)
  await expect(page.locator('.react-flow__node')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Отменить последнее изменение' })).toBeDisabled()
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect(source).toHaveValue(created)
  await expect(view).toHaveValue(generatedId)
  await expect(page.locator('.react-flow__node')).toHaveCount(1)
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await page.locator('.react-flow__node').first().dblclick()
  await expect(inlineTitle).toBeFocused()
  await inlineTitle.fill('Данные')
  await inlineTitle.press('Enter')
  await expect(page.locator('.react-flow__node').filter({ hasText: 'Данные' })).toBeVisible()
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await expect(page.getByLabel('Исходный код LikeC4')).toHaveValue(/Imported comment remains intact/)
})

test('an empty specification offers import and source instead of invented kinds', async ({ page }) => {
  await page.goto('/')
  await page.getByText('Файл и действия', { exact: true }).click()
  await page.getByLabel('Открыть файл .c4').setInputFiles({
    name: 'empty.c4',
    mimeType: 'text/plain',
    buffer: Buffer.from('model {} views {}'),
  })
  const start = page.getByRole('region', { name: 'Начало работы' })
  await expect(start.getByText(/В спецификации нет типов элементов/)).toBeVisible()
  await start.getByRole('button', { name: 'Открыть код' }).click()
  await expect(page.getByLabel('Исходный код LikeC4')).toBeVisible()
})
