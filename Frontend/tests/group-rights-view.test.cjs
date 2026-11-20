const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadPermissionMatrix() {
  const filename = path.resolve(__dirname, '../src/components/PermissionMatrix/PermissionMatrix.tsx');
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
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {}, { filename })(require, module, module.exports);
  return module.exports;
}

const matrix = loadPermissionMatrix();

test('View Group uses the same module headings as Add Group', () => {
  assert.equal(matrix.permissionSectionLabel('Dashboard'), 'Dashboard');
  assert.equal(matrix.permissionSectionLabel('Quotes & Policies'), 'Individual');
  assert.equal(matrix.permissionSectionLabel('Claims'), 'Claims');

  const source = fs.readFileSync(path.resolve(__dirname, '../src/pages/GroupDetailPage.tsx'), 'utf8');
  assert.match(source, /permissionSectionLabel\(modName\)/);
  assert.doesNotMatch(source, />Screen<\/th>/);
});

test('View Group follows OutSystems module ordering', () => {
  const modules = ['Client Management', 'Claims', 'Dashboard', 'Quotes & Policies'];
  modules.sort(matrix.comparePermissionModules);
  assert.deepEqual(modules, ['Dashboard', 'Quotes & Policies', 'Claims', 'Client Management']);
});

test('non-applicable Quotes and Policies permissions are hidden and cleared', () => {
  const endorsement = {
    screenId: 10,
    screenCode: 'ENDORSEMENTINDIVIDUAL',
    isViewPermission: true,
    isCreatePermission: true,
    isEditPermission: true,
    isDuplicatePermission: true,
    isUploadPermission: true,
    isDownloadPermission: true,
    isViewSensitiveInfo: true,
    isAccessSensitiveDoc: true,
    isApproveReject: true,
  };

  assert.equal(matrix.isPermissionApplicable(endorsement, 'isViewSensitiveInfo'), true);
  assert.equal(matrix.isPermissionApplicable(endorsement, 'isDownloadPermission'), false);
  const normalized = matrix.normalizePermissionSave(endorsement);
  assert.equal(normalized.isViewPermission, true);
  assert.equal(normalized.isViewSensitiveInfo, true);
  assert.equal(normalized.isDownloadPermission, false);
  assert.equal(normalized.isApproveReject, false);
});
