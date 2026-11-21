import { expect, test } from '@playwright/test';
import { mockApi } from './mockApi';

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await page.clock.setFixedTime(new Date('2026-11-20T10:00:00'));
});

test('Jodhpur: Hotels 4.5+ in one area → compare 2 → set one as the stay for nights 1–3 → locked check-in and check-out', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await mockApi(page);
  await page.goto('/explore');
  await page.getByRole('combobox', { name: /Go anywhere/ }).fill('Jodhpur');
  await page.getByRole('option', { name: /Jodhpur.*Rajasthan, India/ }).click();
  await page.getByRole('link', { name: 'City Guide', exact: true }).click();
  await page.getByLabel('Planning for').selectOption({ label: 'Jaipur getaway' });
  await page.getByRole('navigation', { name: 'City Guide sections' }).getByRole('link', { name: 'Hotels' }).click();
  await page.getByRole('group', { name: 'Minimum rating' }).getByRole('button', { name: '4.5+ ★' }).click();
  await page.locator('.areas-pick summary').click();
  await page.getByRole('checkbox', { name: 'Old City' }).check();
  await expect(page.locator('.pcard')).toHaveCount(2);

  await page.getByRole('checkbox', { name: 'Compare Haveli Alpha (fixture)' }).check();
  await page.getByRole('checkbox', { name: 'Compare Gamma Stay (fixture)' }).check();
  await page.getByRole('region', { name: 'Hotel comparison' }).getByRole('button', { name: 'Compare 2' }).click();
  const cmp = page.getByRole('dialog', { name: 'Compare hotels' });
  await expect(cmp.getByRole('columnheader', { name: 'Haveli Alpha (fixture)' })).toBeVisible();
  await expect(cmp.getByRole('row', { name: /Google rating/ })).toContainText('★ 4.6');
  await expect(cmp.getByRole('row', { name: /Google rating/ })).toContainText('★ 4.8');
  await expect(cmp.getByRole('row', { name: /Railway station/ })).toContainText('Junction station (fixture)');
  await expect(cmp.getByRole('row', { name: /Airport/ })).toContainText('Airport (fixture)');
  await expect(cmp.getByRole('row', { name: /Your price per night/ })).toContainText('Not saved yet');
  const booking = cmp.getByRole('row', { name: /Check prices/ }).getByRole('link', { name: 'Booking.com' }).first();
  expect(await booking.getAttribute('href')).toContain('ss=Haveli+Alpha+%28fixture%29%2C+Jodhpur');
  await cmp.getByRole('button', { name: 'Set Haveli Alpha (fixture) as my stay' }).click();

  const dlg = page.getByRole('dialog', { name: /as my stay/ });
  await dlg.getByLabel('From night').selectOption({ value: '0' });
  await dlg.getByLabel('To night').selectOption({ value: '2' });
  await expect(dlg).toContainText('3 nights: check in on Day 1');
  await dlg.getByRole('button', { name: 'Set nights 1–3' }).click();
  await expect(page.locator('.toast')).toContainText('is your stay for nights 1–3');

  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 1/ }).first().click();
  const cin = page.locator('.blk', { hasText: 'Arrive and check in' });
  await expect(cin).toContainText('Haveli Alpha (fixture)');
  await expect(cin.getByRole('img', { name: 'Time locked' })).toBeVisible();
  await page.getByRole('button', { name: /^Day 4/ }).first().click();
  const cout = page.locator('.blk', { hasText: 'Check out' });
  await expect(cout).toContainText('Haveli Alpha (fixture)');
  await expect(cout.getByRole('img', { name: 'Time locked' })).toBeVisible();
  await expect(cout).toContainText('11:30 AM'); // 11:00–11:30

  // Stays tab: nights shown, Check prices links, no "Use in budget"; the Stay budget line is Auto
  await page.goto('/trips/sample-jaipur/stays');
  await expect(page.getByText('Nights 1–3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Use in budget' })).toHaveCount(0);
  await page.getByRole('spinbutton', { name: 'Price per night for Haveli Alpha (fixture)' }).fill('4200');
  await page.getByRole('spinbutton', { name: 'Price per night for Haveli Alpha (fixture)' }).press('Enter');
  await page.goto('/trips/sample-jaipur/budget');
  const stayRow = page.getByRole('row', { name: /^Stay/ });
  await expect(stayRow).toContainText('Auto');
  await expect(stayRow).toContainText('₹12,600'); // 4,200 × 3 nights × 1 room
  await stayRow.getByText('How it’s worked out').click();
  await expect(stayRow).toContainText('Haveli Alpha (fixture) (your stay)');
  await stayRow.getByRole('button', { name: /Type my own stay figure/ }).click();
  await expect(stayRow.getByRole('spinbutton')).toHaveValue('12600');
  await stayRow.getByRole('button', { name: 'Back to auto' }).click();
  await expect(stayRow).toContainText('Auto');

  const stored = await page.evaluate(() => localStorage.getItem('trip-architect-v1') || '');
  expect(stored).toContain('ChIJTESThotelalpha00001');
  expect(stored).not.toContain('Haveli Alpha');
  expect(errors).toEqual([]);
});
