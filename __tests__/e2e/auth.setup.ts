import { test as setup } from '@playwright/test';
import path from 'path';

const authFile = path.join(__dirname, '../../playwright/.auth/user.json');

setup('authenticate', async ({ page }) => {
  await page.goto('/login');
  await page.fill('input[type="password"]', process.env.AUTH_PASSWORD ?? 'testpassword');
  await page.getByRole('button', { name: /sign in/i }).click();
  await page.waitForURL('/');
  await page.context().storageState({ path: authFile });
});
