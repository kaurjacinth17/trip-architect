import { expect, test } from '@playwright/test';

// Guest mode must be untouched when Supabase isn't configured (the default build).
test('without Supabase keys there is no sign-in and the Together tab is hidden', async ({ page }) => {
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.fulfill({ status: 200, body: '' }));
  await page.goto('/trips/sample-jaipur/share');
  await expect(page.getByRole('button', { name: 'Sign in' })).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Trip sections' }).getByRole('link', { name: 'Together' })).toHaveCount(0);
  await page.goto('/join/abcdefghijklmnopqrstuvwxyz');
  await expect(page.getByRole('heading', { name: 'Accounts aren’t set up here' })).toBeVisible();
});

// Two people on a real Supabase project: invite → co-edit → comment → vote → poll winner becomes an item.
// Needs a deployed preview with Supabase configured and two test accounts; skipped otherwise.
test.describe('live collaboration (needs Supabase)', () => {
  test.skip(!process.env.E2E_SUPABASE, 'Set E2E_SUPABASE=1, E2E_BASE_URL and two test accounts to run this against a real project');
  test('invite, co-edit, comment, vote, poll', async () => {
    // Intentionally left for the live run; see NOTES.md (Phase 8).
  });
});
