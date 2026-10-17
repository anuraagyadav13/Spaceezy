#!/usr/bin/env node
// Fails (exit 1) if known weak demo credentials or obvious secrets appear in
// tracked source. Run via: npm run check:secrets (from backend/) or
// `node backend/scripts/check-secrets.js` from repo root.
//
// This is a lightweight tripwire, not a substitute for a real secret scanner.
// It exists because demo-admin credentials previously lived in tracked files.

const { execSync } = require('child_process');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..', '..');

// Files we never want to contain a literal demo password again.
const FORBIDDEN_PASSWORD_LITERALS = [
  /password\s*[:=]\s*['"`]password123['"`]/i,
  /['"`]password['"`]\s*:\s*['"`]password123['"`]/i,
];

// Tracked filenames that must never reappear (previously leaked creds).
const FORBIDDEN_PATHS = [
  'backend/.tmp-lead-debug.js',
  'backend/.tmp-users-debug.js',
];

function trackedFiles() {
  const out = execSync('git ls-files', { cwd: repoRoot, encoding: 'utf8' });
  return out.split('\n').map((s) => s.trim()).filter(Boolean);
}

function main() {
  const files = trackedFiles();
  const violations = [];

  for (const forbidden of FORBIDDEN_PATHS) {
    if (files.includes(forbidden)) {
      violations.push(`forbidden tracked file present: ${forbidden}`);
    }
  }

  const candidates = files.filter(
    (f) => /\.(js|jsx|ts|tsx|ps1|sh|json|md|yml|yaml)$/.test(f) && !f.startsWith('docs/qa-audit')
  );

  for (const rel of candidates) {
    let content;
    try {
      content = require('fs').readFileSync(path.join(repoRoot, rel), 'utf8');
    } catch {
      continue;
    }
    for (const re of FORBIDDEN_PASSWORD_LITERALS) {
      if (re.test(content)) {
        violations.push(`weak demo password literal in ${rel}`);
      }
    }
  }

  if (violations.length) {
    console.error('Secret scan FAILED:');
    for (const v of violations) console.error('  - ' + v);
    process.exit(1);
  }
  console.log(`Secret scan passed (${candidates.length} files checked).`);
}

main();
