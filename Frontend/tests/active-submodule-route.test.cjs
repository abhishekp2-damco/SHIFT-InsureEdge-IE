const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadRouteHelper() {
  const filename = path.resolve(__dirname, '../src/utils/activeRoute.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {}, { filename })(require, module, module.exports);
  return module.exports;
}

const { isParentRouteActive } = loadRouteHelper();

test('Claims sub-modules stay active on all nested add, edit and view routes', () => {
  const cases = [
    ['/claims/fnol/42', '/claims/fnol'],
    ['/claims/authority/add-user', '/claims/authority'],
    ['/claims/authority/create', '/claims/authority'],
    ['/claims/authority/42/view', '/claims/authority'],
    ['/claims/authority/42/edit', '/claims/authority'],
    ['/claims/adjusters/new', '/claims/adjusters'],
    ['/claims/adjusters/42', '/claims/adjusters'],
    ['/claims/letter-template/add', '/claims/letter-template'],
    ['/claims/letter-template/42/view', '/claims/letter-template'],
    ['/claims/letter-template/42/edit', '/claims/letter-template'],
    ['/claims/master-configuration/42/view', '/claims/master-configuration'],
    ['/claims/master-configuration/42/edit', '/claims/master-configuration'],
  ];

  for (const [currentPath, parentPath] of cases) {
    assert.equal(isParentRouteActive(currentPath, parentPath), true, `${currentPath} should activate ${parentPath}`);
  }
});

test('parent route matching is segment-safe and supports exact root items', () => {
  assert.equal(isParentRouteActive('/claims/letter-template-old/add', '/claims/letter-template'), false);
  assert.equal(isParentRouteActive('/claims/authority/add-user?from=list', '/claims/authority'), true);
  assert.equal(isParentRouteActive('/claims/authority/add-user', '/claims', true), false);
  assert.equal(isParentRouteActive('/claims', '/claims', true), true);
});

test('module drawer remains active throughout nested module routes', () => {
  assert.equal(isParentRouteActive('/quotes-policies/submissions/42', '/quotes-policies'), true);
  assert.equal(isParentRouteActive('/users/42/view', '/users'), true);
  assert.equal(isParentRouteActive('/groups/new', '/groups'), true);
  assert.equal(isParentRouteActive('/reports/claims/LOSS_RUN/42/edit', '/reports'), true);
});

test('shared navigation panels use the parent-route matcher', () => {
  const appShell = fs.readFileSync(path.resolve(__dirname, '../src/components/Layout/AppShell.tsx'), 'utf8');
  const quotesShell = fs.readFileSync(path.resolve(__dirname, '../src/pages/QuotesPolicies/QuotesPoliciesLandingShell.tsx'), 'utf8');

  assert.match(appShell, /isParentRouteActive\(currentPath, action\.to, action\.to === '\/claims'\)/);
  assert.match(appShell, /isParentRouteActive\(currentPath, item\.activePath\)/);
  assert.match(quotesShell, /isParentRouteActive\(location\.pathname, path\)/);
});
