const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');

function assertOrdered(source, first, second, message) {
  const firstIndex = source.indexOf(first);
  const secondIndex = source.indexOf(second);
  assert.notEqual(firstIndex, -1, `${message}: missing ${first}`);
  assert.notEqual(secondIndex, -1, `${message}: missing ${second}`);
  assert.ok(firstIndex < secondIndex, message);
}

test('Claims Master Configuration keeps Action before all business columns', () => {
  const list = read('src/pages/ClaimsMasterConfigPage.tsx');
  const edit = read('src/pages/ClaimsMasterConfigEditPage.tsx');

  assert.match(list, /<tr>\s*<th[^>]*>\s*Action\s*<\/th>\s*\{colOrder\.map/);
  assert.match(list, /rows\.map\(row => \([\s\S]*?<td style=\{\{ \.\.\.TD, textAlign: 'right' \}\}>[\s\S]*?\{colOrder\.map/);

  assertOrdered(edit, '>Action</th>', '>{valueLabel}</th>', 'edit header must start with Action');
  assert.match(edit, /filteredRows\.map\(row => \([\s\S]*?\{\/\* Action \*\/\}[\s\S]*?\{\/\* Value Label \*\/\}/);
});

test('embedded quote tables keep Action as their first column', () => {
  const submission = read('src/pages/QuotesPolicies/NewSubmission.tsx');

  assert.match(submission, /additional-insured-grid[\s\S]*?<tr>\s*<th>Action<\/th>\s*<SortTh label="Name"/);
  assert.match(submission, /additional-org-grid[\s\S]*?<tr>\s*<th>Action<\/th>\s*<SortTh label="Org Name"/);
  assert.match(submission, /risk-info-mortgage-table[\s\S]*?<tr>\s*<th>Action<\/th>\s*<th>Mortgage Name<\/th>/);
});

test('claim workflow editable grids keep Action first and totals aligned', () => {
  const workflow = read('src/pages/ClaimWorkflowPage.tsx');

  assert.match(workflow, /\['Action', 'Coverage', 'Coverage Limit'/);
  assert.match(workflow, /\['Action', 'Coverage', 'Cause of Loss Description', 'Payee Type'/);
  assert.match(workflow, /<tr style=\{\{ background: '#f8fafc' \}\}>\s*<td style=\{tdStyle\} \/>\s*<td colSpan=\{9\}/);
  assert.match(workflow, /visibleDefs\.filter\(col => col\.key !== 'action'\)\.map/);
});
