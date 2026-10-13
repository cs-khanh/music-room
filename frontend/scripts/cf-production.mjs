import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const frontendRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '..',
);
const repoRoot = path.resolve(frontendRoot, '..');
const env = {
  ...process.env,
  NEXT_PUBLIC_API_URL: 'https://api-music.khanhcs.id.vn',
  NEXT_PUBLIC_SOCKET_URL: 'https://api-music.khanhcs.id.vn',
};
const openNextCli = path.join(
  repoRoot,
  'node_modules',
  '@opennextjs',
  'cloudflare',
  'dist',
  'cli',
  'index.js',
);
const wranglerCli = path.join(
  repoRoot,
  'node_modules',
  'wrangler',
  'bin',
  'wrangler.js',
);

function run(args) {
  const result = spawnSync(process.execPath, args, {
    cwd: frontendRoot,
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run([openNextCli, 'build']);
if (!process.argv.includes('--build-only')) {
  run([wranglerCli, 'deploy', '--config', 'wrangler.jsonc']);
}
