import { type Page, expect, test } from '@playwright/test'
import { openPanel } from './panels'

async function openIsolatedWorkspace(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
}

async function selectFirstLogicalElement(page: Page) {
  await openPanel(page, 'Структура')
  const firstElement = page.getByRole('treeitem').first().locator('.structure-item')
  await expect(firstElement).toBeVisible()
  await firstElement.click()
}

test.describe('WP-08 responsive release smoke', () => {
  for (
    const viewport of [
      { name: 'narrow', width: 390, height: 844 },
      { name: 'desktop', width: 1440, height: 900 },
      { name: 'wide', width: 1920, height: 1080 },
    ]
  ) {
    test(`${viewport.name} viewport keeps critical controls reachable`, async ({ page }) => {
      await page.setViewportSize({ width: viewport.width, height: viewport.height })
      await openIsolatedWorkspace(page)
      await selectFirstLogicalElement(page)

      await expect(page.getByLabel('Текущий вид')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Создать вид' })).toBeVisible()
      await page.getByText('Файл и действия', { exact: true }).click()
      await expect(page.getByRole('button', { name: 'Экспортировать .c4', exact: true })).toBeVisible()
      await expect(page.getByLabel('Открыть файл .c4')).toBeAttached()
      await expect(page.getByLabel('Импортировать архив рабочего пространства')).toBeAttached()
      await page.getByText('Файл и действия', { exact: true }).click()

      const overflow = await page.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
      expect(overflow).toBeLessThanOrEqual(1)

      const createView = page.getByRole('button', { name: 'Создать вид' })
      await createView.click()
      await expect(page.getByLabel('Название нового вида')).toBeVisible()
      await expect(page.getByLabel('ID нового вида')).toBeHidden()
      await expect(page.getByLabel('ID нового вида')).not.toHaveAttribute('required', '')
      await page.getByRole('form', { name: 'Создание статического вида' }).getByText('Подробности', { exact: true })
        .click()
      await expect(page.getByLabel('ID нового вида')).toBeVisible()
      await expect(page.getByRole('button', { name: 'Создать', exact: true })).toBeVisible()
      await expect(page.getByRole('button', { name: 'Отмена', exact: true })).toBeVisible()
    })
  }
})

test('dialog supports keyboard open, initial focus, Escape and focus restoration', async ({ page }) => {
  await openIsolatedWorkspace(page)
  await selectFirstLogicalElement(page)

  const opener = page.getByRole('button', { name: 'Создать вид' })
  await opener.focus()
  await page.keyboard.press('Enter')

  const titleField = page.getByLabel('Название нового вида')
  await expect(titleField).toBeVisible()
  await expect(titleField).toBeFocused()
  await expect(page.getByLabel('ID нового вида')).toBeHidden()

  await page.keyboard.press('Escape')
  await expect(titleField).toBeHidden()
  await expect(opener).toBeFocused()
})

test('critical controls expose accessible names and Russian status surfaces', async ({ page }) => {
  await openIsolatedWorkspace(page)
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await page.getByText('Файл и действия', { exact: true }).click()

  await expect(page.getByLabel('Исходный код LikeC4')).toBeAttached()
  await expect(page.getByLabel('Текущий вид')).toBeAttached()
  await expect(page.getByRole('button', { name: 'Отменить последнее изменение' })).toBeAttached()
  await expect(page.getByRole('button', { name: 'Повторить отменённое изменение' })).toBeAttached()
  await expect(page.getByRole('button', { name: 'Экспортировать .c4', exact: true })).toBeAttached()
  await expect(page.getByLabel('Открыть файл .c4')).toBeAttached()
  await expect(page.getByLabel('Импортировать архив рабочего пространства')).toBeAttached()
  await expect(page.getByRole('status').filter({ hasText: 'Рабочее пространство сохранено.' })).toBeVisible()

  const bodyText = await page.locator('body').innerText()
  expect(bodyText).not.toContain('Error:')
  expect(bodyText).not.toContain('Loading workspace')
  expect(bodyText).not.toContain('Save failed')
  expect(bodyText).not.toContain('Workspace сохранён')
})
