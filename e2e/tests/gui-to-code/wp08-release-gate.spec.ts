import { expect, test, type Page } from '@playwright/test'

const workspaceDatabaseName = 'likec4-gui-to-code'

async function resetWorkspace(page: Page) {
  await page.goto('/')
  await page.evaluate(async databaseName => {
    localStorage.clear()
    sessionStorage.clear()
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.deleteDatabase(databaseName)
      request.onsuccess = () => resolve()
      request.onerror = () => reject(request.error ?? new Error('Failed to reset IndexedDB'))
      request.onblocked = () => reject(new Error('IndexedDB reset was blocked'))
    })
  }, workspaceDatabaseName)
  await page.reload()
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
}

test.describe('WP-08 responsive release smoke', () => {
  for (const viewport of [
    { name: 'narrow', width: 390, height: 844 },
    { name: 'desktop', width: 1440, height: 900 },
    { name: 'wide', width: 1920, height: 1080 },
  ]) {
    test(`${viewport.name} viewport keeps critical controls reachable`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await resetWorkspace(page)

      await expect(page.getByLabel('Текущий вид')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Создать вид' })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Экспортировать модель' })).toBeVisible()
      await expect(page.getByLabel('Импортировать модель')).toBeAttached()

      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
      expect(overflow).toBeLessThanOrEqual(1)

      const createView = page.getByRole('button', { name: 'Создать вид' })
      await createView.click()
      await expect(page.getByLabel('ID нового вида')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Создать', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Отмена', exact: true })).toBeVisible()
    })
  }
})

test('dialog supports keyboard open, initial focus, Escape and focus restoration', async ({ page }) => {
  await resetWorkspace(page)

  const opener = page.getByRole('button', { name: 'Создать вид' })
  await opener.focus()
  await page.keyboard.press('Enter')

  const idField = page.getByLabel('ID нового вида')
  await expect(idField).toBeVisible()
  await expect(idField).toBeFocused()

  await page.keyboard.press('Escape')
  await expect(idField).toBeHidden()
  await expect(opener).toBeFocused()
})

test('critical controls expose accessible names and Russian status surfaces', async ({ page }) => {
  await resetWorkspace(page)

  await expect(page.getByLabel('Исходный код LikeC4')).toBeAttached()
  await expect(page.getByLabel('Текущий вид')).toBeAttached()
  await expect(page.getByRole('button', { name: 'Отменить' })).toBeAttached()
  await expect(page.getByRole('button', { name: 'Повторить' })).toBeAttached()
  await expect(page.getByRole('button', { name: 'Создать вид' })).toBeAttached()
  await expect(page.getByRole('button', { name: 'Экспортировать модель' })).toBeAttached()
  await expect(page.getByLabel('Импортировать модель')).toBeAttached()

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toContain('Error:')
  expect(bodyText).not.toContain('Loading workspace')
  expect(bodyText).not.toContain('Save failed')
})
