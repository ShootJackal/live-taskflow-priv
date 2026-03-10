#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const root = __dirname;
const sharedPath = path.join(root, 'gas-src/shared/appscript-shared.ts');
const distDir = path.join(root, 'dist');

const targets = [
  { role: 'core', output: 'appscript-core.gs' },
  { role: 'analytics', output: 'appscript-analytics.gs' },
];

const shared = fs.readFileSync(sharedPath, 'utf8');

if (!shared.includes('// __ROLE_CONFIG__')) {
  throw new Error('Missing // __ROLE_CONFIG__ marker in shared source');
}

fs.mkdirSync(distDir, { recursive: true });

for (const target of targets) {
  const rolePath = path.join(root, `gas-src/roles/${target.role}.ts`);
  const roleSource = fs.readFileSync(rolePath, 'utf8').trimEnd();
  const output = shared.replace('// __ROLE_CONFIG__', roleSource);
  fs.writeFileSync(path.join(distDir, target.output), `${output.trimEnd()}\n`, 'utf8');
  console.log(`Generated scripts/dist/${target.output}`);
}
