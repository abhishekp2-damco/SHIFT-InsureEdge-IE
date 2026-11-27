const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pages', 'AddAdjusterPage.tsx'),
  'utf8',
);
const api = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'api', 'adjusters.ts'),
  'utf8',
);

test('Add Adjuster displays the generated user ID', () => {
  assert.match(api, /getNextUserCode:.*\/adjusters\/next-user-code/);
  assert.match(page, /adjustersApi\.getNextUserCode\(\)/);
  assert.match(page, /User ID - \{nextUserCode\}/);
  assert.doesNotMatch(page, /User ID - Auto/);
});

test('fixed Add Adjuster sections do not show expand or collapse icons', () => {
  for (const title of ['User Primary Information', 'Registered Address', 'Mailing Address']) {
    assert.match(page, new RegExp(`<SectionTitle title="${title}" showIcon=\\{false\\} \\/>`));
  }
});

test('Add Adjuster SSN field uses the nine-digit masked input', () => {
  assert.match(page, /<Field label="SSN">[\s\S]*?<MaskedSsnInput value=\{form\.ssn \?\? ''\} onChange=\{v => set\('ssn', v\)\} \/>[\s\S]*?<\/Field>/);
  assert.match(page, /replace\(\/\\D\/g, ''\)\.slice\(0, 9\)/);
  assert.match(page, /placeholder="XXX-XX-XXXX"/);
});
