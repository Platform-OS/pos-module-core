import { test, expect } from 'playwright/test';

const BASE_URL = process.env.MPKIT_URL.replace(/\/$/, '', '');

test('has headings', async ({ page }) => {
  await page.goto(BASE_URL + '/_events');

  await expect(page.getByRole("heading", { name: "Events", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "no events found", exact: true })).toBeVisible();
});
