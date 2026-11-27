const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pages', 'AdjusterManagementPage.tsx'),
  'utf8',
);

test('Adjuster Management total tile uses the supplied claims KPI icon', () => {
  assert.match(source, /variant === 'total'[\s\S]*?<svg width="43" height="42" viewBox="0 0 43 42"/);
  assert.match(source, /M16\.084 21C14\.8809[\s\S]*?M39\.9346 27\.8906L34\.0693 33\.7559/);
  assert.match(source, /fill="#0B5AA0"/);
  assert.doesNotMatch(source, /<circle cx="40" cy="34" r="5"/);
});
