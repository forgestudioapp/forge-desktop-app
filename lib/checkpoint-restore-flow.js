async function restoreWithSyncPaused({ isSyncing, stopSync, startSync, restore }) {
  if (isSyncing) stopSync();
  try { return await restore(); }
  finally { if (isSyncing) startSync(); }
}

module.exports = { restoreWithSyncPaused };
