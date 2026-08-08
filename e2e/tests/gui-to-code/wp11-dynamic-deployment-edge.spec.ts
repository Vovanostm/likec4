import { expect, test, type Page } from '@playwright/test'

const sourceFixture = `specification {
  element actor
  element system
  deploymentNode environment
}

model {
  user = actor 'User'
  app = system 'Application'
}

deployment {
  environment prod
  environment edge
  prod -> edge 'Original deployment'
}

views {
  dynamic view flow {
    user -> app 'Original step'
  }

  deployment view deployment {
    include *
  }
}
`

async function loadFixture(page: Page) {
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'LikeC4: визуальный редактор' })).toBeVisible()
  await page.getByRole('button', { name: 'Код', exact: true }).click()
  const source = page.getByRole('textbox', { name: 'Исходный код LikeC4' })
  await source.fill(sourceFixture)
  const view = page.getByRole('combobox', { name: 'Текущий вид' })
  await expect(view.locator('option[value="flow"]')).toHaveCount(1)
  await expect(view.locator('option[value="deployment"]')).toHaveCount(1)
  return { source, view }
}

async function selectCanvasEdge(page: Page) {
  const edge = page.locator('.react-flow__edge').first()
  await expect(edge).toBeVisible()
  await edge.dispatchEvent('click')
}

test('edits and removes dynamic and deployment edges with exact Undo/Redo', async ({ page }) => {
  const { source, view } = await loadFixture(page)

  await view.selectOption('flow')
  await selectCanvasEdge(page)
  await expect(page.getByRole('heading', { name: 'Направленный шаг' })).toBeVisible()
  const dynamicTitle = page.getByRole('textbox', { name: 'Название: направленный шаг' })
  await dynamicTitle.fill('Updated step')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(source).toHaveValue(/user -> app 'Updated step'/)

  const undo = page.getByRole('button', { name: 'Отменить последнее изменение' })
  const redo = page.getByRole('button', { name: 'Повторить отменённое изменение' })
  await undo.click()
  await expect(source).toHaveValue(/user -> app 'Original step'/)
  await redo.click()
  await expect(source).toHaveValue(/user -> app 'Updated step'/)

  await selectCanvasEdge(page)
  await page.getByRole('region', { name: 'Холст диаграммы' }).focus()
  await page.keyboard.press('Delete')
  await expect(source).not.toHaveValue(/user -> app/)
  await undo.click()
  await expect(source).toHaveValue(/user -> app 'Updated step'/)

  await view.selectOption('deployment')
  await selectCanvasEdge(page)
  await expect(page.getByRole('heading', { name: 'Связь развёртывания' })).toBeVisible()
  const deploymentTitle = page.getByRole('textbox', { name: 'Название: связь развёртывания' })
  await deploymentTitle.fill('Updated deployment')
  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(source).toHaveValue(/prod -> edge 'Updated deployment'/)

  await undo.click()
  await expect(source).toHaveValue(/prod -> edge 'Original deployment'/)
  await redo.click()
  await expect(source).toHaveValue(/prod -> edge 'Updated deployment'/)

  await selectCanvasEdge(page)
  await page.getByRole('region', { name: 'Холст диаграммы' }).focus()
  await page.keyboard.press('Backspace')
  await expect(source).not.toHaveValue(/prod -> edge/)
  await undo.click()
  await expect(source).toHaveValue(/prod -> edge 'Updated deployment'/)
})

test('keeps keyboard inspector access and rejects stale edge actions', async ({ page }) => {
  const { source, view } = await loadFixture(page)
  await view.selectOption('flow')
  await selectCanvasEdge(page)

  const canvas = page.getByRole('region', { name: 'Холст диаграммы' })
  await canvas.focus()
  await page.keyboard.press('Enter')
  const title = page.getByRole('textbox', { name: 'Название: направленный шаг' })
  await expect(title).toBeFocused()

  await canvas.focus()
  await page.keyboard.press('Shift+F10')
  await expect(title).toBeFocused()

  await title.fill('Must stay stale')
  const before = await source.inputValue()
  await source.fill(`${before}\n// concurrent source edit`)
  await expect(source).toHaveValue(/concurrent source edit/)

  await page.getByRole('button', { name: 'Сохранить', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('Рабочее пространство или текущий вид изменились')
  await expect(source).not.toHaveValue(/Must stay stale/)
})
