/**
 * Shared harness library: run Playwright, normalize verdicts, hash state.
 * Design-time tooling only — never on the runtime verdict path (FR-T12).
 */
import { spawnSync } from 'child_process';
import { createHash, randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export function stableStringify(v) {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
  }
  return JSON.stringify(v);
}

export function sha256(s) {
  return `sha256:${createHash('sha256').update(s).digest('hex')}`;
}

export function readJson(p, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return fallback;
  }
}

export function writeJson(p, obj) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + '\n');
}

/**
 * Run `npx playwright test <args>`; returns { exitCode, report } where report is the
 * parsed JSON reporter output (written to a temp file so parallel harness invocations
 * never clobber results.json).
 */
export function runPlaywright(args, extraEnv = {}) {
  const out = path.join(ROOT, 'state', `.pw-${randomUUID().slice(0, 8)}.json`);
  const res = spawnSync('npx', ['playwright', 'test', ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv, PLAYWRIGHT_JSON_OUTPUT_NAME: out },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const report = readJson(out);
  try { fs.unlinkSync(out); } catch { /* already gone */ }
  return { exitCode: res.status ?? 1, stdout: res.stdout ?? '', stderr: res.stderr ?? '', report };
}

/** Parse @key:value tags out of a test title chain. */
export function parseTags(title) {
  const tags = {};
  for (const m of title.matchAll(/@(\w+):([\w.\-*]+)/g)) tags[m[1]] = m[2];
  if (/@time\b/.test(title)) tags.time = 'true';
  return tags;
}

/**
 * Normalize a Playwright JSON report into flat entries:
 * { fullTitle, file, status: expected|unexpected|flaky|skipped, error, tags }
 * `flaky` = passed only on retry — never counted as pass (FR-T7).
 */
export function normalizeVerdicts(report) {
  const entries = [];
  if (!report || !report.suites) return entries;
  const walk = (suite, chain) => {
    const title = suite.title ? [...chain, suite.title] : chain;
    for (const spec of suite.specs ?? []) {
      for (const t of spec.tests ?? []) {
        const fullTitle = [...title, spec.title].join(' > ');
        const rawError = t.results?.find((r) => r.error)?.error?.message ?? null;
        let error = null;
        if (rawError) {
          // eslint-disable-next-line no-control-regex
          const clean = rawError.replace(/\u001b?\[[0-9;]*m/g, '');
          // keep the assertion line plus Expected/Received value lines, drop stack/paths
          error = clean
            .split('\n')
            .map((l) => l.trim())
            .filter((l) => l && !l.startsWith('at ') && !l.includes('/'))
            .slice(0, 4)
            .join(' | ')
            .slice(0, 300);
        }
        entries.push({
          fullTitle,
          file: spec.file ?? suite.file ?? '',
          status: t.status, // expected | unexpected | flaky | skipped
          error,
          tags: parseTags(fullTitle),
        });
      }
    }
    for (const child of suite.suites ?? []) walk(child, title);
  };
  for (const s of report.suites) walk(s, []);
  return entries;
}

/** Verdict map keyed by full title — the unit compared across gate phases. */
export function verdictMap(report) {
  const m = {};
  for (const e of normalizeVerdicts(report)) m[e.fullTitle] = e.status;
  return m;
}

export function verdictsIdentical(a, b) {
  return stableStringify(a) === stableStringify(b);
}

/** Deterministic Fisher-Yates using mulberry32 (same generator as fixtures/prng.ts). */
export function shuffled(arr, seed) {
  let s = seed >>> 0;
  const rnd = () => {
    let t = (s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function gitShort(cwd = ROOT) {
  const r = spawnSync('git', ['rev-parse', '--short', 'HEAD'], { cwd, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
}
