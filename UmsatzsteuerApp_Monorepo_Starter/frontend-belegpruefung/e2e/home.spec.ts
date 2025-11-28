import { test, expect } from '@playwright/test'

test('Landing shows title and upload button', async ({ page }) => {
  await page.goto('http://localhost:5173')
  await expect(page.getByRole('heading', { name: /BelegprüfungsApp/i })).toBeVisible()
  await expect(page.getByRole('button', { name: /Upload/i })).toBeVisible()
})
