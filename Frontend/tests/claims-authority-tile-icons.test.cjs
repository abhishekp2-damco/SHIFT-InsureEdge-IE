const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pages', 'ClaimsAuthorityPage.tsx'),
  'utf8',
);

test('Claim Authority summary tiles use the OutSystems-equivalent status icons', () => {
  assert.match(source, /import \{ UserRoundCheck, UserRoundX \} from 'lucide-react'/);
  assert.match(source, /function TotalAuthorityIcon\(\)/);
  assert.match(source, /<svg width="43" height="42" viewBox="0 0 43 42"[\s\S]*?M16\.084 21C14\.8809/);
  assert.match(source, /M39\.9346 27\.8906L34\.0693 33\.7559/);
  assert.match(source, /fill="#0B5AA0"/);
  assert.doesNotMatch(source, /M25\.5 40\.5C25\.5 35\.8056/);
  assert.doesNotMatch(source, /Gauge|UserRound size/);
  assert.match(source, /<TotalAuthorityIcon \/>/);
  assert.match(source, /<UserRoundCheck size=\{38\} strokeWidth=\{1\.5\} color="#009765"/);
  assert.match(source, /<UserRoundX size=\{38\} strokeWidth=\{1\.5\} color="#c62828"/);
});

test('Claim Authority listing does not render a breadcrumb above its title', () => {
  assert.doesNotMatch(source, />Claims \/ Claims Authority</);
  assert.match(source, />Claim Authority<\/h1>/);
});
