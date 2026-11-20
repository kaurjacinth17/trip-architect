import { expect, test } from '@playwright/test';
import { mockApi } from './mockApi';

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com|tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, body: '' }));
});

const JODHPUR = '/destinations/g:ChIJTESTjodhpur0000000001/guide';

test('Jodhpur hotels: 4.5+ in one area, shareable URL, set one as the stay', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await mockApi(page);
  // Open the destination first (stores its record), then its guide
  await page.goto('/destinations/g:ChIJTESTjodhpur0000000001');
  await page.getByRole('link', { name: 'City Guide', exact: true }).click();
  await page.getByLabel('Planning for').selectOption({ label: 'Jaipur getaway' });
  await page.getByRole('navigation', { name: 'City Guide sections' }).getByRole('link', { name: 'Hotels' }).click();
  await expect(page.locator('.pcard')).toHaveCount(3);
  await page.getByRole('group', { name: 'Minimum rating' }).getByRole('button', { name: '4.5+ ★' }).click();
  await expect(page.locator('.pcard')).toHaveCount(2);
  await page.locator('.areas-pick summary').click();
  await page.getByRole('checkbox', { name: 'Old City' }).check();
  await expect(page.locator('.pcard')).toHaveCount(2);
  await expect(page).toHaveURL(/tab=hotels.*rating=4\.5.*areas=Old\+City/);
  // the filtered view survives a reload (filters live in the URL)
  await page.reload();
  await expect(page.locator('.pcard')).toHaveCount(2);
  await page.getByRole('combobox', { name: 'Sort' }).selectOption('rating');
  await expect(page.locator('.pcard').first()).toContainText('Gamma Stay (fixture)');
  await page.locator('.pcard', { hasText: 'Haveli Alpha' }).getByRole('button', { name: 'Set as my stay' }).click();
  await expect(page.locator('.toast')).toContainText('Added to stays in Jaipur getaway');
  await page.goto('/trips/sample-jaipur/stays');
  await expect(page.getByText('Haveli Alpha (fixture)')).toBeVisible(); // name shown live
  const stored = await page.evaluate(() => localStorage.getItem('trip-architect-v1') || '');
  expect(stored).toContain('ChIJTESThotelalpha00001');
  expect(stored).not.toContain('Haveli Alpha');
  expect(errors).toEqual([]);
});

test('restaurants 4.0+ with 500+ reviews → add as lunch on Day 2 at 1:00 PM', async ({ page }) => {
  await mockApi(page);
  await page.goto('/destinations/jaipur/guide?tab=restaurants&trip=sample-jaipur');
  await page.getByRole('group', { name: 'Minimum rating' }).getByRole('button', { name: '4+ ★' }).click();
  await page.getByRole('group', { name: 'Minimum reviews' }).getByRole('button', { name: '500+' }).click();
  await expect(page.locator('.pcard')).toHaveCount(2);
  await page.getByRole('button', { name: 'Add Thali House as lunch' }).click();
  const dlg = page.getByRole('dialog', { name: 'Add Thali House' });
  await dlg.getByLabel('Day').selectOption({ index: 1 });
  await dlg.getByLabel('Start time').fill('13:00');
  await dlg.getByRole('button', { name: 'Add to Day 2' }).click();
  await expect(page.locator('.toast')).toContainText('Thali House added to Day 2 at 1:00 PM as lunch');
  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 2/ }).click();
  const slot = page.locator('.slot', { hasText: 'Thali House' });
  await expect(slot.locator('.time')).toContainText('1:00 PM');
  await expect(slot).toContainText('Meal break');
});

test('“All areas” runs one search per area and reports an honest count; the detail drawer opens', async ({ page }) => {
  const calls = await mockApi(page);
  await page.goto(JODHPUR.replace('/guide', ''));
  await page.goto(JODHPUR + '?tab=hotels');
  await expect(page.locator('.pcard')).toHaveCount(3);
  const before = calls.filter((c) => c === '/api/places/search').length;
  await page.getByRole('button', { name: /All hotels \(search 3 areas\)/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Search 3 areas' }).click();
  await expect(page.getByText(/Showing 3 of 3 hotels from Google across 3 areas/)).toBeVisible();
  expect(calls.filter((c) => c === '/api/places/search').length - before).toBe(3);
  await page.locator('.pcard', { hasText: 'Beta Residency' }).getByRole('button', { name: 'Beta Residency (fixture)', exact: true }).click();
  const drawer = page.getByRole('dialog', { name: 'Beta Residency (fixture)' });
  await expect(drawer.getByText('Fixture address')).toBeVisible();
  await expect(drawer.getByText('Monday: 9:00 AM – 9:00 PM')).toBeVisible();
  await expect(drawer.getByText('Google Maps', { exact: true }).first()).toBeVisible();
});

test('Areas tab ranks areas and jumps to “Restaurants here”', async ({ page }) => {
  await mockApi(page);
  await page.goto('/destinations/jaipur/guide?tab=areas&trip=sample-jaipur');
  await expect(page.getByText('Closest to your plan')).toBeVisible();
  await page.locator('.li', { hasText: 'Old City' }).getByRole('button', { name: 'Restaurants here' }).click();
  await expect(page).toHaveURL(/tab=restaurants&in=Old\+City/);
  await expect(page.locator('.banner')).toContainText('Restaurants in Old City');
});
