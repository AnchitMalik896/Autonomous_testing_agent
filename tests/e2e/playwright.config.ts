import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Reproducibility Manifest, materialized (ultra_updated.md §15 / RS-6).
// Pinned values here apply suite-wide; per-flow manifests may override seed/clock only.
export default defineConfig({
  testDir: './flows',
  // _reference: template specs, never executed. *.sp-*: sensitivity mutants (harness cleans up).
  testIgnore: ['**/_reference/**'],
  globalSetup: require.resolve('./global-setup'),
  timeout: 30_000,
  expect: { timeout: 5_000 },
  // Retries are allowed for DIAGNOSIS ONLY: a retry-pass is reported `flaky`, never
  // `pass` (FR-T7). The handback harness enforces this from the JSON report.
  retries: 1,
  workers: process.env.E2E_WORKERS ? Number(process.env.E2E_WORKERS) : 4,
  reporter: [
    ['list'],
    ['json', { outputFile: process.env.PLAYWRIGHT_JSON_OUTPUT_NAME ?? 'results.json' }],
  ],
  use: {
    baseURL: process.env.BASE_URL,
    locale: 'en-US',
    timezoneId: 'UTC',
    viewport: { width: 1280, height: 720 },
    trace: 'retain-on-failure',
    testIdAttribute: 'data-testid',
    // Explicit-state synchronization only; arbitrary waits are banned (lint:bans).
    actionTimeout: 10_000,
    navigationTimeout: 15_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
