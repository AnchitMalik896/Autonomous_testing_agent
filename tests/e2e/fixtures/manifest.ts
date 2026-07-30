/**
 * Per-flow Reproducibility Manifest loader (§15). The manifest file sits next to the
 * specs it governs (<flow>.manifest.json). Suite-wide pins (browser, locale, TZ,
 * viewport) live in playwright.config.ts; the per-flow file carries seed, clock,
 * oracle map and proof references.
 */
import * as fs from 'fs';
import * as path from 'path';

export interface FlowManifest {
  specs?: string[];
  specHash?: string;
  seed: number;
  clock?: string; // ISO instant for page.clock.setFixedTime
  fixture?: { id: string; fingerprint: string };
  oracleMap?: Record<string, string>;
  sensitivityProofs?: Record<string, string>;
}

const DEFAULTS: FlowManifest = { seed: 1 };

export function loadManifest(testFilePath: string): FlowManifest {
  const dir = path.dirname(testFilePath);
  let m: FlowManifest = { ...DEFAULTS };
  try {
    const candidate = fs.readdirSync(dir).find((f) => f.endsWith('.manifest.json'));
    if (candidate) {
      m = { ...DEFAULTS, ...(JSON.parse(fs.readFileSync(path.join(dir, candidate), 'utf8')) as FlowManifest) };
    }
  } catch {
    /* no manifest → defaults */
  }
  // Determinism-gate clock phase re-runs @time cases at pinned boundary instants.
  if (process.env.E2E_CLOCK_OVERRIDE) m.clock = process.env.E2E_CLOCK_OVERRIDE;
  return m;
}
