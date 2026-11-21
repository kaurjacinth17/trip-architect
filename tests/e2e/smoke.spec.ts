import { expect, test, type Page } from '@playwright/test';

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=', 'base64');
const SAMPLE = '/trips/sample-jaipur';

const ROUTES = [
  '/', '/explore', '/explore?mood=beach', '/destinations/jaipur', '/destinations/goa', '/destinations/jaipur/guide', '/destinations/jaipur/guide?tab=areas', '/compare', '/new', '/new?dest=udaipur', '/trips',
  ...['overview', 'itinerary', 'map', 'budget', 'expenses', 'stays', 'packing', 'share', 'print'].map((t) => `${SAMPLE}/${t}`),
  '/shared', '/about', '/terms', '/privacy', '/no-such-page',
];

/** Serve blank tiles and fonts locally so the test needs no network and stays deterministic. */
async function offline(page: Page) {
  await page.route(/tile\.openstreetmap\.org|\{s\}|\/\d+\/\d+\/\d+\.png/, (r) => r.fulfill({ status: 200, contentType: 'image/png', body: PNG }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
}

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  return errors;
}

for (const width of [1360, 390]) {
  test.describe(`at ${width}px`, () => {
    test.use({ viewport: { width, height: 900 } });
    for (const route of ROUTES) {
      test(`${route} renders without errors or horizontal overflow`, async ({ page }) => {
        await offline(page);
        const errors = watchErrors(page);
        await page.goto(route);
        await expect(page.locator('main h1, main h2').first()).toBeVisible();
        await page.waitForTimeout(300);
        const [sw, iw] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
        expect(sw).toBeLessThanOrEqual(iw);
        // body has overflow-x:clip (from the reference), which hides overflow from scrollWidth; check elements too.
        const poking = await page.evaluate(() => [...document.querySelectorAll('main *, footer *')]
          .filter((e) => !e.closest('.scroll,.tabs,.rail,.leaflet-container,.vh,.skip,svg'))
          .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > window.innerWidth + 1; })
          .map((e) => `${e.tagName}.${e.getAttribute('class')}`));
        expect(poking).toEqual([]);
        expect(errors).toEqual([]);
      });
    }
  });
}

/** Times on Day N's timeline, top to bottom. */
const titles = (page: Page) => page.locator('.tl .blk .bt').allTextContents();

