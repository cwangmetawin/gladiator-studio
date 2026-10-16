import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = file => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
let area = source('PartnerArea.tsx'), dialog = source('PartnerDialog.tsx');
if (process.env.MUTATE_PORTAL_CSS_EAGER === '1') {
  area = area.replace("import './partner.css';", '');
  dialog += "\nimport './partner.css';\n";
}

test('portal stylesheet stays within the lazy Client Area while the pending frame remains immediately available', () => {
  assert.equal(area.includes("import './partner.css';"), true, 'lazy PartnerArea owns portal CSS');
  assert.equal(dialog.includes("import './partner.css';"), false, 'persistent PartnerDialog cannot eagerly load portal CSS');
  for (const file of ['PartnerDialog.tsx', 'PartnerPending.tsx']) {
    assert.doesNotMatch(source(file), /from ['"]\.\/(?:usePartnerAuth|usePortalData|PortalSections|portalStorage|portalHelpers)['"]/);
  }
});
