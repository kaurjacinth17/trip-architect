import { expect, test } from '@playwright/test';
import { mockApi } from './mockApi';

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com|tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, body: '' }));
  await page.clock.setFixedTime(new Date('2026-11-20T10:00:00'));
});

test('Explore lists 30+ more places across India; a card opens its live guide', async ({ page }) => {
  await mockApi(page);
  await page.goto('/explore');
  await expect(page.getByRole('heading', { name: 'More places across India' })).toBeVisible();
  expect(await page.locator('.dcard').count()).toBeGreaterThanOrEqual(8 + 30);
  const card = page.locator('.dcard', { has: page.getByRole('heading', { name: 'Jodhpur', exact: true }) });
  await card.scrollIntoViewIfNeeded();
  await card.getByRole('button', { name: 'Details and plan' }).click();
  await expect(page).toHaveURL(/\/destinations\/g:ChIJTESTjodhpur0000000001$/);
});

test('itinerary asks where you are staying, and the map has clickable nearby places and an overview map', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/stays');
  // remove the sample's stays so no hotel is known
  for (const name of ['Delete Old City haveli (sample)', 'Delete C-Scheme boutique hotel (sample)']) await page.getByRole('button', { name }).click();
  await page.goto('/trips/sample-jaipur/itinerary');
  await expect(page.getByText('Where are you staying in Jaipur?')).toBeVisible();
  await expect(page.getByRole('link', { name: 'Find a hotel' })).toHaveAttribute('href', /\/destinations\/jaipur\/guide\?tab=hotels&trip=sample-jaipur/);
  await page.goto('/trips/sample-jaipur/map');
  await expect(page.getByRole('heading', { name: 'Overview map' })).toBeVisible();
  await expect(page.getByRole('img', { name: /Overview map of/ })).toBeVisible();
});
