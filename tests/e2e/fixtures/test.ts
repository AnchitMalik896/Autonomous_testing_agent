/**
 * Extended `test` — every trust mechanism as a fixture (ultra_design.md §4.1):
 *   db          read-only DB oracle (worker-scoped pool)
 *   manifest    per-flow Reproducibility Manifest
 *   prng        seeded PRNG from the frozen manifest seed
 *   tier2       per-worker user + cached storageState (DB-4 Tier 2)
 *   tier3       per-test UUID-scoped user (DB-4 Tier 3)
 *   pinnedClock frozen frontend clock from the manifest (§9 gate 3)
 *
 * UI specs needing an authenticated session import `authedTest` (Tier 2) or create
 * state with `tier3`. The login flow's own specs NEVER use these shortcuts (DB-5).
 */
import { test as base, request, expect } from '@playwright/test';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { ReadOnlyDb, connectRO } from './db';
import { SeededPrng } from './prng';
import { adapter, Credentials } from './adapter';
import { FlowManifest, loadManifest } from './manifest';

export interface TestUser extends Credentials {
  id: string;
}
export interface WorkerUser extends TestUser {
  storageState: string; // path to cached session file
}

type TestFixtures = {
  db: ReadOnlyDb;
  manifest: FlowManifest;
  prng: SeededPrng;
  tier3: TestUser;
  pinnedClock: void;
};

type WorkerFixtures = {
  dbWorker: ReadOnlyDb;
  tier2: WorkerUser;
};

function password(tag: string): string {
  return `E2e!${tag}${randomUUID().slice(0, 8)}`;
}

export const test = base.extend<TestFixtures, WorkerFixtures>({
  dbWorker: [
    async ({}, use) => {
      const db = connectRO();
      await use(db);
      await db.end();
    },
    { scope: 'worker' },
  ],

  db: async ({ dbWorker }, use) => {
    await use(dbWorker);
  },

  manifest: async ({}, use, testInfo) => {
    await use(loadManifest(testInfo.file));
  },

  prng: async ({ manifest }, use) => {
    await use(new SeededPrng(manifest.seed));
  },

  // Tier 2: one user per worker per run, created via the real signup API, session
  // cached once. Fresh every run — nothing persisted across runs (DB-6).
  tier2: [
    async ({}, use, workerInfo) => {
      const runId = process.env.E2E_RUN_ID ?? 'run';
      const creds: Credentials = {
        email: `w${workerInfo.workerIndex}-${runId}@test.invalid`,
        password: password(`w${workerInfo.workerIndex}`),
      };
      const api = await request.newContext({ baseURL: process.env.BASE_URL });
      const { id } = await adapter.signup(api, creds);
      await adapter.login(api, creds);
      const authDir = path.resolve(__dirname, '..', 'state', '.auth');
      fs.mkdirSync(authDir, { recursive: true });
      const storageState = path.join(authDir, `w${workerInfo.workerIndex}-${runId}.json`);
      await api.storageState({ path: storageState });
      await api.dispose();
      await use({ ...creds, id, storageState });
    },
    { scope: 'worker' },
  ],

  // Tier 3: fresh UUID-scoped user per test; all assertions in mutating flows are
  // scoped to this user's rows (conservation oracles, order-independence).
  tier3: async ({}, use) => {
    const creds: Credentials = {
      email: `t-${randomUUID()}@test.invalid`,
      password: password('t'),
    };
    const api = await request.newContext({ baseURL: process.env.BASE_URL });
    const { id } = await adapter.signup(api, creds);
    await api.dispose();
    await use({ ...creds, id });
  },

  // Include in UI tests that touch time-relevant behavior (and tag them @time so the
  // determinism gate runs its clock matrix on them).
  pinnedClock: async ({ page, manifest }, use) => {
    if (manifest.clock) {
      await page.clock.setFixedTime(new Date(manifest.clock));
    }
    await use();
  },
});

/** Tier-2 authenticated variant: browser context starts from the worker's cached session. */
export const authedTest = test.extend({
  storageState: async ({ tier2 }, use) => {
    await use(tier2.storageState);
  },
});

export { expect };
