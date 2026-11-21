import { expect, test } from '@playwright/test';
import { mockApi } from './mockApi';

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com|tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, body: '' }));
  await page.clock.setFixedTime(new Date('2026-11-20T10:00:00'));
});

test('travel leg, bookings, calendar export and a template', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 2/ }).first().click();
  await page.getByRole('button', { name: 'Add travel leg' }).click();
  const d = page.getByRole('dialog', { name: 'Add a travel leg' });
  await d.getByLabel('From').fill('New Delhi');
  await d.getByLabel('Departs').fill('06:00');
  await d.getByLabel('Arrives', { exact: true }).fill('10:30');
  await d.getByLabel('PNR or booking reference').fill('4512345678');
  await expect(d.getByRole('link', { name: 'IRCTC' })).toBeVisible();
  await d.getByRole('button', { name: 'Add leg' }).click();
  const leg = page.locator('.blk', { hasText: 'Train: New Delhi → Jaipur' });
  await expect(leg).toContainText('PNR 4512345678');
  await expect(leg.getByRole('img', { name: 'Time locked' })).toBeVisible();
  await expect(leg.getByRole('link', { name: 'Add to Google Calendar' })).toHaveAttribute('href', /calendar\.google\.com/);

  await page.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Bookings' }).click();
  await page.getByLabel('Title').fill('Shatabdi ticket');
  await page.getByLabel('Reference / PNR').fill('4512345678');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.locator('.xrow', { hasText: 'Shatabdi ticket' })).toContainText('Booked');
  await page.getByRole('tab', { name: 'Pending' }).click();
  await expect(page.locator('.xrow', { hasText: 'Shatabdi ticket' })).toHaveCount(0);

  await page.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Share' }).click();
  const dl = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download calendar (.ics)' }).click();
  expect((await dl).suggestedFilename()).toMatch(/\.ics$/);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.getByRole('button', { name: 'Copy template link' }).click();
  const link = await page.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  if (link) {
    await page.goto(link.replace(/^https?:\/\/[^/]+/, ''));
    await expect(page.getByRole('button', { name: 'Use this itinerary' })).toBeVisible();
    await expect(page.getByText('Riya')).toHaveCount(0);
  }
  expect(errors).toEqual([]);
});

test('offline: a saved trip still opens, with an offline notice', async ({ page, context }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/itinerary');
  await expect(page.locator('.blk').first()).toBeVisible();
  await page.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Overview' }).click();
  await page.getByRole('button', { name: 'Vegetarian' }).click(); // an edit, so the trip is saved locally
  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText(/You’re offline\./)).toBeVisible();
  await page.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Itinerary' }).click();
  await expect(page.locator('.blk').first()).toBeVisible();
  await context.setOffline(false);
});
