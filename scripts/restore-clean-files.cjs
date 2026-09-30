#!/usr/bin/env node
/**
 * Re-apply the token migration to files restored from the clean pre-session base.
 *
 * Why this exists: nine files were corrupted by a Windows-1252 PowerShell round
 * trip during the token sweep. Those files had NO agent-authored changes — the
 * only delta from the clean base was the colour-to-token migration, which is
 * pure ASCII by construction. So the correct repair is: restore the clean bytes,
 * then re-run the same deterministic migration instead of trying to decode the
 * damage.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const BASE = '8e3ec75';

// No agent-authored changes in these; their only delta was the ASCII colour sweep.
const RESTORE = [
  'artifacts/cadence/src/components/rituals/RitualDialog.tsx',
  'artifacts/cadence/src/components/task/TaskAttachments.tsx',
  'artifacts/cadence/src/components/task/TaskEditor.tsx',
  'artifacts/cadence/src/components/task/TaskRow.tsx',
  'artifacts/cadence/src/pages/inbox/InboxPage.tsx',
  'artifacts/cadence/src/pages/landing/LandingPage.tsx',
  'artifacts/cadence/src/pages/onboarding/OnboardingPage.tsx',
  'artifacts/cadence/src/pages/profile/ProfilePage.tsx',
];

const DRY = process.argv.includes('--dry');

for (const f of RESTORE) {
  const buf = execSync(`git show ${BASE}:${f}`, { cwd: ROOT, maxBuffer: 1e9 });
  if (!DRY) fs.writeFileSync(path.join(ROOT, f), buf);
  const hasBad = /[\u00C0-\u00DF][\u0080-\u00FF]/.test(buf.toString('utf8'));
  console.log(`  ${hasBad ? 'STILL BAD ' : 'clean    '} ${f}${DRY ? ' (dry)' : ''}`);
}
console.log('');
