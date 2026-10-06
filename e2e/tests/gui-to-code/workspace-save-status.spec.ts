import { type Page, expect, test } from '@playwright/test'
import { Buffer } from 'node:buffer'

async function downloadDraft(page: Page): Promise<string> {
  const pending = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Скачать черновик .c4', exact: true }).click()
  const download = await pending
  expect(download.suggestedFilename()).toBe('model.c4')
  const stream = await download.createReadStream()
  if (!stream) throw new Error('Draft download stream unavailable')
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  return Buffer.concat(chunks).toString('utf8')
}

test('invalid draft shows unsaved status and downloads exact bytes while preserving the last valid canvas', async ({ page }) => {
  await page.goto('/')
  const status = page.locator('.save-status')
  await expect(status).toHaveAttribute('data-status', 'saved')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  const original = await source.inputValue()
  const nodes = await page.locator('.react-flow__node').count()
  expect(nodes).toBeGreaterThan(0)
  const invalid = `${original}\nmodel { broken =`
  await source.fill(invalid)
  await expect(status).toHaveAttribute('data-status', 'invalid')
  await expect(status).toContainText('Черновик не сохранён. Сохранена последняя корректная версия.')
  await expect(page.locator('.react-flow__node')).toHaveCount(nodes)
  expect(await downloadDraft(page)).toBe(invalid)
  await page.reload()
  await expect(status).toHaveAttribute('data-status', 'saved')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  await expect(source).toHaveValue(original)
})

test('unavailable storage exposes an error and keeps exact current source downloadable', async ({ page }) => {
  await page.addInitScript(() => {
    IDBFactory.prototype.open = () => {
      throw new DOMException('Storage unavailable', 'SecurityError')
    }
  })
  await page.goto('/')
  const status = page.locator('.save-status')
  await expect(status).toHaveAttribute('data-status', 'error')
  await expect(status).toContainText('Не удалось сохранить рабочее пространство.')
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  const draft = `${await source.inputValue()}\n// current unsaved bytes`
  await source.fill(draft)
  await expect(status).toHaveAttribute('data-status', 'error')
  expect(await downloadDraft(page)).toBe(draft)
})
