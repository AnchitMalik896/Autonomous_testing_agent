/**
 * Determinism Gate runner (§9 / FR-T4). A spec earns admission by passing:
 *   1 repeat-stable      K identical back-to-back verdicts (workers=1)
 *   2 order-independent  identical verdict inside a shuffled full-suite order
 *   3 clock-pinned       @time-tagged cases re-run at boundary instants
 *   4 hermetic-stable    identical verdict in the pinned container (E2E_HERMETIC=1)
 *
 * Usage: node harness/gate.mjs flows/<flow>/<spec>.spec.ts [--repeat 3] [--seed 7]
 * Writes state/gate-reports/<spec>.json; exit 0 = ADMIT, 1 = QUARANTINE.
 */
import * as fs from 'fs';
import * as path from 'path';
import { spawnSync } from 'child_process';
import { ROOT, runPlaywright, verdictMap, verdictsIdentical, shuffled, writeJson } from './lib.mjs';

const args = process.argv.slice(2);
const spec = args.find((a) => !a.startsWith('--'));
if (!spec) {
  console.error('usage: node harness/gate.mjs <spec-path> [--repeat 3] [--seed 7]');
  process.exit(2);
}
function argNum(flag, dflt) {
  const i = args.indexOf(flag);
  const v = i >= 0 ? Number(args[i + 1]) : NaN;
  return Number.isFinite(v) ? v : dflt;
}
const K = argNum('--repeat', 3);
const SEED = argNum('--seed', 7);
const CLOCK_BOUNDARIES = ['2026-01-01T00:00:00.000Z', '2026-12-31T23:59:59.000Z'];

const report = { spec, phases: {}, verdict: null, at: new Date().toISOString() };
let reference = null;
let failed = false;

function phase(name, fn) {
  if (failed) { report.phases[name] = 'skipped (earlier phase failed)'; return; }
  try {
    report.phases[name] = fn();
  } catch (e) {
    if (process.env.GATE_DEBUG) console.error(e.stack);
    report.phases[name] = `FAIL: ${e.message}`;
    failed = true;
  }
  console.log(`[gate] ${name}: ${report.phases[name]}`);
}

// 1 — repeat-stable
phase('repeat-stable', () => {
  for (let i = 0; i < K; i++) {
    const { report: r } = runPlaywright([spec, '--workers=1']);
    const v = verdictMap(r);
    if (Object.keys(v).length === 0) throw new Error('no tests ran — check spec path');
    if (reference === null) reference = v;
    else if (!verdictsIdentical(reference, v)) throw new Error(`run ${i + 1}/${K} differs from run 1`);
  }
  if (Object.values(reference).some((s) => s === 'flaky')) {
    throw new Error('retry-pass observed — flaky, not admissible (FR-T7)');
  }
  return `pass (${K}/${K} identical)`;
});

// 2 — order-independent: run the whole flows tree in a shuffled file order, then
// require the target spec's verdicts to match phase 1 (hidden cross-test state check).
phase('order-independent', () => {
  const files = [];
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory() && e.name !== '_reference') walk(p);
      else if (e.name.endsWith('.spec.ts')) files.push(path.relative(ROOT, p));
    }
  };
  walk(path.join(ROOT, 'flows'));
  const order = shuffled(files, SEED);
  const { report: r } = runPlaywright([...order, '--workers=1']);
  const all = verdictMap(r);
  const mine = Object.fromEntries(Object.entries(all).filter(([t]) => t in reference));
  if (!verdictsIdentical(reference, mine)) throw new Error(`verdict changed under shuffled order (seed ${SEED})`);
  return `pass (shuffle seed ${SEED}, ${files.length} files)`;
});

// 3 — clock-pinned: only for @time-tagged cases in this spec.
phase('clock-pinned', () => {
  const src = fs.readFileSync(path.join(ROOT, spec), 'utf8');
  if (!/@time\b/.test(src)) return 'n/a (no @time cases)';
  for (const instant of CLOCK_BOUNDARIES) {
    const { report: r } = runPlaywright([spec, '--workers=1', '--grep', '@time'], { E2E_CLOCK_OVERRIDE: instant });
    const v = verdictMap(r);
    const ref = Object.fromEntries(Object.entries(reference).filter(([t]) => /@time\b/.test(t)));
    if (!verdictsIdentical(ref, v)) throw new Error(`verdict changed at pinned instant ${instant}`);
  }
  return `pass (${CLOCK_BOUNDARIES.length} boundary instants)`;
});

// 4 — hermetic-stable: inside the pinned Playwright container.
phase('hermetic-stable', () => {
  if (process.env.E2E_HERMETIC !== '1') {
    return 'waived (E2E_HERMETIC != 1) — recorded, not silently green';
  }
  const image = process.env.HERMETIC_IMAGE;
  if (!image) throw new Error('E2E_HERMETIC=1 but HERMETIC_IMAGE not set');
  const out = `state/.pw-hermetic.json`;
  const res = spawnSync('docker', [
    'run', '--rm', '--network', 'host',
    '-v', `${ROOT}:/suite`, '-w', '/suite',
    '-e', `BASE_URL=${process.env.BASE_URL ?? ''}`,
    '-e', `DB_URL_RO=${process.env.DB_URL_RO ?? ''}`,
    '-e', `PLAYWRIGHT_JSON_OUTPUT_NAME=${out}`,
    image, 'npx', 'playwright', 'test', spec, '--workers=1',
  ], { encoding: 'utf8' });
  if (res.error) throw new Error(`docker unavailable: ${res.error.message}`);
  const r = JSON.parse(fs.readFileSync(path.join(ROOT, out), 'utf8'));
  fs.unlinkSync(path.join(ROOT, out));
  if (!verdictsIdentical(reference, verdictMap(r))) throw new Error('verdict differs inside hermetic container');
  return 'pass';
});

report.verdict = failed ? 'QUARANTINE' : 'ADMIT';
const reportPath = path.join(ROOT, 'state', 'gate-reports', `${path.basename(spec, '.spec.ts')}.json`);
writeJson(reportPath, report);
console.log(`[gate] ${report.verdict} — report: ${path.relative(ROOT, reportPath)}`);
process.exit(failed ? 1 : 0);
