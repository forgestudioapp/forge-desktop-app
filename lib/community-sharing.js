'use strict';

const DEFAULT_COMMUNITY_SHARING = Object.freeze({
  model3d: false,
  image: false,
  audio: false,
});

function normalizeCommunitySharing(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    model3d: source.model3d === true,
    image: source.image === true,
    audio: source.audio === true,
  };
}

function shouldAutoPublishCommunityAsset(settings, assetType) {
  const type = assetType === 'model' ? 'model3d' : assetType;
  if (!Object.prototype.hasOwnProperty.call(DEFAULT_COMMUNITY_SHARING, type)) return false;
  return normalizeCommunitySharing(settings && settings.communitySharing)[type];
}

function mergeCommunitySharing(settings, value) {
  const current = settings && typeof settings === 'object' && !Array.isArray(settings) ? settings : {};
  return { ...current, communitySharing: normalizeCommunitySharing(value) };
}

module.exports = {
  DEFAULT_COMMUNITY_SHARING,
  normalizeCommunitySharing,
  shouldAutoPublishCommunityAsset,
  mergeCommunitySharing,
};
