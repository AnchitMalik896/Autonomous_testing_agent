/**
 * Mechanical enforcement of the sync + locator rules (§9, RS-8):
 *   ERROR  waitForTimeout / sleep      — arbitrary waits as synchronization are banned
 *   ERROR  xpath selectors             — structural, brittle, false-red (T2) threat
 *   ERROR  structural CSS in locator() — nth-child / '>' chains / bare .class/#id paths
 * Run: node harness/lint-bans.mjs   (nonzero exit on any error)
 */
import * as fs from 'fs';
import * as path from 'path';
import { ROOT } from './lib.mjs';

const RULES = [
  { re: /\bwaitForTimeout\s*\(/, msg: 'waitForTimeout() banned — wait on explicit app state/events (§9)' },
  { re: /\bsleep\s*\(/, msg: 'sleep() banned — wait on explicit app state/events (§9)' },
  { re: /xpath=|\/\/[a-z]+\[/i, msg: 'XPath selectors banned (RS-8)' },
  { re: /locator\(\s*['"`][^'"`]*(?:nth-child|nth-of-type| > |>>)/, msg: 'structural CSS selector banned (RS-8) — use role/label/testid, or file UNTESTABLE' },
  { re: /locator\(\s*['"`](?:\.|#)[\w-]+\s*['"`]\)/, msg: 'bare class/id selector banned (RS-8) — use getByRole/getByLabel/getByTestId' },
];

function* walk(dir) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.name.endsWith('.ts')) yield p;
  }
}

let errors = 0;
const flowsDir = path.join(ROOT, 'flows');
if (fs.existsSync(flowsDir)) {
  for (const file of walk(flowsDir)) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      if (/^\s*(\/\/|\*)/.test(line)) return; // skip comments
      for (const rule of RULES) {
        if (rule.re.test(line)) {
          console.error(`ERROR ${path.relative(ROOT, file)}:${i + 1} — ${rule.msg}`);
          errors++;
        }
      }
    });
  }
}

if (errors > 0) {
  console.error(`\nlint:bans — ${errors} violation(s). These rules are inadmissible in the frozen suite.`);
  process.exit(1);
}
console.log('lint:bans — clean');
