import { expect, test } from '@playwright/test'
import { openPanel } from './panels'

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.clear())
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
})

test('creates and selects a scoped static view without changing history on selection', async ({ page }) => {
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByLabel('Исходный код LikeC4')
  const viewSelector = page.getByLabel('Текущий вид')
  const revision = page.getByText(/Ревизия проекта:/)

  await expect(viewSelector).toHaveValue('index')
  await openPanel(page, 'Структура')
  await page.getByRole('button', { name: /Online shop.*shop/ }).click()
  await page.getByRole('button', { name: 'Создать вид' }).click()
  await page.getByRole('form', { name: 'Создание статического вида' }).getByText('Подробности', { exact: true }).click()
  await page.getByLabel('ID нового вида').fill('shop_overview')
  await page.getByLabel('Название нового вида').fill('Обзор магазина')
  await page.getByRole('button', { name: 'Создать', exact: true }).click()

  await expect(viewSelector).toHaveValue('shop_overview')
  await expect(viewSelector).toBeFocused()
  await expect(source).toHaveValue(/view shop_overview of shop \{\s+title 'Обзор магазина'\s+include \*/)
  await expect(revision).toHaveText('Ревизия проекта: 1')

  const createdSource = await source.inputValue()
  await viewSelector.selectOption('index')
  await expect(revision).toHaveText('Ревизия проекта: 1')
  await expect(source).toHaveValue(createdSource)

  await viewSelector.selectOption('shop_overview')
  await expect(revision).toHaveText('Ревизия проекта: 1')
  await expect(source).toHaveValue(createdSource)

  await page.getByRole('button', { name: 'Отменить' }).click()
  await expect(viewSelector).toHaveValue('index')
  await expect(viewSelector.locator('option[value="shop_overview"]')).toHaveCount(0)

  await page.getByRole('button', { name: 'Повторить' }).click()
  await expect(viewSelector.locator('option[value="shop_overview"]')).toHaveCount(1)
})

test('creates a titled view with an automatic ID while expert details stay collapsed', async ({ page }) => {
  await openPanel(page, 'Структура')
  await page.getByRole('button', { name: /Online shop.*shop/ }).click()
  const view = page.getByLabel('Текущий вид')
  const beforeOptions = await view.locator('option').count()
  await page.getByRole('button', { name: 'Создать вид', exact: true }).click()
  const title = page.getByLabel('Название нового вида')
  const id = page.getByLabel('ID нового вида')
  await expect(title).toBeFocused()
  await expect(id).toBeHidden()
  await expect(id).toHaveValue('')
  await expect(id).not.toHaveAttribute('required', '')
  await title.fill('Автоматический обзор')
  await title.press('Enter')
  await expect(title).toBeHidden()
  await expect(view.locator('option')).toHaveCount(beforeOptions + 1)
  const createdId = await view.inputValue()
  expect(createdId).not.toBe('index')
  expect(createdId).toMatch(/^[A-Za-z_][\w]*$/)
  await expect(view.locator('option:checked')).toContainText('Автоматический обзор')
  await openPanel(page, 'Код')
  const source = page.getByLabel('Исходный код LikeC4')
  const created = await source.inputValue()
  expect(created).toContain(`view ${createdId} of shop`)
  expect(created).toContain('title \'Автоматический обзор\'')
  await page.getByRole('button', { name: 'Отменить последнее изменение' }).click()
  await expect(view.locator('option')).toHaveCount(beforeOptions)
  await page.getByRole('button', { name: 'Повторить отменённое изменение' }).click()
  await expect(source).toHaveValue(created)
})

test('restores a standard manual-layout snapshot after reload and file round trip', async ({ page }, testInfo) => {
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByLabel('Исходный код LikeC4')
  const sourceBeforeLayout = await source.inputValue()
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const node = page.locator('.react-flow__node[data-id="customer"]')
  await expect(node).toBeVisible()
  await node.scrollIntoViewIfNeeded()

  const before = await node.boundingBox()
  if (!before) throw new Error('Expected a visible diagram node')
  await page.mouse.move(before.x + before.width / 2, before.y + before.height / 2)
  await page.mouse.down()
  await page.mouse.move(before.x + before.width / 2 + 80, before.y + before.height / 2 + 40, { steps: 8 })
  await page.mouse.up()

  await expect.poll(async () => {
    const current = await node.boundingBox()
    return current ? Math.abs(current.x - before.x) + Math.abs(current.y - before.y) : 0
  }).toBeGreaterThan(20)
  await expect(page.getByText('Ручная раскладка сохранена.', { exact: true })).toBeVisible()
  await expect(source).toHaveValue(sourceBeforeLayout)
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')

  await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')

  await page.reload()
  await expect(page.getByLabel('Текущий вид')).toHaveValue('index')
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const reloadedSource = page.getByLabel('Исходный код LikeC4')
  await expect(reloadedSource).toHaveValue(sourceBeforeLayout)

  const exportButton = page.getByRole('button', { name: 'Экспортировать раскладку' })
  await page.getByText('Дополнительно', { exact: true }).click()
  await expect(exportButton).toBeEnabled()
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    exportButton.click(),
  ])
  expect(download.suggestedFilename()).toBe('index.likec4.snap')
  const snapshotPath = testInfo.outputPath('index.likec4.snap')
  await download.saveAs(snapshotPath)

  await page.getByRole('button', { name: 'Сбросить раскладку' }).click()
  await expect(page.getByText('Ручная раскладка сброшена.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('auto')
  await expect(reloadedSource).toHaveValue(sourceBeforeLayout)

  await page.getByLabel('Импортировать раскладку').setInputFiles(snapshotPath)
  await expect(page.getByText('Ручная раскладка импортирована.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')
  await expect(reloadedSource).toHaveValue(sourceBeforeLayout)
})
