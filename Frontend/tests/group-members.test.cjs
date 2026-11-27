const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

function loadMemberHelpers() {
  const filename = path.resolve(__dirname, '../src/components/GroupForm/groupMembers.ts');
  const source = fs.readFileSync(filename, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const module = { exports: {} };
  vm.runInNewContext(`(function(require,module,exports){${compiled}\n})`, {}, { filename })(require, module, module.exports);
  return module.exports;
}

const members = loadMemberHelpers();
const users = [
  { id: 2, fullName: 'Zara Producer', email: 'zara@example.com', initials: 'ZP', createdOn: '2026-01-01T00:00:00Z' },
  { id: 1, fullName: 'Alice Client', email: 'alice@example.com', initials: 'AC', createdOn: '2026-02-01T00:00:00Z' },
];

test('member picker searches by name and email', () => {
  assert.deepEqual(members.filterAndSortMembers(users, 'producer', 'alphabetical').map(user => user.id), [2]);
  assert.deepEqual(members.filterAndSortMembers(users, 'ALICE@', 'alphabetical').map(user => user.id), [1]);
});

test('member picker supports alphabetical and creation-date sorting', () => {
  assert.deepEqual(Array.from(members.filterAndSortMembers(users, '', 'alphabetical'), user => user.id), [1, 2]);
  assert.deepEqual(Array.from(members.filterAndSortMembers(users, '', 'creationDate'), user => user.id), [1, 2]);
});

test('member selection prevents duplicate assignments and supports removal', () => {
  assert.deepEqual(Array.from(members.normalizeMemberIds([2, 2, -1, 1])), [2, 1]);
  assert.deepEqual(Array.from(members.toggleMember([1], 2)), [1, 2]);
  assert.deepEqual(Array.from(members.toggleMember([1, 2], 1)), [2]);
});

test('Add Group panel exposes the required Add User modal lifecycle', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '../src/components/GroupForm/GroupMembersPanel.tsx'), 'utf8');
  assert.match(source, />\s*Add User\s*</);
  assert.match(source, /Add User To Group/);
  assert.match(source, /Search By Name or Email ID/);
  assert.match(source, /Creation Date/);
  assert.match(source, /onCancel/);
  assert.match(source, /onSave/);
});
