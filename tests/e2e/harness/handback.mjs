/**
 * Handback formatter (§6, §7 of ultra_design.md) — renders THE one pasteable block.
 *   - retry-pass ⇒ `flaky`, never pass (FR-T7); flap counting feeds quarantine
 *   - dedup: failures grouped by (flow, normalized error signature) (HB-5)
 *   - bisect: newly-failing vs baseline.json ⇒ "first failing at <commit>" (FR-T13)
 *   - merges MISSING + UNTESTABLE entries queued by skills in state/pending-entries.json
 *   - symptom-only: nothing here ever names an app file (FR-U8)
 *
 * Usage: node harness/handback.mjs [--results results.json] [--turn N]
 * Prints the block to stdout; saves state/last-handback.md; updates baseline/quarantine.
 */
import * as path from 'path';
import * as fs from 'fs';
import { ROOT, readJson, writeJson, normalizeVerdicts, gitShort } from './lib.mjs';

const args = process.argv.slice(2);
const resultsPath = args.includes('--results')
  ? path.resolve(ROOT, args[args.indexOf('--results') + 1])
  : path.join(ROOT, 'results.json');
const turn = args.includes('--turn') ? args[args.indexOf('--turn') + 1] : '?';

const report = readJson(resultsPath);
if (!report) {
  console.error(`no results at ${resultsPath} — run the suite first (npm test)`);
  process.exit(2);
}
const entries = normalizeVerdicts(report);
const baseline = readJson(path.join(ROOT, 'state', 'baseline.json'), { commit: null, verdicts: {} });
const quarantine = readJson(path.join(ROOT, 'state', 'quarantine.json'), { quarantined: [] });
const pending = readJson(path.join(ROOT, 'state', 'pending-entries.json'), { missing: [], untestable: [] });
const caseModel = readJson(path.join(ROOT, 'state', 'case-model.json'), { cases: [], residual: [] });
const commit = gitShort() ?? 'unknown';

// ---- classification ---------------------------------------------------------
const failing = entries.filter((e) => e.status === 'unexpected');
const flaky = entries.filter((e) => e.status === 'flaky');
const quarantinedIds = new Set(quarantine.quarantined.map((q) => q.case));

// flap accounting: a flaky observation is a flap; M=2 flaps ⇒ quarantined (FR-T7)
for (const f of flaky) {
  const id = f.tags.case ?? f.fullTitle;
  let q = quarantine.quarantined.find((x) => x.case === id);
  if (!q) {
    q = { case: id, flaps: 0, cleanRuns: 0, needed: 5, quarantined: false, since: new Date().toISOString() };
    quarantine.quarantined.push(q);
  }
  q.flaps += 1;
  q.cleanRuns = 0;
  if (q.flaps >= 2) q.quarantined = true;
}

// dedup failing by (flow, normalized error signature) — HB-5 blocked-by collapse
const sig = (e) =>
  `${e.tags.flow ?? 'unknown'}::${(e.error ?? 'no error text').replace(/[0-9a-f-]{8,}/gi, '<id>').replace(/\d+/g, '<n>')}`;
const groups = new Map();
for (const f of failing) {
  const k = sig(f);
  if (!groups.has(k)) groups.set(k, []);
  groups.get(k).push(f);
}

// ---- render -----------------------------------------------------------------
const lines = [];
const push = (s = '') => lines.push(s);
const oracle = (e) => (e.tags.oracle ? ` (oracle ${e.tags.oracle})` : '');

push(`## TEST HANDBACK — turn ${turn} — ${new Date().toISOString().slice(0, 10)} — commit ${commit}`);
push();
push('You are fixing an application that failed automated acceptance testing. Each entry');
push('below is a symptom: what was exercised, what was expected, what actually happened.');
push('Locate the cause yourself; no file hints are provided by design.');

let n = 0;
if (groups.size > 0) {
  push();
  push(`### FAILING (${groups.size})`);
  for (const [, members] of groups) {
    const e = members[0];
    n++;
    const flow = e.tags.flow ?? 'unknown-flow';
    const caseId = e.tags.case ?? e.fullTitle;
    const prev = baseline.verdicts[caseId];
    push(`${n}. **[${flow} / ${caseId}]**${oracle(e)}`);
    push(`   - Tested: ${e.fullTitle.split(' > ').pop()}`);
    push(`   - Expected: assertion at oracle level ${e.tags.oracle ?? 'n/a'} to hold`);
    push(`   - Actual: ${e.error ?? 'failed without error text (see trace)'}`);
    if (prev === 'pass' && baseline.commit) {
      push(`   - First failing at: commit ${commit} (passed on baseline ${baseline.commit})`);
    }
    if (members.length > 1) push(`   - Note: ${members.length - 1} further case(s) collapsed into this symptom`);
  }
}

if (pending.missing.length > 0) {
  push();
  push(`### MISSING (${pending.missing.length})`);
  for (const m of pending.missing) {
    n++;
    push(`${n}. **[${m.flow} / ${m.criterion}]**`);
    push(`   - Expected: ${m.expected}`);
    push(`   - Actual: no surface implements this capability`);
  }
}

if (pending.untestable.length > 0) {
  push();
  push(`### UNTESTABLE (${pending.untestable.length})`);
  for (const u of pending.untestable) {
    n++;
    push(`${n}. **[${u.flow} / ${u.element}]**`);
    push(`   - Expected: ${u.expected}`);
    push(`   - Actual: ${u.actual}`);
    push(`   - Fix expected: ${u.fix}`);
  }
}

if (n === 0) {
  push();
  push('### ALL GREEN — no failing, missing, or untestable entries this turn.');
}

// honesty footer (HB-4): quarantine + O5 + residual, one line
const qCount = quarantine.quarantined.filter((q) => q.quarantined).length;
const o5 = caseModel.cases.filter((c) => c.status === 'unverified-O5').length;
const residual = (caseModel.residual ?? []).join(', ');
const footerBits = [];
if (qCount) footerBits.push(`${qCount} spec(s) quarantined (flaky, excluded from green)`);
if (flaky.length) footerBits.push(`${flaky.length} retry-pass(es) this run recorded flaky, not green`);
if (o5) footerBits.push(`${o5} case(s) O5 characterized-only pending review`);
if (residual) footerBits.push(`residual: ${residual}`);
push();
push('---');
push(`_honesty: ${footerBits.length ? footerBits.join('; ') : 'no caveats this run'}._`);

const block = lines.join('\n');

// ---- persist ----------------------------------------------------------------
for (const e of entries) {
  const id = e.tags.case ?? e.fullTitle;
  baseline.verdicts[id] = e.status === 'expected' ? 'pass' : e.status === 'unexpected' ? 'fail' : e.status;
}
baseline.commit = commit;
writeJson(path.join(ROOT, 'state', 'baseline.json'), baseline);
writeJson(path.join(ROOT, 'state', 'quarantine.json'), quarantine);
// consumed — MISSING/UNTESTABLE entries appear exactly once
writeJson(path.join(ROOT, 'state', 'pending-entries.json'), { missing: [], untestable: [] });
fs.writeFileSync(path.join(ROOT, 'state', 'last-handback.md'), block + '\n');

console.log(block);
