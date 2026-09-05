const fs = require('fs');

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
  const notification = {
    id: data.id || `notif_${now}_${Math.random().toString(36).slice(2, 8)}`,
    agentName: data.agentName || 'Agent',
    agentColor: data.agentColor || '#3B82F6',
    aiMessage: data.aiMessage || 'Nouvel asset généré.',
    assetType: data.assetType || 'image',
    filePath: data.filePath || '',
    fileName: data.fileName || 'asset',
    timestamp: data.timestamp || now,
    read: Boolean(data.read),
  };
  const notifications = readNotifications(filePath).filter(item => item.id !== notification.id);
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
