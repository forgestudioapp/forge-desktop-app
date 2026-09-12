const fs = require('fs');
const { modelArtifactKey } = require('./model-asset-pairing');

const MAX_NOTIFICATIONS = 100;

function readNotifications(filePath) {
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function writeNotifications(filePath, notifications) {
  fs.writeFileSync(filePath, JSON.stringify((notifications || []).slice(-MAX_NOTIFICATIONS), null, 2));
}

function appendNotification(filePath, data, now = Date.now()) {
  const stored = readNotifications(filePath);
  const isModel = item => ['model', 'model3d'].includes(item.assetType) && item.filePath;
  const previous = isModel(data) && stored.find(item =>
    isModel(item) && modelArtifactKey(item.filePath) === modelArtifactKey(data.filePath));
  // Resolve identity at write time: watcher and media completion can race.
  // A late GLB result must not replace the canonical FBX on the same card.
  if (previous && /\.fbx$/i.test(previous.filePath) && !/\.fbx$/i.test(data.filePath)) {
    data = { ...data, filePath: previous.filePath, fileName: previous.fileName };
  }
  const notification = {
    id: (previous && previous.id) || data.id || `notif_${now}_${Math.random().toString(36).slice(2, 8)}`,
    agentName: data.agentName || 'Agent',
    agentColor: data.agentColor || '#3B82F6',
    aiMessage: data.aiMessage || 'Nouvel asset généré.',
    assetType: data.assetType || 'image',
    filePath: data.filePath || '',
    fileName: data.fileName || 'asset',
    previewPath: data.previewPath || (previous && previous.previewPath) || '',
    timestamp: (previous && previous.timestamp) || data.timestamp || now,
    read: previous ? previous.read : Boolean(data.read),
  };
  const notifications = stored.filter(item => item.id !== notification.id && !(previous && isModel(item) && modelArtifactKey(item.filePath) === modelArtifactKey(data.filePath)));
  notifications.push(notification);
  writeNotifications(filePath, notifications);
  return notification;
}

function updateNotification(filePath, id, changes) {
  const notifications = readNotifications(filePath);
  const item = notifications.find(notification => notification.id === id);
  if (!item) return false;
  Object.assign(item, changes || {});
  writeNotifications(filePath, notifications);
  return true;
}

function deleteNotification(filePath, id) {
  const notifications = readNotifications(filePath);
  const filtered = notifications.filter(notification => notification.id !== id);
  writeNotifications(filePath, filtered);
  return filtered.length !== notifications.length;
}

module.exports = {
  MAX_NOTIFICATIONS,
  readNotifications,
  writeNotifications,
  appendNotification,
  updateNotification,
  deleteNotification,
};
