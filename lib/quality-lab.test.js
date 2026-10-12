const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('Quality Lab is wired through the renderer, preload and protected Studio handlers', () => {
  const main = read('main.js');
  const preload = read('preload.js');
  const workspace = read('workspace.html');

  for (const channel of [
    'quality-lab-gui',
    'quality-lab-playtest-start',
    'quality-lab-playtest-output',
    'quality-lab-playtest-stop',
  ]) {
    assert.match(main, new RegExp(`ipcMain\\.handle\\('${channel}'`));
    assert.match(preload, new RegExp(`ipcRenderer\\.invoke\\('${channel}'`));
  }

  assert.match(main, /ensureProjectPlaceAssociation\(projectPath\)/);
  assert.match(main, /\['play', 'run', 'multiplayer'\]/);
  assert.match(workspace, /id="qualityLabOverlay"/);
  assert.match(workspace, /runQualityGuiAudit\(true\)/);
  assert.match(workspace, /startQualityPlaytest\('multiplayer'\)/);
  assert.doesNotMatch(workspace, /Rapport de validation affiché dans la console/);
});