test.describe('itinerary drag and drop', () => {
  // Tall enough that the whole day, the rail and the side panel are on screen while dragging.
  test.use({ viewport: { width: 1360, height: 1800 } });

  test('mouse: reorder within a day, move to another day, drag from the library', async ({ page }) => {
    await offline(page);
    const errors = watchErrors(page);
    await page.goto(`${SAMPLE}/itinerary`);
    await page.locator('.dayb').nth(1).click(); // Day 2
    const before = await titles(page);
    expect(before.length).toBeGreaterThanOrEqual(3);

    // Drag the last block above the first one.
    const last = page.locator('.tl .blk').last();
    const first = page.locator('.tl .blk').first();
    const lb = (await last.boundingBox())!, fb = (await first.boundingBox())!;
    await page.mouse.move(lb.x + 40, lb.y + 20);
    await page.mouse.down();
    await page.mouse.move(lb.x + 40, lb.y + 5, { steps: 4 });
    await page.mouse.move(fb.x + 40, fb.y + 6, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(120); // dnd-kit ignores clicks for 50 ms after a drop
    const after = await titles(page);
    expect(after[0]).toBe(before[before.length - 1]);

    // Drag the first block onto Day 4 in the rail.
    const moved = after[0];
    const blk = page.locator('.tl .blk').first();
    const bb = (await blk.boundingBox())!;
    const day4 = (await page.locator('.dayb').nth(3).boundingBox())!;
    await page.mouse.move(bb.x + 40, bb.y + 20);
    await page.mouse.down();
    await page.mouse.move(bb.x + 30, bb.y + 30, { steps: 4 });
    await page.mouse.move(day4.x + 60, day4.y + 30, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(120); // dnd-kit ignores clicks for 50 ms after a drop
    await expect(page.locator('.toast')).toContainText('Moved to Day 4');
    expect(await titles(page)).not.toContain(moved);
    await page.locator('.dayb').nth(3).click();
    expect(await titles(page)).toContain(moved);

    // Drag a place from the library onto the timeline.
    await page.getByRole('tab', { name: 'Places' }).click();
    const lib = page.locator('.li[data-drag="lib"]').first();
    const name = (await lib.locator('.nm').textContent())!.replace('Planned', '').trim();
    const li = (await lib.boundingBox())!;
    const tl = (await page.locator('.tl').boundingBox())!;
    await page.mouse.move(li.x + 30, li.y + 20);
    await page.mouse.down();
    await page.mouse.move(li.x + 20, li.y + 30, { steps: 4 });
    await page.mouse.move(tl.x + 200, tl.y + tl.height - 10, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(120); // dnd-kit ignores clicks for 50 ms after a drop
    expect(await titles(page)).toContain(name);

    // Drop a block onto the wishlist tab (short Checks panel open, so the sticky panel has room to stay in view).
    await page.getByRole('tab', { name: /Checks/ }).click();
    const wishBefore = await page.getByRole('tab', { name: /Wishlist/ }).textContent();
    await page.locator('.tl .blk').last().evaluate((e) => e.scrollIntoView({ block: 'center' })); // clear of the toast
    const b2 = (await page.locator('.tl .blk').last().boundingBox())!;
    const wt = (await page.getByRole('tab', { name: /Wishlist/ }).boundingBox())!;
    await page.mouse.move(b2.x + 40, b2.y + 20);
    await page.mouse.down();
    await page.mouse.move(b2.x + 50, b2.y + 10, { steps: 4 });
    await page.mouse.move(wt.x + 30, wt.y + 15, { steps: 15 });
    await page.mouse.up();
    await page.waitForTimeout(120); // dnd-kit ignores clicks for 50 ms after a drop
    await expect(page.locator('.toast')).toContainText('Moved to wishlist');
    expect(await page.getByRole('tab', { name: /Wishlist/ }).textContent()).not.toBe(wishBefore);

    // Undo puts it back.
    await page.keyboard.press('Control+z');
    expect(await page.getByRole('tab', { name: /Wishlist/ }).textContent()).toBe(wishBefore);
    expect(errors).toEqual([]);
  });

  test('keyboard path: the ↓ button reorders', async ({ page }) => {
    await offline(page);
    await page.goto(`${SAMPLE}/itinerary`);
    await page.locator('.dayb').nth(1).click();
    const before = await titles(page);
    await page.getByRole('button', { name: `Move ${before[0]} down` }).click();
    const after = await titles(page);
    expect(after[0]).toBe(before[1]);
    expect(after[1]).toBe(before[0]);
  });
});

test.describe('touch drag and drop', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });

  test('press-and-hold then drag reorders blocks', async ({ page }) => {
    await offline(page);
    const errors = watchErrors(page);
    await page.goto(`${SAMPLE}/itinerary`);
    await page.locator('.dayb').nth(1).click();
    const before = await titles(page);
    const second = page.locator('.tl .blk').nth(1);
    const first = page.locator('.tl .blk').first();
    await first.evaluate((e) => e.scrollIntoView({ block: 'start' }));
    await page.evaluate(() => window.scrollBy(0, -120));
    const sb = (await second.boundingBox())!, fb = (await first.boundingBox())!;
    const cdp = await page.context().newCDPSession(page);
    const pt = (x: number, y: number) => [{ x, y, id: 1, radiusX: 2, radiusY: 2, force: 1 }];
    const x = sb.x + 60, y0 = sb.y + 20;
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(x, y0) });
    await page.waitForTimeout(400); // press and hold past the 220 ms activation delay
    const y1 = fb.y + 5;
    for (let i = 1; i <= 12; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(x, y0 + ((y1 - y0) * i) / 12) });
      await page.waitForTimeout(16);
    }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await page.waitForTimeout(200);
    const after = await titles(page);
    expect(after[0]).toBe(before[1]);
    expect(errors).toEqual([]);
  });
});

test('share link round trip opens a read-only copy that can be saved', async ({ page, context }) => {
  await offline(page);
  await page.goto(`${SAMPLE}/share`);
  await page.getByRole('button', { name: 'Create share link' }).click();
  const link = await page.locator('#sharelink').inputValue();
  expect(link).toContain('/shared#');
  const other = await context.newPage();
  await offline(other);
  await other.goto(link.replace(/^https?:\/\/[^/]+/, ''));
  await expect(other.getByRole('heading', { level: 1 })).toHaveText('Jaipur getaway');
  await other.getByRole('button', { name: 'Save a copy to my trips' }).click();
  await expect(other).toHaveURL(/\/trips\/[^/]+\/overview$/);
});

test('wizard builds a two-stop trip and persists it after an edit', async ({ page }) => {
  await offline(page);
  await page.goto('/new');
  await page.getByRole('button', { name: /^Jaipur/ }).click();
  await page.getByRole('button', { name: /^Udaipur/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Start date').fill('2026-12-16');
  await expect(page.getByText('Recommended for this route: 6–8 days.')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Trip name').fill('Rajasthan loop');
  await page.getByRole('button', { name: 'Create my trip' }).click();
  await expect(page).toHaveURL(/\/trips\/[^/]+\/itinerary$/);
  await page.getByRole('button', { name: /^Day 4/ }).click();
  await expect(page.locator('.tl .bt').first()).toHaveText('Travel to Udaipur');
  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Rajasthan loop');
});
