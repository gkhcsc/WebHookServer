import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;

// ── helpers ──────────────────────────────────────────────────────────
function run(cmd, opts = {}) {
  console.log(`\n> ${cmd}`);
  execSync(cmd, { stdio: 'inherit', cwd: ROOT, ...opts });
}

function check(cmd) {
  try {
    execSync(cmd, { stdio: 'pipe', cwd: ROOT });
    return true;
  } catch {
    return false;
  }
}

// ── 1. Node.js version ──────────────────────────────────────────────
const major = Number(process.versions.node.split('.')[0]);
console.log(`Node.js version: ${process.versions.node}`);
if (major < 18) {
  console.error('ERROR: Node.js >= 18 is required. Current version:', process.versions.node);
  process.exit(1);
}

// ── 2. pnpm check ───────────────────────────────────────────────────
if (!check('pnpm --version')) {
  console.log('\npnpm is not installed. Install it via:');
  console.log('  npm install -g pnpm');
  console.log('\nOr visit: https://pnpm.io/installation');
  process.exit(1);
}
const pnpmVersion = execSync('pnpm --version', { encoding: 'utf-8', cwd: ROOT }).trim();
console.log(`pnpm version: ${pnpmVersion}`);

// ── 3. Install dependencies ─────────────────────────────────────────
console.log('\n── Installing dependencies ──');
run('pnpm install');

// ── 4. Build frontend ───────────────────────────────────────────────
console.log('\n── Building frontend ──');
run('pnpm run build');

// ── 5. Verify dist ──────────────────────────────────────────────────
const distIndex = path.resolve(ROOT, 'dist', 'index.html');
if (existsSync(distIndex)) {
  console.log('\n✓  Setup complete!');
  console.log('  Frontend dist ready at: dist/');
  console.log('\n  Next step: start the server');
  console.log('    pnpm start');
  console.log('  Or for development:');
  console.log('    pnpm dev');
} else {
  console.error('\n✗  Build may have failed — dist/index.html not found.');
  process.exit(1);
}
