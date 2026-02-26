import { access } from 'node:fs/promises';

const requiredFiles = [
  'apps/companion/src/index.js',
  'apps/extension/src/manifest.json',
  'apps/extension/src/content.js',
  'packages/shared/src/style-parser.js'
];

for (const file of requiredFiles) {
  await access(file);
}

console.log('Build check passed: required files are present.');
