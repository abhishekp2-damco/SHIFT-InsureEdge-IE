const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'pages', 'AddAdjusterPage.tsx'),
  'utf8',
);

test('Add Adjuster breadcrumb links back to Adjuster Management', () => {
  assert.match(source, /import \{ Link, useNavigate \} from 'react-router-dom'/);
  assert.match(source, /<nav aria-label="Breadcrumb"/);
  assert.match(source, /<Link to="\/claims\/adjusters" className="add-adjuster-breadcrumb-link">[\s\S]*?Adjuster Management[\s\S]*?<\/Link>/);
  assert.match(source, /Primary Information/);
});
