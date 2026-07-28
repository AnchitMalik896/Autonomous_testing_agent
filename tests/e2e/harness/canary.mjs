/**
 * Suite self-test / canary runner (§13 / FR-T9). Injects each known fault into a
 * THROWAWAY git worktree of the app (never the working tree — NFR-T5), boots the
 * sandbox stack, runs the mapped specs, and requires the suite to catch it (go red).
 * An escaped canary means the SUITE is broken: exit 1 blocks the green.
 *
 * canaries/canaries.json:
 * { "bootCommand": "docker compose -f docker-compose.e2e.yml up -d --wait",
 *   "teardownCommand": "docker compose -f docker-compose.e2e.yml down -v",
 *   "sandboxBaseUrl": "http://localhost:3999",
 *   "canaries": [{ "id": "C-001", "patch": "canaries/C-001-drop-authz.patch",
 *                  "mustBeCaughtBy": "flows/cart" }] }
 *
 * Usage: node harness/canary.mjs [--only C-001]
 */
import * as path from 'path';
import * as fs from 'fs';
import * as os from 'os';
import { spawnSync } from 'child_process';
import { ROOT, readJson, writeJson, runPlaywright, normalizeVerdicts } from './lib.mjs';

const cfg = readJson(path.join(ROOT, 'canaries', 'canaries.json'));
if (!cfg || !Array.isArray(cfg.canaries) || cfg.canaries.length === 0) {
  console.log('[canary] no canary corpus yet (canaries/canaries.json empty) — nothing to verify');
  process.exit(0);
}
const appRepo = process.env.APP_REPO && path.resolve(ROOT, process.env.APP_REPO);
if (!appRepo || !fs.existsSync(path.join(appRepo, '.git'))) {
  console.error('[canary] APP_REPO must point at the app git repo (see .env.example)');
  process.exit(2);
}
const only = process.argv.includes('--only') ? process.argv[process.argv.indexOf('--only') + 1] : null;

const sh = (cmd, cwd) => {
  const r = spawnSync('bash', ['-c', cmd], { cwd, encoding: 'utf8', stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`command failed (${r.status}): ${cmd}`);
};

const results = [];
let escaped = 0;

for (const c of cfg.canaries) {
  if (only && c.id !== only) continue;
  const wt = fs.mkdtempSync(path.join(os.tmpdir(), `canary-${c.id}-`));
  console.log(`[canary] ${c.id}: worktree ${wt}`);
  try {
    sh(`git worktree add --detach "${wt}" HEAD`, appRepo);
    sh(`git apply "${path.resolve(ROOT, c.patch)}"`, wt);
    if (cfg.bootCommand) sh(cfg.bootCommand, wt);
    try {
      const { report } = runPlaywright([c.mustBeCaughtBy, '--workers=1'], {
        BASE_URL: cfg.sandboxBaseUrl ?? process.env.BASE_URL,
      });
      const caught = normalizeVerdicts(report).some((e) => e.status === 'unexpected');
      results.push({ id: c.id, caught });
      if (!caught) {
        escaped++;
        console.error(`[canary] ESCAPED: ${c.id} — the suite no longer detects this known fault. Green is BLOCKED.`);
      } else {
        console.log(`[canary] caught: ${c.id}`);
      }
    } finally {
      if (cfg.teardownCommand) sh(cfg.teardownCommand, wt);
    }
  } finally {
    spawnSync('git', ['worktree', 'remove', '--force', wt], { cwd: appRepo });
  }
}

writeJson(path.join(ROOT, 'state', 'canary-report.json'), { at: new Date().toISOString(), results });
process.exit(escaped > 0 ? 1 : 0);
