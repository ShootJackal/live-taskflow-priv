#!/usr/bin/env node
const { spawnSync } = require('child_process');

function run(cmd, args) {
  const result = spawnSync(cmd, args, { stdio: 'inherit' });
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

run('node', ['scripts/build-gas.js']);

const diff = spawnSync('git', [
  'diff',
  '--exit-code',
  '--',
  'scripts/dist/appscript-core.gs',
  'scripts/dist/appscript-analytics.gs',
], { stdio: 'inherit' });

if (diff.status !== 0) {
  console.error('\nGas dist files are out-of-date. Run: node scripts/build-gas.js');
  process.exit(diff.status || 1);
}

console.log('Gas dist files are up-to-date.');
