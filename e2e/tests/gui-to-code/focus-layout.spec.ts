import { type Locator, expect, test } from '@playwright/test'
import { openPanel } from './panels'

async function expectClearFieldFocus(field: Locator): Promise<void> {
  await field.focus()
  await expect(field).toBeFocused()
  const measured = await field.evaluate(element => {
    const label = element.closest('label')
    if (!label) throw new Error('Field has no label')
    const text = [...label.childNodes].find(node => node.nodeType === Node.TEXT_NODE && node.textContent?.trim())
    if (!text) throw new Error('Field has no label text')
    const range = document.createRange()
    range.selectNodeContents(text)
    const fieldBox = element.getBoundingClientRect()
    const style = getComputedStyle(element)
    return {
      textGap: fieldBox.top - range.getBoundingClientRect().bottom,
      outlineWidth: style.outlineWidth,
      outlineOffset: style.outlineOffset,
      visible: element.matches(':focus-visible'),
    }
  })
  expect(measured.visible).toBe(true)
  expect(measured.outlineWidth).toBe('2px')
  expect(measured.outlineOffset).toBe('-2px')
  expect(measured.textGap).toBeGreaterThanOrEqual(8)
}

for (const width of [1280, 1440]) {
  test(`inspector labels and advanced sections stay clear of focus at ${width}px`, async ({ page }, testInfo) => {
    await page.setViewportSize({ width, height: 900 })
    await page.goto('/')
    await openPanel(page, 'Инспектор')
    const panel = page.getByRole('region', { name: 'Инспектор', exact: true })
    const helper = panel.getByText('Выберите логический элемент на диаграмме или в структуре.')
    const action = panel.getByRole('button', { name: 'Выбрать на холсте' })
    const helperBox = await helper.boundingBox()
    const actionBox = await action.boundingBox()
    if (!helperBox || !actionBox) throw new Error('Empty inspector has no bounds')
    expect(actionBox.y - helperBox.y - helperBox.height).toBeGreaterThanOrEqual(8)
    await page.screenshot({ path: testInfo.outputPath('inspector-empty.png') })

    await page.getByRole('button', { name: 'Закрыть панель «Инспектор»' }).click()
    await page.locator('.react-flow__node[data-id="shop.web"]').click()
    await openPanel(page, 'Инспектор')
    await page.keyboard.press('Tab')
    await expectClearFieldFocus(panel.getByRole('textbox', { name: 'Название', exact: true }))
    await page.screenshot({ path: testInfo.outputPath('inspector-focus.png') })
    const advanced = panel.getByText('Сценарии и развёртывание', { exact: true })
    await advanced.click()
    const dynamicTitle = panel.getByRole('textbox', { name: 'Название динамического вида', exact: true })
    await dynamicTitle.press('Tab')
    await dynamicTitle.press('Shift+Tab')
    await expectClearFieldFocus(dynamicTitle)
    await page.screenshot({ path: testInfo.outputPath('inspector-advanced.png') })
    await advanced.click()
    await page.getByRole('button', { name: 'Закрыть панель «Инспектор»' }).click()
    await page.getByText('shows orders', { exact: true }).click()
    await openPanel(page, 'Инспектор')
    await page.keyboard.press('Tab')
    await expectClearFieldFocus(panel.locator('[data-relation-title-input]'))
    await page.screenshot({ path: testInfo.outputPath('relation-focus.png') })
  })
}

test('connected creation separates its title label from the keyboard focus ring', async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 900 })
  await page.goto('/')
  await openPanel(page, 'Инспектор')
  const handle = page.locator('.likec4-authoring-handle.source[data-nodeid="shop.web"]').first()
  await expect(handle).toBeVisible()
  const box = await handle.boundingBox()
  if (!box) throw new Error('Connection handle has no bounds')
  const drop = await page.locator('.react-flow__pane').first().evaluate(element => {
    const rect = element.getBoundingClientRect()
    const root = element.getRootNode() as Node & { elementFromPoint?: (x: number, y: number) => Element | null }
    for (let y = Math.min(rect.bottom - 24, window.innerHeight - 24); y > rect.top + 24; y -= 24) {
      for (let x = Math.min(rect.right - 24, window.innerWidth - 24); x > rect.left + 24; x -= 24) {
        if (root.elementFromPoint?.(x, y) === element) return { x, y }
      }
    }
    return null
  })
  if (!drop) throw new Error('No empty canvas point')
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(drop.x, drop.y, { steps: 12 })
  await page.mouse.up()
  const menu = page.getByRole('region', { name: 'Создать элемент на холсте' })
  await menu.getByRole('button', { name: 'Компонент', exact: true }).click()
  const title = menu.getByRole('textbox', { name: 'Название нового элемента' })
  await title.press('Tab')
  await title.press('Shift+Tab')
  await expectClearFieldFocus(title)
  const expectMenuInsidePanel = async (): Promise<void> => {
    await expect(async () => {
      const menuBox = await menu.boundingBox()
      const panelBox = await page.getByRole('region', { name: 'Холст диаграммы' }).boundingBox()
      if (!menuBox || !panelBox) throw new Error('Menu or panel has no bounds')
      expect(menuBox.x).toBeGreaterThanOrEqual(panelBox.x)
      expect(menuBox.y).toBeGreaterThanOrEqual(panelBox.y)
      expect(menuBox.x + menuBox.width).toBeLessThanOrEqual(panelBox.x + panelBox.width)
      expect(menuBox.y + menuBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height)
    }).toPass()
  }
  await expectMenuInsidePanel()
  await page.screenshot({ path: testInfo.outputPath('connected-focus.png') })
  await page.setViewportSize({ width: 1280, height: 900 })
  await expectMenuInsidePanel()
  await title.press('Tab')
  await title.press('Shift+Tab')
  await expectClearFieldFocus(title)
  await page.screenshot({ path: testInfo.outputPath('connected-resized.png') })
  await title.press('Escape')
  await expect(menu).toBeHidden()
})
