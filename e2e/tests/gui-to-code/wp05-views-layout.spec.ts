import { expect, test } from '@playwright/test'

const storageResetMarker = 'likec4.gui-to-code.e2e.storage-reset'
const workspaceDatabaseName = 'likec4-gui-to-code'

test.beforeEach(async ({ page }) => {
  await page.goto('/')
  await page.evaluate(async ({ marker, databaseName }) => {
    if (sessionStorage.getItem(marker)) return
    localStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('Failed to reset IndexedDB'))
      request.onblocked = () => reject(new Error('IndexedDB reset was blocked'))
    })
    sessionStorage.setItem(marker, 'done')
  }, { marker: storageResetMarker, databaseName: workspaceDatabaseName })
  await page.reload()
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
})

test('creates and selects a scoped static view without changing history on selection', async ({ page }) => {
  const source = page.getByLabel('Исходный код LikeC4')
  const viewSelector = page.getByLabel('Текущий вид')
  const revision = page.getByText(/Ревизия проекта:/)

  await expect(viewSelector).toHaveValue('index')
  await page.getByRole('button', { name: /Online shop.*shop/ }).click()
  await page.getByRole('button', { name: 'Создать вид' }).click()
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

test('restores a standard manual-layout snapshot after reload and file round trip', async ({ page }, testInfo) => {
  const source = page.getByLabel('Исходный код LikeC4')
  const sourceBeforeLayout = await source.inputValue()
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

  await expect.poll(() => page.evaluate(() => localStorage.getItem('likec4.gui-to-code.manual-layouts.v1')))
    .not.toBeNull()
  const stored = await page.evaluate(() => localStorage.getItem('likec4.gui-to-code.manual-layouts.v1'))
  expect(JSON.parse(stored!)).toMatchObject({
    version: 1,
    files: { '.likec4/index.likec4.snap': { id: 'index', _stage: 'layouted' } },
  })

  await page.reload()
  await expect(page.getByLabel('Текущий вид')).toHaveValue('index')
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')
  await expect(source).toHaveValue(sourceBeforeLayout)

  const exportButton = page.getByRole('button', { name: 'Экспортировать раскладку' })
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
  await expect(source).toHaveValue(sourceBeforeLayout)

  await page.getByLabel('Импортировать раскладку').setInputFiles(snapshotPath)
  await expect(page.getByText('Ручная раскладка импортирована.', { exact: true })).toBeVisible()
  await expect(page.getByLabel('Режим раскладки')).toHaveValue('manual')
  await expect(source).toHaveValue(sourceBeforeLayout)
})
