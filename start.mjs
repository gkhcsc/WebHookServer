import { execSync, spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = __dirname;
const BACKEND_ENTRY = path.resolve(ROOT, 'apps', 'backend', 'index.mjs');
const DIST_INDEX = path.resolve(ROOT, 'dist', 'index.html');

// ── 1. Ensure frontend is built ─────────────────────────────────────
if (!existsSync(DIST_INDEX)) {
  console.log('Frontend dist not found. Building...');
  execSync('pnpm run build', { stdio: 'inherit', cwd: ROOT });
  if (!existsSync(DIST_INDEX)) {
    console.error('ERROR: Build failed — dist/index.html still missing.');
    process.exit(1);
  }
}

// ── 2. Start backend ─────────────────────────────────────────────────
console.log('\nStarting WebHook Server...');
console.log(`  Control panel: http://127.0.0.1:18000/`);
console.log(`  Public webhook: http://0.0.0.0:8000/`);
console.log('  Press Ctrl+C to stop.\n');

const server = spawn('node', [BACKEND_ENTRY], {
  stdio: 'inherit',
  cwd: ROOT,
  env: { ...process.env },
});

// Forward signals for clean shutdown
function shutdown() {
  if (!server.killed) {
    server.kill('SIGTERM');
  }
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

server.on('close', (code) => {
  process.exit(code ?? 0);
});
