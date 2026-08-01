/**
 * The drift gate (ultra_design.md §4.2). Runs before every suite invocation.
 * Any mismatch aborts the whole run with ONE loud verdict — "environment drift" —
 * instead of N misleading test failures (FR-T11, DB-3, NFR-T4).
 */
import { request, FullConfig } from '@playwright/test';
import { Client } from 'pg';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

export class EnvironmentDriftError extends Error {
  constructor(what: string) {
    super(`environment drift: ${what}`);
    this.name = 'EnvironmentDriftError';
  }
}

/** Deterministic JSON: object keys sorted at every depth. */
export function stableStringify(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    const o = v as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function sha256(s: string): string {
  return `sha256:${crypto.createHash('sha256').update(s).digest('hex')}`;
}

interface FingerprintFile {
  fixtureId: string;
  queries: { name: string; sql: string; expectedHash: string }[];
}

async function globalSetup(_config: FullConfig): Promise<void> {
  const fail = (what: string): never => {
    throw new EnvironmentDriftError(what);
  };

  // One run id shared by all workers (tier-2 user emails depend on it, DB-6).
  if (!process.env.E2E_RUN_ID) {
    process.env.E2E_RUN_ID = crypto.randomUUID().slice(0, 8);
  }

  // 1. App reachable.
  if (!process.env.BASE_URL) fail('BASE_URL not set (copy .env.example to .env)');
  const api = await request.newContext();
  try {
    const res = await api.get(process.env.BASE_URL!, { timeout: 10_000 });
    if (res.status() >= 500) fail(`app at BASE_URL answered ${res.status()}`);
  } catch (e) {
    if (e instanceof EnvironmentDriftError) throw e;
    fail(`app not reachable at ${process.env.BASE_URL}`);
  } finally {
    await api.dispose();
  }

  // 2. Read-only DB reachable + seed fingerprint (environment-owned seeding, DB-3).
  if (!process.env.DB_URL_RO) fail('DB_URL_RO not set');
  const db = new Client({ connectionString: process.env.DB_URL_RO });
  try {
    await db.connect();
  } catch {
    fail('read-only DB not reachable via DB_URL_RO');
  }
  try {
    const fpPath = path.resolve(__dirname, 'state', 'fingerprint.json');
    if (fs.existsSync(fpPath)) {
      const fp: FingerprintFile = JSON.parse(fs.readFileSync(fpPath, 'utf8'));
      for (const q of fp.queries) {
        const rows = (await db.query(q.sql)).rows;
        const actual = sha256(stableStringify(rows));
        if (actual !== q.expectedHash) {
          fail(`seed fingerprint mismatch (${q.name}) — reseed the environment (fixture ${fp.fixtureId})`);
        }
      }
    } else {
      // First session: prd-map/impl-audit registers the fingerprint later.
      console.warn('[e2e] no seed fingerprint registered yet (state/fingerprint.json) — drift check skipped');
    }
  } finally {
    await db.end();
  }

  // 3. External fakes reachable, if any are pinned.
  if (process.env.FAKES_URL) {
    const fakes = await request.newContext();
    try {
      const res = await fakes.get(process.env.FAKES_URL, { timeout: 5_000 });
      if (!res.ok()) fail(`external-fake server at FAKES_URL answered ${res.status()}`);
    } catch (e) {
      if (e instanceof EnvironmentDriftError) throw e;
      fail('external-fake server not reachable at FAKES_URL');
    } finally {
      await fakes.dispose();
    }
  }
}

export default globalSetup;
