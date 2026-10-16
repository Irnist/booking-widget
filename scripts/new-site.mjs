// Adds a business: writes sites/<id>.json from the demo, with a fresh inbox key.
//   npm run new-site -- <id> "<Business name>" [Time/Zone]
// The key is printed once and only its SHA-256 hash is stored, so the JSON is
// safe to commit. Give the key to the owner; it opens their inbox.
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeSite } from '../src/shared/site.js';

process.stdout.reconfigure?.({ encoding: 'utf8', errors: 'replace' });
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [id, name, timezone = 'America/Chicago'] = process.argv.slice(2);

if (!id || !name) {
  console.error('Usage: npm run new-site -- <id> "<Business name>" [Time/Zone]');
  process.exit(1);
}
const file = join(root, 'sites', `${id}.json`);
if (existsSync(file)) {
  console.error(`sites/${id}.json already exists; edit it instead.`);
  process.exit(1);
}

const key = randomBytes(18).toString('base64url');
const demo = JSON.parse(readFileSync(join(root, 'sites/demo.json'), 'utf8'));
const site = {
  ...demo,
  id,
  name,
  timezone,
  phone: '',
  allowedOrigins: ['https://www.example.com'],
  adminKeyHash: createHash('sha256').update(key).digest('hex'),
  notify: {},
  demo: false,
};
normalizeSite(site, `sites/${id}.json`);
writeFileSync(file, `${JSON.stringify(site, null, 2)}\n`);

console.log(`Wrote sites/${id}.json from the demo's hours and services.`);
console.log('Edit its hours, services, phone and allowedOrigins, then deploy.');
console.log(`\nInbox key for ${name} (shown once, not stored):\n  ${key}\n`);
