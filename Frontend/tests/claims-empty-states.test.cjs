const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..');
const source = file => fs.readFileSync(path.join(frontendRoot, 'src', 'pages', file), 'utf8');

test('reported Claims pages use the standard empty-state message', () => {
  const dashboard = source('ClaimsDashboardPage.tsx');
  const claimsWidget = dashboard.slice(
    dashboard.indexOf('function ClaimsWidgetTable'),
    dashboard.indexOf('function AlertCardList'),
  );
  const letterTemplates = source('ClaimsLetterTemplatePage.tsx');
  const masterConfig = source('ClaimsMasterConfigPage.tsx');

  assert.match(dashboard, /Claim Aging[\s\S]*No Data Available/);
  assert.match(claimsWidget, /<table[\s\S]*?<thead>[\s\S]*?headers\.map[\s\S]*?<tbody>[\s\S]*?rows\.length === 0[\s\S]*?colSpan=\{headers\.length\}[\s\S]*?No Data Available/);
  assert.doesNotMatch(claimsWidget, /rows\.length === 0\s*\?\s*<div/);
  assert.match(dashboard, /headers=\{\['Claim ID', 'Policy ID', 'Claim Type', 'Claim Estimate'\]\}/);
  assert.match(dashboard, /headers=\{\['Claim No\.', 'Policy ID', 'Claim Type', 'Claim Incurred'\]\}/);
  assert.match(letterTemplates, />No Data Available<\/td>/);
  assert.doesNotMatch(letterTemplates, /Failed to load templates|>Retry</);
  assert.match(masterConfig, /No Data Available/);

  for (const page of [dashboard, letterTemplates, masterConfig]) {
    assert.doesNotMatch(page, /No open claims|No data to display|No records found\./i);
  }
});
