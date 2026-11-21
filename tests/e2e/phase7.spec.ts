import { expect, test, type Page } from '@playwright/test';
import { mockApi } from './mockApi';

test.beforeEach(async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await page.clock.setFixedTime(new Date('2026-11-20T10:00:00'));
});

async function addExpense(page: Page, o: { note: string; amt: string; payer?: string; among?: string[] }) {
  await page.getByRole('button', { name: 'Add expense' }).click();
  const d = page.getByRole('dialog', { name: 'Add an expense' });
  await d.getByLabel('Description').fill(o.note);
  await d.getByLabel(/^Amount/).fill(o.amt);
  if (o.payer) await d.getByLabel('Payer').selectOption({ label: o.payer });
  if (o.among) for (const name of ['You', 'Riya', 'Traveller 3']) {
    const box = d.getByRole('checkbox', { name, exact: true });
    if (o.among.includes(name)) await box.check(); else await box.uncheck();
  }
  await d.getByRole('button', { name: 'Add expense' }).click();
}

test('expenses: create, change the payer, exact split, settle one share, un-settle, simplify', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await mockApi(page);
  // a third traveller, so simplifying has something to do
  await page.goto('/trips/sample-jaipur/overview');
  await page.getByRole('button', { name: 'Add traveller' }).click();
  await page.goto('/trips/sample-jaipur/expenses');

  await addExpense(page, { note: 'Dinner', amt: '1200' });
  const dinner = page.locator('.xrow', { has: page.getByRole('button', { name: 'Edit Dinner' }) });
  await expect(dinner).toContainText('₹1,200.00');
  await expect(dinner).toContainText('split equally between 3');

  // change the payer and switch to exact amounts (must add up to the paisa)
  await dinner.getByRole('button', { name: 'Edit Dinner' }).click();
  const d = page.getByRole('dialog', { name: 'Edit expense' });
  await d.getByLabel('Payer').selectOption({ label: 'Riya' });
  await d.getByRole('radio', { name: 'Exact amounts' }).click();
  await d.getByRole('checkbox', { name: 'Traveller 3', exact: true }).uncheck();
  await d.getByLabel('You amount').fill('700');
  await d.getByLabel('Riya amount').fill('499.99');
  await expect(d.getByRole('alert')).toContainText('0.01 left');
  await expect(d.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  await d.getByLabel('Riya amount').fill('500');
  await d.getByRole('button', { name: 'Save changes' }).click();
  await expect(dinner).toContainText('paid by Riya');
  await expect(dinner).toContainText('split by exact');
  await dinner.getByRole('button', { name: 'Edit history of Dinner' }).click();
  await expect(page.getByRole('dialog', { name: 'History of Dinner' })).toContainText('paid by You → Riya; split equal → exact');
  await page.getByRole('dialog', { name: 'History of Dinner' }).getByRole('button', { name: 'Close' }).click();

  // settle You's share, then un-settle it
  await dinner.getByRole('button', { name: 'Settle Dinner' }).click();
  const s = page.getByRole('dialog', { name: 'Settle Dinner' });
  await expect(s).toContainText('You · ₹700.00');
  await s.getByRole('button', { name: 'Mark settled' }).click();
  await expect(dinner).toContainText('✓ Settled');
  await expect(dinner).toContainText('via UPI');
  await expect(page.locator('.xrow', { hasText: 'You paid Riya ₹700.00' })).toBeVisible();
  await dinner.getByRole('button', { name: 'Settle Dinner' }).click();
  await page.getByRole('dialog', { name: 'Settle Dinner' }).getByRole('button', { name: 'Un-settle' }).click();
  await expect(dinner).not.toContainText('✓ Settled');

  // a taxi Riya paid for Traveller 3: pairs need three payments, simplified needs two
  await addExpense(page, { note: 'Taxi', amt: '300', payer: 'Riya', among: ['Riya', 'Traveller 3'] });
  await addExpense(page, { note: 'Tickets', amt: '900' });
  const settle = page.locator('.card', { hasText: 'Settle up' });
  const simplify = settle.getByRole('switch', { name: 'Simplify debts' });
  await expect(simplify).toBeChecked();
  const simplified = await settle.getByText(/ pays /).count();
  await simplify.uncheck();
  const pairs = await settle.getByText(/ pays /).count();
  expect(pairs).toBeGreaterThan(simplified);
  // balances always add up to zero: the drill-down shows the parts
  await page.locator('details.bal', { hasText: 'Traveller 3' }).locator('summary').click();
  await expect(page.locator('details.bal', { hasText: 'Traveller 3' })).toContainText('Taxi');

  // delete with Undo
  const tickets = page.getByRole('button', { name: 'Edit Tickets' });
  await page.getByRole('button', { name: 'Delete expense Tickets' }).click();
  await expect(tickets).toHaveCount(0);
  await expect(page.getByText('Recently deleted (1)')).toBeVisible();
  await page.locator('.toast').getByRole('button', { name: 'Undo' }).click();
  await expect(tickets).toHaveCount(1);
  expect(errors).toEqual([]);
});
