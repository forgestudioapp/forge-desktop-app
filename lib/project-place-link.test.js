const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateProjectPlaceLink, linkedPlaceId, normalizePlaceInfo } = require('./project-place-link');

const place = { placeId: 123, gameId: 456, placeName: 'Simulator' };

test('prepare une association stable entre un dossier Forge et une place Roblox', () => {
  const result = evaluateProjectPlaceLink([], 'C:\\ForgeProjects\\simulator', place, '2026-09-05T00:00:00.000Z');
  assert.equal(result.success, true);
  assert.deepEqual(result.link, {
    placeId: '123', gameId: '456', placeName: 'Simulator', linkedAt: '2026-09-05T00:00:00.000Z'
  });
});

test('refuse de relier un dossier a une autre place', () => {
  const projects = [{ name: 'A', path: 'C:\\ForgeProjects\\A', linkedStudio: { placeId: '111' } }];
  const result = evaluateProjectPlaceLink(projects, projects[0].path, { ...place, placeId: 222 });
  assert.equal(result.code, 'project-linked-elsewhere');
});

test('refuse de relier deux dossiers Forge a la meme place', () => {
  const projects = [{ name: 'Projet A', path: 'C:\\ForgeProjects\\A', linkedStudio: { placeId: '123' } }];
  const result = evaluateProjectPlaceLink(projects, 'C:\\ForgeProjects\\B', place);
  assert.equal(result.code, 'place-linked-elsewhere');
  assert.equal(result.conflictingProject.name, 'Projet A');
});

test('refuse une place non publiee sans PlaceId stable', () => {
  const result = evaluateProjectPlaceLink([], 'C:\\ForgeProjects\\A', { placeId: 0, gameId: 0 });
  assert.equal(result.code, 'place-unpublished');
});

test('relit les anciens formats du registre et conserve une association identique', () => {
  const project = { name: 'A', path: 'C:\\ForgeProjects\\A', linkedStudio: '123' };
  assert.equal(linkedPlaceId(project), '123');
  assert.equal(normalizePlaceInfo(place).placeId, '123');
  assert.equal(evaluateProjectPlaceLink([project], project.path, place).alreadyLinked, true);
});
