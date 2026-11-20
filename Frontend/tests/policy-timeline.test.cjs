const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');

const hookReact = { ...React, useMemo: factory => factory() };

function loadTimelinePanel() {
  const filename = path.resolve(__dirname, '../src/pages/PolicyTimelinePanel.tsx');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  const localRequire = request => request === 'react' ? hookReact : require(request);
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {}, { filename })(localRequire, module, module.exports);
  return module.exports;
}

function nodes(tree) {
  if (Array.isArray(tree)) return tree.flatMap(nodes);
  if (!tree || typeof tree !== 'object') return [];
  return [tree, ...nodes(tree.props?.children)];
}

function text(tree) {
  if (Array.isArray(tree)) return tree.map(text).join('');
  if (typeof tree === 'string' || typeof tree === 'number') return String(tree);
  return tree?.props ? text(tree.props.children) : '';
}

const panel = loadTimelinePanel();

test('Timeline displays actual transactions, count, date, type, creator and timestamp', () => {
  const entries = [
    { activityDescription: 'New Business', createdByName: 'Alex Mercer', createdDate: '07-17-2026', createdTime: '09:05' },
    { activityDescription: 'Endorsement', createdByName: 'Jamie Rivera', createdDate: '07-19-2026', createdTime: '14:30' },
  ];

  const tree = panel.PolicyTimelinePanel({ entries, loading: false, error: null });
  const content = text(tree);

  assert.match(content, /Total Transactions – 2/);
  assert.match(content, /New Business/);
  assert.match(content, /Alex Mercer/);
  assert.match(content, /Timestamp: 07-17-2026, 09:05/);
  assert.match(content, /Endorsement/);
  assert.match(content, /Jamie Rivera/);
  assert.equal(nodes(tree).filter(node => String(node.props?.['aria-label'] ?? '').startsWith('Transaction Date')).length, 2);
});

test('Timeline displays the empty state after a successful zero-transaction response', () => {
  const tree = panel.PolicyTimelinePanel({ entries: [], loading: false, error: null });
  assert.match(text(tree), /Total Transactions – 0/);
  assert.match(text(tree), /No Data Available/);
  assert.equal(nodes(tree).some(node => node.props?.role === 'alert'), false);
});

test('Timeline displays a loading state without claiming the result is empty', () => {
  const tree = panel.PolicyTimelinePanel({ entries: [], loading: true, error: null });
  assert.match(text(tree), /Loading timeline/);
  assert.doesNotMatch(text(tree), /No Data Available/);
  assert.ok(nodes(tree).some(node => node.props?.role === 'status'));
});

test('Timeline displays an API error instead of a successful empty state', () => {
  const message = 'Unable to load the policy timeline. Please try again.';
  const tree = panel.PolicyTimelinePanel({ entries: [], loading: false, error: message });
  assert.match(text(tree), new RegExp(message.replaceAll('.', '\\.')));
  assert.doesNotMatch(text(tree), /No Data Available/);
  assert.ok(nodes(tree).some(node => node.props?.role === 'alert'));
});

test('Timeline request rejects malformed responses and records API failures', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/PolicySummaryPage.tsx'), 'utf8');
  assert.match(source, /if \(!Array\.isArray\(result\)\) throw new Error\('Invalid Timeline response'\)/);
  assert.match(source, /setError\('Unable to load the policy timeline\. Please try again\.'\)/);
  assert.doesNotMatch(source, /getTimeline\(insuredType, policyId\)[\s\S]{0,120}\.catch\(\(\) => setEntries\(\[\]\)\)/);
  assert.match(source, /window\.addEventListener\('focus', refreshOnFocus\)/);
  assert.match(source, /document\.addEventListener\('visibilitychange', refreshWhenVisible\)/);
});

test('Successful endorsement issuance opens the issued policy Timeline', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/QuotesPolicies/NewSubmission.tsx'), 'utf8');

  assert.match(source, /issuedPolicyTimelinePath = `\/quotes-policies\/policies\/\$\{encodeURIComponent\(/);
  assert.match(source, /\?screen=timeline&insuredType=\$\{insuredTypeSegment\}`/);
  assert.match(source, /onPolicySummary=\{\(\) => navigate\(issuedPolicyTimelinePath\)\}/);
});
