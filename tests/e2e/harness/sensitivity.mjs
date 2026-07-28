/**
 * Sensitivity / "test the test" runner (§8 / FR-T3). For each planted fault in a
 * brain-authored fault plan, mutate a COPY of the spec (never the app, never the
 * original spec), run just that test, and REQUIRE red. Green against a planted
 * fault = vacuous assertion = rejected.
 *
 * Fault plan (state/fault-plans/<flow>.json):
 * [{ "id": "F-A1-1", "spec": "flows/login/login.spec.ts", "grep": "@case:login.happy",
 *    "find": "toBe(1)", "replace": "toBe(2)",
 *    "case": "login.happy", "assertion": "A1" }]
 *
 * Usage: node harness/sensitivity.mjs state/fault-plans/<flow>.json
 * Exit 0 = all proven; 1 = at least one vacuous (details in case-model + stdout).
 */
import * as fs from 'fs';
import * as path from 'path';
import { ROOT, runPlaywright, normalizeVerdicts, readJson, writeJson } from './lib.mjs';

const planPath = process.argv[2];
if (!planPath) {
  console.error('usage: node harness/sensitivity.mjs <fault-plan.json>');
  process.exit(2);
}
const plan = readJson(path.resolve(ROOT, planPath));
if (!Array.isArray(plan) || plan.length === 0) {
  console.error(`empty or unreadable fault plan: ${planPath}`);
  process.exit(2);
}

// Sweep stray mutants from a previously killed run.
const sweep = (dir) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) sweep(p);
    else if (/\.sp-[\w-]+\.spec\.ts$/.test(e.name)) fs.unlinkSync(p);
  }
};
sweep(path.join(ROOT, 'flows'));

const results = [];
let vacuous = 0;

for (const fault of plan) {
  const specPath = path.join(ROOT, fault.spec);
  const src = fs.readFileSync(specPath, 'utf8');
  const occurrences = src.split(fault.find).length - 1;
  if (occurrences !== 1) {
    results.push({ ...fault, outcome: `ERROR: find-string matched ${occurrences}x (need exactly 1)` });
    vacuous++;
    continue;
  }
  const mutantPath = specPath.replace(/\.spec\.ts$/, `.sp-${fault.id}.spec.ts`);
  fs.writeFileSync(mutantPath, src.replace(fault.find, fault.replace));
  try {
    const args = [path.relative(ROOT, mutantPath), '--workers=1'];
    if (fault.grep) args.push('--grep', fault.grep);
    const { report } = runPlaywright(args);
    const entries = normalizeVerdicts(report);
    if (entries.length === 0) {
      results.push({ ...fault, outcome: 'ERROR: no tests matched grep' });
      vacuous++;
    } else if (entries.some((e) => e.status === 'unexpected')) {
      results.push({ ...fault, outcome: 'proven' }); // went red against the planted fault
    } else {
      results.push({ ...fault, outcome: 'VACUOUS: stayed green against planted fault — assertion rejected' });
      vacuous++;
    }
  } finally {
    fs.unlinkSync(mutantPath);
  }
  console.log(`[sensitivity] ${fault.id} (${fault.case}/${fault.assertion}): ${results.at(-1).outcome}`);
}

// Merge proofs into the Case Model ledger.
const cmPath = path.join(ROOT, 'state', 'case-model.json');
const cm = readJson(cmPath, { cases: [], residual: [] });
for (const r of results) {
  const c = cm.cases.find((x) => x.id === r.case);
  if (!c) continue;
  const a = (c.assertions ?? []).find((x) => x.id === r.assertion);
  if (a) {
    a.sensitivity = r.outcome === 'proven'
      ? { status: 'proven', fault: r.id, faultDesc: `${r.find} -> ${r.replace}; went red` }
      : { status: 'rejected-vacuous', fault: r.id };
  }
  if (r.outcome !== 'proven') c.status = 'rejected-vacuous';
}
writeJson(cmPath, cm);

console.log(`[sensitivity] ${results.length - vacuous}/${results.length} proven, ${vacuous} rejected/errored`);
process.exit(vacuous > 0 ? 1 : 0);
