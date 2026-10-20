const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_COMMUNITY_SHARING,
  normalizeCommunitySharing,
  shouldAutoPublishCommunityAsset,
  mergeCommunitySharing,
} = require('./community-sharing');

test('community sharing is private by default for models, images and sounds', () => {
  assert.deepEqual(normalizeCommunitySharing(), DEFAULT_COMMUNITY_SHARING);
  for (const type of ['model3d', 'image', 'audio']) {
    assert.equal(shouldAutoPublishCommunityAsset({}, type), false);
  }
});

test('each community asset type can be enabled independently', () => {
  const settings = { communitySharing: { model3d: true, image: false, audio: true, extra: true } };
  assert.equal(shouldAutoPublishCommunityAsset(settings, 'model3d'), true);
  assert.equal(shouldAutoPublishCommunityAsset(settings, 'model'), true);
  assert.equal(shouldAutoPublishCommunityAsset(settings, 'image'), false);
  assert.equal(shouldAutoPublishCommunityAsset(settings, 'audio'), true);
  assert.equal(shouldAutoPublishCommunityAsset(settings, 'script'), false);
});

test('truthy strings and malformed values never opt the user into sharing', () => {
  assert.deepEqual(normalizeCommunitySharing({ model3d: 'true', image: 1, audio: null }), DEFAULT_COMMUNITY_SHARING);
  assert.deepEqual(normalizeCommunitySharing(['model3d']), DEFAULT_COMMUNITY_SHARING);
});

test('saving community choices preserves unrelated application settings', () => {
  const result = mergeCommunitySharing(
    { projectsDirectory: 'D:/Forge', autoRemoveBg: true },
    { model3d: false, image: true, audio: false },
  );
  assert.deepEqual(result, {
    projectsDirectory: 'D:/Forge',
    autoRemoveBg: true,
    communitySharing: { model3d: false, image: true, audio: false },
  });
});
