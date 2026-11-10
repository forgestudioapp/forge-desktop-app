const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { connectNewProject } = require('./new-project-connection');

const studio = { place: { placeId: '42', placeName: 'Mon jeu' } };
const base = { projectPath: '/project', getPlace: async () => studio, confirmPlace: async () => true,
  link: async () => ({ success: true }), sync: async () => ({ firstSync: { status: 'confirmed', buildId: 'build-1' } }), stage() {} };

test('public creation page exposes only project name and create button', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'project-create.html'), 'utf8');
  assert.match(html, /id="projectNameInput"/);
  assert.match(html, /Créer mon projet/);
  assert.equal((html.match(/<input\b/g) || []).length, 1);
  assert.equal((html.match(/<button\b/g) || []).length, 1);
  assert.doesNotMatch(html, /<a\b/);
  assert.doesNotMatch(html, /projectLanguage|projectPreset|projectModule|starterExample|Options avancées|Luau|TypeScript/);
});
test('closed Studio waits without linking', async () => {
  let linked = 0;
  const result = await connectNewProject({ ...base, getPlace: async () => ({ error: 'offline' }), link: async () => { linked++; return {}; } });
  assert.equal(result.status, 'waiting-studio');
  assert.equal(result.message, 'Ouvre dans Roblox Studio la place que tu veux utiliser. Forge la détectera automatiquement.');
  assert.equal(linked, 0);
});
test('the detected place needs one confirmation and is checked again during linking', async () => {
  const calls = [];
  const result = await connectNewProject({ ...base, confirmPlace: async place => { calls.push('confirm:'+place.placeName); return true; },
    link: async (_path,id) => { calls.push('link:'+id); return { success:true }; }, sync: async () => { calls.push('sync'); return base.sync(); } });
  assert.equal(result.status, 'ready');
  assert.deepEqual(calls, ['confirm:Mon jeu','link:42','sync']);
  const changed = await connectNewProject({ ...base, link: async () => ({ error: 'PlaceId ouvert 43', code: 'place-changed' }) });
  assert.equal(changed.status, 'wrong-place');
});
test('a different place never synchronizes an already linked project', async () => {
  let syncs = 0;
  const result = await connectNewProject({ ...base, linkedPlaceId: '99', sync: async () => { syncs++; return base.sync(); } });
  assert.equal(result.status, 'wrong-place'); assert.equal(syncs,0);
});
test('broken compilation stays unready and can resume after correction without another confirmation', async () => {
  let confirmations = 0;
  const first = await connectNewProject({ ...base, confirmPlace: async () => { confirmations++; return true; },
    sync: async () => ({ error:'syntax', firstSync:{stage:'validation'} }) });
  assert.equal(first.status, 'error');
  const second = await connectNewProject({ ...base, approvedPlaceId:'42', linkedPlaceId:'42', confirmPlace: async () => { confirmations++; return true; } });
  assert.equal(second.status, 'ready'); assert.equal(confirmations,1);
});
