const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(frontendRoot, 'src', 'pages', file), 'utf8');

test('reported Claims pages use the standard empty-state message', () => {
  const dashboard = source('ClaimsDashboardPage.tsx');
  const letterTemplates = source('ClaimsLetterTemplatePage.tsx');
  const masterConfig = source('ClaimsMasterConfigPage.tsx');

  assert.match(dashboard, /Claim Aging[\s\S]*No Data Available/);
  assert.match(letterTemplates, />No Data Available<\/td>/);
  assert.doesNotMatch(letterTemplates, /Failed to load templates|>Retry</);
  assert.match(masterConfig, /No Data Available/);

  for (const page of [dashboard, letterTemplates, masterConfig]) {
    assert.doesNotMatch(page, /No open claims|No data to display|No records found\./i);
  }
});
