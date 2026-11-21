import { expect, test } from '@playwright/test';
import { mockApi } from './mockApi';

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
});

test('map: Restaurants layer → add a café to Day 1 → Navigate link is built', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/map');
  await page.getByRole('group', { name: 'Day filter' }).getByRole('button', { name: 'Day 1' }).click();
  await page.getByRole('group', { name: 'Nearby' }).getByRole('button', { name: 'Cafés' }).click();
  await page.getByRole('group', { name: 'Nearby filters' }).getByRole('button', { name: '4+ ★' }).click();
  const stopsBefore = new URL((await page.getByRole('link', { name: /Navigate this day|Part 1/ }).first().getAttribute('href'))!).searchParams.get('waypoints')!.split('|').length;
  await page.getByRole('button', { name: 'Add Rooftop Café to Day 1' }).click();
  await expect(page.locator('.toast')).toContainText('Rooftop Café added to Day 1');
  const nav = page.getByRole('link', { name: /Navigate this day|Part 1/ }).first();
  const href = await nav.getAttribute('href');
  const u = new URL(href!);
  expect(u.origin + u.pathname).toBe('https://www.google.com/maps/dir/');
  expect(u.searchParams.get('api')).toBe('1');
  expect(u.searchParams.get('travelmode')).toBe('driving');
  // the café is now one more stop on the route. (Its place ID isn't in this link: Google accepts waypoint place IDs
  // only for every waypoint, and Day 1's curated stops have none; the all-Google case is covered in navigate.test.ts.)
  expect(u.searchParams.get('waypoints')!.split('|').length).toBe(stopsBefore + 1);
  await page.getByRole('group', { name: 'Travel mode' }).getByRole('button', { name: 'Walk' }).click();
  expect(new URL((await nav.getAttribute('href'))!).searchParams.get('travelmode')).toBe('walking');
});

test('the map needs no key: OpenStreetMap with credit, pins and Navigate links', async ({ page }) => {
  await page.route(/tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: '' }));
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/map');
  await expect(page.locator('.leaflet-container')).toBeVisible();
  await expect(page.getByRole('link', { name: 'OpenStreetMap' }).first()).toBeVisible();
  await expect(page.getByText('Maps need a Google Maps key on this site.')).toHaveCount(0);
  await expect(page.locator('.gpin-wrap').first()).toBeVisible();
});
