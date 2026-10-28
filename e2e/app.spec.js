const { test, expect } = require('@playwright/test');

test.describe('ESEC Transport Web App', () => {
  test('should load parent home page and display header brand', async ({ page }) => {
    await page.goto('/', { waitUntil: 'domcontentloaded', timeout: 60000 });
    
    // Check page title set by React Navigation
    await expect(page).toHaveTitle(/ParentHome|ESEC/i);
    await expect(page.getByText('ERODE SENGUNTHAR', { exact: true })).toBeVisible();
  });
});
