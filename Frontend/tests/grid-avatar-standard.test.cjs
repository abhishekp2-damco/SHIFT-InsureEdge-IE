const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const frontendRoot = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(frontendRoot, relativePath), 'utf8');

test('all data-grid initials avatars use the Quotes avatar standard', () => {
  const globalCss = read('src/index.css');
  const sharedRule = globalCss.match(/\.grid-avatar,[\s\S]*?\.qp-scope \.insured-avatar \{[\s\S]*?\n\}/)?.[0] ?? '';

  assert.match(sharedRule, /\.dashboard-avatar/);
  assert.match(sharedRule, /width:\s*22px\s*!important/);
  assert.match(sharedRule, /height:\s*22px\s*!important/);
  assert.match(sharedRule, /background:\s*#7fc1e2\s*!important/i);
  assert.match(sharedRule, /color:\s*#003b5c\s*!important/i);
  assert.match(sharedRule, /font-size:\s*9px\s*!important/);
  assert.match(sharedRule, /font-weight:\s*600\s*!important/);

  const gridSources = [
    'src/pages/AdjusterManagementPage.tsx',
    'src/pages/ClaimsAuthorityPage.tsx',
    'src/pages/ClaimsAuthorityAddUserPage.tsx',
    'src/pages/ClaimsDashboardPage.tsx',
    'src/pages/ClaimWorkflowPage.tsx',
    'src/pages/FNOLRegPage.tsx',
    'src/pages/GroupListPage.tsx',
    'src/pages/PayeeListPage.tsx',
    'src/pages/UserManagement/index.tsx',
    'src/pages/ClientManagement/OfficeLocations.tsx',
    'src/components/GroupForm/GroupMembersPanel.tsx',
  ];

  for (const sourcePath of gridSources) {
    assert.match(read(sourcePath), /className="grid-avatar"/, `${sourcePath} must use the shared grid avatar`);
  }
});

test('FNOL no longer derives a different avatar color per record', () => {
  const fnol = read('src/pages/FNOLRegPage.tsx');
  assert.doesNotMatch(fnol, /AVATAR_COLORS|function avatarColor/);
});
