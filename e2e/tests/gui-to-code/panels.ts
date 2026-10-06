import { type Page, expect } from '@playwright/test'

/** Open a requested panel without toggling an already open panel closed. */
export async function openPanel(page: Page, name: 'Структура' | 'Инспектор' | 'Код'): Promise<void> {
  const toggle = page.getByRole('button', { name, exact: true })
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click()
  await expect(toggle).toHaveAttribute('aria-expanded', 'true')
  const id = await toggle.getAttribute('aria-controls')
  if (!id) throw new Error(`Panel ${name} has no accessible target`)
  await expect(page.locator(`#${id}`)).toBeVisible()
}
