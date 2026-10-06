import { expect, test } from '@playwright/test'
import { openPanel } from './panels'

for (
  const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1400, height: 900 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]
) {
  test(`primary actions remain reachable at ${viewport.width}x${viewport.height}`, async ({ page }) => {
    await page.setViewportSize(viewport)
    await page.goto('/')
    await expect(page.locator('.save-status')).toHaveAttribute('data-status', 'saved')
    await expect(page.getByRole('button', { name: 'Создать вид', exact: true })).toBeEnabled()
    const toolbar = page.getByRole('toolbar', { name: 'Инструменты диаграммы' })
    await expect(toolbar).toBeVisible()
    for (const button of await toolbar.getByRole('button').all()) {
      const box = await button.boundingBox()
      expect(box?.width).toBeGreaterThanOrEqual(24)
      expect(box?.height).toBeGreaterThanOrEqual(24)
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true)

    const canvas = page.getByRole('region', { name: 'Холст диаграммы' })
    const workspace = page.getByRole('region', { name: 'Рабочая область редактора LikeC4' })
    const panels = page.locator('#workspace-structure, #workspace-inspector, #workspace-code')
    await expect(panels.filter({ visible: true })).toHaveCount(0)
    for (const name of ['Структура', 'Инспектор', 'Код']) {
      await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-expanded', 'false')
    }
    const initialCanvas = await canvas.boundingBox()
    if (!initialCanvas) throw new Error('Canvas must have visible geometry')
    await expect(async () => {
      const area = await workspace.boundingBox()
      const box = await canvas.boundingBox()
      if (!area || !box) throw new Error('Workspace and canvas must remain visible')
      expect(Math.abs(box.height - area.height)).toBeLessThanOrEqual(2)
      expect(Math.abs(box.width - area.width)).toBeLessThanOrEqual(2)
      expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
      expect(Math.abs(box.y + box.height - viewport.height)).toBeLessThanOrEqual(2)
    }).toPass()

    for (
      const [name, id, title] of [
        ['Структура', 'workspace-structure', 'Структура модели'],
        ['Инспектор', 'workspace-inspector', 'Инспектор'],
        ['Код', 'workspace-code', 'Код LikeC4'],
      ] as const
    ) {
      await openPanel(page, name)
      const panel = page.locator(`#${id}`)
      await expect(panels.filter({ visible: true })).toHaveCount(1)
      await expect(panel).not.toHaveAttribute('aria-modal', 'true')
      await expect(canvas).not.toHaveAttribute('inert', '')
      await canvas.focus()
      await expect(canvas).toBeFocused()
      await expect(async () => {
        const box = await canvas.boundingBox()
        const overlay = await panel.boundingBox()
        if (!box || !overlay) throw new Error('Panel and canvas must have geometry')
        expect(Math.abs(box.height - initialCanvas.height)).toBeLessThanOrEqual(2)
        expect(Math.abs(box.y - initialCanvas.y)).toBeLessThanOrEqual(2)
        expect(overlay.y).toBeGreaterThanOrEqual(box.y - 1)
        expect(overlay.y + overlay.height).toBeLessThanOrEqual(box.y + box.height + 1)
        expect(overlay.x).toBeGreaterThanOrEqual(0)
        expect(overlay.x + overlay.width).toBeLessThanOrEqual(viewport.width + 1)
        if (viewport.width <= 1400) {
          expect(Math.abs(box.width - initialCanvas.width)).toBeLessThanOrEqual(2)
          expect(overlay.x).toBeLessThan(box.x + box.width)
          expect(overlay.x + overlay.width).toBeGreaterThan(box.x)
          expect(await panel.evaluate(element => getComputedStyle(element).position)).toBe('absolute')
        } else {
          expect(box.width).toBeLessThan(initialCanvas.width)
          expect(overlay.x + overlay.width <= box.x + 2 || box.x + box.width <= overlay.x + 2).toBe(true)
        }
        expect(await panel.evaluate(element => getComputedStyle(element).overflowY)).toMatch(/auto|scroll/)
        expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight + 1)).toBe(true)
      }).toPass()
      const close = panel.getByRole('button', { name: `Закрыть панель «${title}»` })
      await close.click()
      await expect(panel).toBeHidden()
      await expect(page.getByRole('button', { name, exact: true })).toBeFocused()
      await openPanel(page, name)
      await expect(close).toBeFocused()
      await close.press('Escape')
      await expect(panel).toBeHidden()
      await expect(page.getByRole('button', { name, exact: true })).toBeFocused()
    }
  })
}

test('panel replacement keeps Inspector mounted and preserves dirty input through Close and Escape', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 })
  await page.goto('/')
  await openPanel(page, 'Структура')
  await page.getByRole('button', { name: /Web application.*shop\.web/ }).click()
  await openPanel(page, 'Инспектор')
  const inspector = page.getByRole('region', { name: 'Инспектор элемента' })
  const title = inspector.getByLabel('Название', { exact: true })
  await title.fill('Несохранённый черновик WP15')
  const originalInput = await title.elementHandle()
  if (!originalInput) throw new Error('Inspector input must exist')
  for (const name of ['Структура', 'Код'] as const) {
    await openPanel(page, name)
    await expect(page.locator('#workspace-structure, #workspace-inspector, #workspace-code').filter({ visible: true }))
      .toHaveCount(1)
    await expect(inspector).toBeHidden()
    expect(await originalInput.evaluate(element => element.isConnected)).toBe(true)
    await openPanel(page, 'Инспектор')
    await expect(title).toHaveValue('Несохранённый черновик WP15')
    expect(await originalInput.evaluate(element => element === document.getElementById('element-title'))).toBe(true)
  }
  await page.getByRole('button', { name: 'Закрыть панель «Инспектор»' }).click()
  await openPanel(page, 'Инспектор')
  await expect(title).toHaveValue('Несохранённый черновик WP15')
  await title.press('Escape')
  await expect(inspector).toBeHidden()
  await expect(page.getByRole('button', { name: 'Инспектор', exact: true })).toBeFocused()
  await openPanel(page, 'Инспектор')
  await expect(title).toHaveValue('Несохранённый черновик WP15')
  await openPanel(page, 'Код')
  await expect(page.getByLabel('Исходный код LikeC4')).not.toHaveValue(/Несохранённый черновик WP15/)
})
