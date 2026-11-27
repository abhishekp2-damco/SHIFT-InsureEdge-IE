const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const page = fs.readFileSync(path.join(__dirname, '..', 'src', 'pages', 'ClaimsMasterConfigPage.tsx'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.css'), 'utf8');

test('Claims Master Configuration uses the blue information banner', () => {
  assert.match(page, /className="claims-config-info-banner" role="status"/);
  assert.match(page, /claims-config-info-banner__icon/);
  assert.match(page, /aria-label="Close notification"/);
  assert.match(css, /\.claims-config-info-banner\s*\{[\s\S]*?background: #0B5AA0;[\s\S]*?color: #fff;/);
  assert.match(css, /\.claims-config-info-banner\s*\{[\s\S]*?left: 50%;[\s\S]*?transform: translateX\(-50%\);/);
  assert.match(css, /\.claims-config-info-banner\s*\{[\s\S]*?width: 288px;[\s\S]*?padding: 0 12px;/);
  assert.match(css, /\.claims-config-info-banner__close\s*\{[\s\S]*?margin-left: auto;/);
  assert.doesNotMatch(page, /background: '#0d2137'/);
  assert.doesNotMatch(page, /background: '#f59e0b'/);
});
