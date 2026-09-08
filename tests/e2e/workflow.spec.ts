import { test, expect } from '@playwright/test';
test('declare, update, advance, persist, and observe', async ({ page }, info) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Payment requests timing out', exact: true }),
  ).toHaveCount(2);
  await page.screenshot({
    path: `test-results/${info.project.name}-dashboard.png`,
    fullPage: true,
  });
  await page.getByRole('button', { name: 'Declare incident', exact: true }).click();
  const modal = page.getByRole('dialog');
  await modal.getByLabel('Title', { exact: true }).fill('Search indexing unavailable');
  await modal.getByLabel('Impact summary').fill('New search documents are not being indexed.');
  await modal.getByRole('button', { name: 'Create incident', exact: true }).click();
  await expect(modal).toBeHidden();
  await page
    .getByLabel('Leave the next responder a useful update.')
    .fill('Found the failing upstream dependency.');
  await page.getByRole('button', { name: 'Move to Identified', exact: true }).click();
  await expect(
    page.getByText('Found the failing upstream dependency.', { exact: false }).first(),
  ).toBeVisible();
  await page.reload();
  await page.getByRole('button', { name: /Search indexing unavailable/ }).click();
  await expect(page.getByRole('button', { name: 'Move to Monitoring', exact: true })).toBeVisible();
  await page.getByLabel('Demo role').selectOption('VIEWER');
  await expect(page.getByRole('button', { name: 'Post update', exact: true })).toBeDisabled();
  await expect(page.locator('.error')).toHaveCount(0);
});
