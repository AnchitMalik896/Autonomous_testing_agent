/**
 * REFERENCE SPEC — excluded from runs (testIgnore: **∕_reference∕**).
 * This is the shape spec-author freezes for every flow (ultra_design.md §4.3):
 *   - tags in titles carry provenance into the JSON report: @flow: @case: @oracle: (@time)
 *   - locator ladder L1→L3 only (RS-8); lint:bans rejects structural selectors
 *   - login flow drives the REAL login UI — no storageState shortcut here (DB-5)
 *   - DB assertions scoped to the test's own user (Tier 3), via the read-only oracle
 */
import { test, expect } from '../../fixtures/test';
import { variantTable } from '../../fixtures/prng';

// Frozen variant table: regenerated identically from the manifest seed every run.
const badPasswords = variantTable(424242, 25, (r, i) => ({
  label: `bad-pw-${i}`,
  value: r.string(r.int(1, 64)),
}));

test.describe('login @flow:login', () => {
  test('valid credentials reach the dashboard @case:login.happy @oracle:O1', async ({ page, tier3 }) => {
    await page.goto('/login');
    await page.getByLabel('Email').fill(tier3.email); // L2 locator
    await page.getByLabel('Password').fill(tier3.password);
    await page.getByRole('button', { name: 'Log in' }).click(); // L1 locator
    // O1: expected value derived from the PRD acceptance criterion, not observation.
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
  });

  test('login creates exactly one session row @case:login.session-row @oracle:O2', async ({ page, tier3, db }) => {
    const before = await db.one<{ c: string }>(
      'SELECT count(*) c FROM sessions WHERE user_id = $1', [tier3.id]);
    await page.goto('/login');
    await page.getByLabel('Email').fill(tier3.email);
    await page.getByLabel('Password').fill(tier3.password);
    await page.getByRole('button', { name: 'Log in' }).click();
    await expect(page.getByRole('heading', { name: 'Dashboard' })).toBeVisible();
    const after = await db.one<{ c: string }>(
      'SELECT count(*) c FROM sessions WHERE user_id = $1', [tier3.id]);
    // O2 conservation, scoped to MY user — expressible regardless of other tests/workers.
    expect(Number(after.c) - Number(before.c)).toBe(1);
  });

  for (const v of badPasswords) {
    test(`wrong password is rejected gracefully (${v.label}) @case:login.bad-password @oracle:O3`, async ({ page, tier3 }) => {
      await page.goto('/login');
      await page.getByLabel('Email').fill(tier3.email);
      await page.getByLabel('Password').fill(v.value);
      await page.getByRole('button', { name: 'Log in' }).click();
      // O3 invariants: no crash page, a visible rejection, still on /login.
      await expect(page.getByRole('alert')).toBeVisible();
      await expect(page).toHaveURL(/\/login/);
    });
  }
});
