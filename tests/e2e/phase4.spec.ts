import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mockApi';

test.use({ viewport: { width: 1360, height: 1600 } });
test.beforeEach(async ({ page }) => {
  // Freeze "today" so the sample trip's dates (and weekdays) are always the same
  await page.clock.setFixedTime(new Date('2026-11-20T10:00:00'));
  await page.route(/fonts\.(googleapis|gstatic)\.com|tile\.openstreetmap\.org/, (r) => r.fulfill({ status: 200, body: '' }));
});
const titles = (page: Page) => page.locator('.tl .blk .bt').allTextContents();
const clean = (s: string) => s.replace('🔒 ', '').trim();

test('Add bar: search “stepwell”, insert between two blocks, lock it; Tidy leaves its time alone', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 2/ }).click();
  const before = (await titles(page)).map(clean);
  await page.getByRole('toolbar', { name: 'Add to Day 2' }).getByRole('button', { name: 'Search places' }).click();
  const pos = page.getByRole('combobox', { name: 'Insert position' });
  const opts = await pos.locator('option').allTextContents();
  await pos.selectOption({ label: opts.find((o) => o.startsWith('after ' + before[0]))! });
  await page.getByRole('searchbox', { name: /Search places in Jaipur/ }).fill('stepwell');
  await page.getByRole('button', { name: 'Add Toorji Ka Jhalra stepwell' }).click();
  await expect(page.locator('.toast')).toContainText('Toorji Ka Jhalra stepwell added to Day 2');
  const after = (await titles(page)).map(clean);
  expect(after[0]).toBe(before[0]);
  expect(after[1]).toBe('Toorji Ka Jhalra stepwell');
  // Make a gap, lock the stepwell, then Tidy
  const blk = page.locator('.blk', { hasText: 'Toorji Ka Jhalra stepwell' });
  await blk.getByRole('button', { name: /Lock Toorji/ }).click();
  await expect(blk.locator('.lockic')).toBeVisible();
  const time = await page.locator('.slot', { hasText: 'Toorji Ka Jhalra stepwell' }).locator('.time').innerText();
  await page.getByRole('button', { name: 'Tidy times' }).click();
  await expect(page.locator('.toast')).toContainText('Times tidied');
  expect(await page.locator('.slot', { hasText: 'Toorji Ka Jhalra stepwell' }).locator('.time').innerText()).toBe(time);
  await expect(blk.getByRole('button', { name: /Move Toorji.* up/ })).toBeDisabled();
});

test('delete Day 2 → its activities are in the wishlist; drag Day 4 above Day 3', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 2/ }).click();
  const acts = (await titles(page)).map(clean).filter((x) => !['Lunch', 'Head to the station or airport', 'Arrive and check in'].includes(x));
  await page.locator('.dayopts > summary').click();
  await page.getByRole('button', { name: 'Delete this day' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Delete day' }).click();
  await expect(page.locator('.dayb')).toHaveCount(3);
  await page.getByRole('tab', { name: /Wishlist/ }).click();
  for (const a of acts) await expect(page.locator('.lib .li', { hasText: a }).first()).toBeVisible();
  // Now 3 days: add one so there are 4, then drag Day 4 above Day 3
  await page.getByRole('button', { name: 'Add a day' }).click();
  await expect(page.locator('.dayb')).toHaveCount(4);
  const label3 = await page.locator('.dayb').nth(2).locator('.lbl').innerText();
  const grip = page.locator('.dgrip').nth(3);
  const g = (await grip.boundingBox())!, d3 = (await page.locator('.dayb').nth(2).boundingBox())!;
  await page.mouse.move(g.x + 5, g.y + 5);
  await page.mouse.down();
  await page.mouse.move(g.x + 5, g.y - 10, { steps: 4 });
  await page.mouse.move(d3.x + 60, d3.y + 20, { steps: 15 });
  await page.mouse.up();
  await expect(page.locator('.toast')).toContainText('Day 4 moved to position 3');
  await expect(page.locator('.dayb').nth(3).locator('.lbl')).toContainText(label3.split(' · ').pop()!);
});

test('bulk: ctrl-click two blocks, shift them 30 minutes later, then send to the wishlist', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 2/ }).click();
  const blocks = page.locator('.tl .blk');
  const t0 = await page.locator('.slot').nth(1).locator('.time').innerText();
  await blocks.nth(1).locator('.bm').first().click({ modifiers: ['Control'] });
  await blocks.nth(2).locator('.bm').first().click({ modifiers: ['Control'] });
  await expect(page.getByRole('region', { name: 'Bulk actions' })).toContainText('2 selected');
  await page.getByRole('button', { name: 'Shift selected 30 minutes later' }).click();
  await expect(page.locator('.toast')).toContainText('Shifted 2 blocks');
  expect(await page.locator('.slot').nth(1).locator('.time').innerText()).not.toBe(t0);
  const name = clean(await blocks.nth(1).locator('.bt').innerText());
  await page.getByRole('region', { name: 'Bulk actions' }).getByRole('button', { name: 'To wishlist' }).click();
  expect((await titles(page)).map(clean)).not.toContain(name);
});

test('opening-hours check for a place from OpenStreetMap', async ({ page }) => {
  await mockApi(page);
  await page.goto('/trips/sample-jaipur/itinerary');
  await page.getByRole('button', { name: /^Day 4/ }).click(); // Mon 14 Dec: fixture places are closed on Mondays
  await page.getByRole('toolbar', { name: 'Add to Day 4' }).getByRole('button', { name: 'Search places' }).click();
  await page.getByRole('searchbox', { name: /Search places in Jaipur/ }).fill('stepwell');
  await page.getByRole('button', { name: 'Add Toorji Ka Jhalra stepwell' }).click();
  await page.getByRole('tab', { name: /Checks/ }).click();
  await expect(page.getByText('Toorji Ka Jhalra stepwell is closed on Mondays')).toBeVisible();
  await expect(page.getByLabel('Live travel times')).toHaveCount(0); // needed Google Routes; removed
});
