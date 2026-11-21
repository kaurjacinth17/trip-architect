import { expect, test } from '@playwright/test';
import { mockApi } from './mockApi';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');

test.beforeEach(async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
});

test('search “Jodhpur” in Explore and open its auto-built guide', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await mockApi(page);
  await page.goto('/explore');
  await page.getByRole('combobox', { name: /Go anywhere/ }).fill('Jodhpur');
  await page.getByRole('option', { name: /Jodhpur.*Rajasthan, India/ }).click();
  await expect(page).toHaveURL(/\/destinations\/g:/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Jodhpur');
  await expect(page.getByText('Jodhpur is a city in Rajasthan (test fixture).')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Wikipedia' })).toBeVisible();
  await expect(page.getByText(/Most comfortable: Nov–Feb/)).toBeVisible();
  await expect(page.getByText('Mehrangarh Fort')).toBeVisible();
  await expect(page.getByText('Sardarpura')).toBeVisible();
  await expect(page.getByText(/average of our hand-written guides/)).toHaveCount(0); // type not chosen yet
  await page.getByLabel(/What kind of place is Jodhpur/).selectOption('tier2');
  await expect(page.getByText(/average of our hand-written guides for similar places \(Jaipur, Udaipur\)/)).toBeVisible();
  expect(errors).toEqual([]);
});

test('plan a trip to any destination: live starter plan with names shown but not stored', async ({ page }) => {
  await mockApi(page);
  await page.goto('/new');
  await page.getByRole('combobox', { name: /search anywhere/ }).fill('Jodh');
  await page.getByRole('option', { name: /Jodhpur/ }).click();
  await expect(page.getByText('Going to Jodhpur')).toBeVisible();
  for (let i = 0; i < 5; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByRole('button', { name: 'Create my trip' }).click();
  await expect(page).toHaveURL(/\/itinerary$/);
  await page.getByRole('button', { name: /^Day 2/ }).click();
  await expect(page.locator('.tl .bt').filter({ hasText: /Mehrangarh Fort|Umaid Bhawan|Ghanta Ghar|Toorji/ }).first()).toBeVisible();
  const stored = await page.evaluate(() => localStorage.getItem('trip-architect-v1') || '');
  expect(stored).toContain('ChIJTESTmehrangarh000001');
  expect(stored).not.toContain('Mehrangarh');
});

test('add Spiti Valley as a second destination mid-trip, preview, apply', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/overview');
  await page.getByRole('button', { name: 'Add destination' }).click();
  await page.getByRole('combobox', { name: 'Search any destination' }).fill('Spiti');
  await page.getByRole('option', { name: /Spiti Valley/ }).click();
  const dlg = page.getByRole('dialog', { name: /Add Spiti Valley/ });
  await dlg.getByLabel('Where in the route').selectOption({ label: 'After Jaipur' });
  await dlg.getByRole('button', { name: 'More days' }).click(); // 3 days
  await expect(dlg.getByText(/Adds 3 days for Spiti Valley after Jaipur\. The trip becomes 7 days/)).toBeVisible();
  await expect(dlg.locator('tr', { hasText: 'Day 5' })).toContainText('New');
  await dlg.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByRole('list', { name: 'Route' })).toContainText('Spiti Valley');
  await expect(page.getByText('Jaipur → Spiti Valley').first()).toBeVisible();
  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 5/ }).click();
  await expect(page.locator('.tl .bt').first()).toHaveText('Travel to Spiti Valley');
});

test('a custom place with a dropped pin works without Google', async ({ page }) => {
  await mockApi(page, { unconfigured: true });
  await page.goto('/new');
  await page.getByRole('combobox', { name: /search anywhere/ }).fill('Chitkul');
  await page.getByRole('option', { name: /Add “Chitkul” as a custom place/ }).click();
  const dlg = page.getByRole('dialog', { name: 'Add a custom place' });
  await dlg.getByLabel('Latitude').fill('31.35');
  await dlg.getByLabel('Longitude').fill('78.44');
  await dlg.getByLabel('Kind of place').selectOption('hill');
  await dlg.getByRole('button', { name: 'Add place' }).click();
  await expect(page.getByText('Going to Chitkul')).toBeVisible();
});

test('when the daily quota is used up: banner, curated search still works, planning still works', async ({ page }) => {
  await mockApi(page, { quota: true });
  await page.goto('/explore');
  await expect(page.getByText('Live place data is resting for today; showing saved and curated info.')).toBeVisible();
  await page.getByRole('combobox', { name: /Go anywhere/ }).fill('Udai');
  await page.getByRole('option', { name: /Udaipur/ }).click();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Udaipur');
  await page.goto('/trips/sample-jaipur/itinerary');
  await expect(page.locator('.tl .blk').first()).toBeVisible();
});
