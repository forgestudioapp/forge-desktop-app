const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('forgeAPI', {
  // --- PTY (terminals interactifs in-app) ---
  ptyCreate: (agentType, projectPath, cols, rows) => ipcRenderer.invoke('pty-create', agentType, projectPath, cols, rows),
  ptyInput: (sessionId, data) => ipcRenderer.invoke('pty-input', sessionId, data),
  ptyResize: (sessionId, cols, rows) => ipcRenderer.invoke('pty-resize', sessionId, cols, rows),
  ptyKill: (sessionId) => ipcRenderer.invoke('pty-kill', sessionId),
  onPtyData: (callback) => ipcRenderer.on('pty-data', (event, data) => callback(data)),
  onPtyExit: (callback) => ipcRenderer.on('pty-exit', (event, data) => callback(data)),

  // --- Agents locaux ---
  detectAgent: (agentType) => ipcRenderer.invoke('agent-detect', agentType),
  detectAllAgents: () => ipcRenderer.invoke('agent-detect-all'),
  launchAgent: (agentType, projectPath, prompt) => ipcRenderer.invoke('agent-launch', agentType, projectPath, prompt),
  stopAgent: (sessionId) => ipcRenderer.invoke('agent-stop', sessionId),
  getAgentStatus: (sessionId) => ipcRenderer.invoke('agent-status', sessionId),
  listAgentSessions: () => ipcRenderer.invoke('agent-list'),
  onAgentStream: (callback) => ipcRenderer.on('agent-stream', (event, data) => callback(data)),
  installAgent: (agentType) => ipcRenderer.invoke('agent-install', agentType),
  onAgentInstall: (callback) => ipcRenderer.on('agent-install', (event, data) => callback(data)),
  openAgentTerminal: (agentType, projectPath) => ipcRenderer.invoke('open-agent-terminal', agentType, projectPath),

  // --- Persistance agents (navigation workspace) ---
  saveAgentState: (agentsState) => ipcRenderer.invoke('save-agent-state', agentsState),
  loadAgentState: () => ipcRenderer.invoke('load-agent-state'),
  clearAgentState: () => ipcRenderer.invoke('clear-agent-state'),
  reconnectPty: (sessionId) => ipcRenderer.invoke('reconnect-pty', sessionId),

  // --- Systeme & Roblox ---
  ping: () => 'pong depuis le backend Electron !',
  checkSystem: () => ipcRenderer.invoke('check-system'),
  installRequirement: (requirement) => ipcRenderer.invoke('install-requirement', requirement),
  onInstallProgress: (callback) => ipcRenderer.on('install-progress', (event, data) => callback(data)),
  checkPluginConnection: () => ipcRenderer.invoke('check-plugin-connection'),
  checkStudioOpen: () => ipcRenderer.invoke('check-studio-open'),
  connectRoblox: () => ipcRenderer.invoke('connect-roblox'),
  isRobloxConnected: () => ipcRenderer.invoke('is-roblox-connected'),
  disconnectRoblox: () => ipcRenderer.invoke('disconnect-roblox'),

  // --- Auth Forge ---
  supabaseAuth: (mode, email, password, licenseKey) => ipcRenderer.invoke('supabase-auth', mode, email, password, licenseKey),
  isForgeConnected: () => ipcRenderer.invoke('is-forge-connected'),
  logoutForge: () => ipcRenderer.invoke('logout-forge'),

  // --- Licence (paywall création de compte) ---
  buyLicense: () => ipcRenderer.invoke('buy-license'),
  verifyLicense: (licenseKey) => ipcRenderer.invoke('verify-license', licenseKey),
  licenseStatus: () => ipcRenderer.invoke('license-status'),

  // --- GitHub ---
  githubStart: () => ipcRenderer.invoke('github-start'),
  githubPoll: () => ipcRenderer.invoke('github-poll'),
  isGithubConnected: () => ipcRenderer.invoke('is-github-connected'),
  getGithubDeviceStatus: () => ipcRenderer.invoke('get-github-device-status'),
  onGithubAuthSuccess: (callback) => ipcRenderer.on('github-auth-success', callback),
  onGithubAuthError: (callback) => ipcRenderer.on('github-auth-error', callback),

  // --- Cles API ---
  saveApiKey: (service, key) => ipcRenderer.invoke('save-api-key', service, key),
  getApiKeys: () => ipcRenderer.invoke('get-api-keys'),
  verifyApiKey: (service, key) => ipcRenderer.invoke('verify-api-key', service, key),

  // --- MCP ---
  executeLuau: (code, datamodelType) => ipcRenderer.invoke('execute-luau', code, datamodelType),

  // --- File Sync ---
  startFileSync: (projectPath) => ipcRenderer.invoke('start-file-sync', projectPath),
  stopFileSync: () => ipcRenderer.invoke('stop-file-sync'),

  // --- Projets ---
  createProject: (name) => ipcRenderer.invoke('create-project', name),
  getActiveProject: () => ipcRenderer.invoke('get-active-project'),
  listProjects: () => ipcRenderer.invoke('list-projects'),
  setActiveProject: (projectPath) => ipcRenderer.invoke('set-active-project', projectPath),
  deleteProject: (projectPath, deleteFiles) => ipcRenderer.invoke('delete-project', projectPath, deleteFiles),

  // --- Fichiers projet ---
  listProjectFiles: (projectPath, folder) => ipcRenderer.invoke('list-project-files', projectPath, folder),
  readFileText: (filePath) => ipcRenderer.invoke('read-file-text', filePath),
  readFileBinary: (filePath) => ipcRenderer.invoke('read-file-binary', filePath),
  acceptAsset: (filePath, assetType) => ipcRenderer.invoke('accept-asset', filePath, assetType),
  deleteFile: (filePath) => ipcRenderer.invoke('delete-file', filePath),
  uploadToRoblox: (filePath) => ipcRenderer.invoke('upload-to-roblox', filePath),

  // --- Médias : miniatures, icônes & conversions 2D/3D ---
  mediaListFiles: (projectPath) => ipcRenderer.invoke('media-list-files', projectPath),
  mediaCreateItem: (projectPath, kind, name) => ipcRenderer.invoke('media-create-item', projectPath, kind, name),
  mediaGenerate: (options) => ipcRenderer.invoke('media-generate', options),
  mediaPoll: (projectPath) => ipcRenderer.invoke('media-poll', projectPath),
  mediaDownload: (projectPath, relPath) => ipcRenderer.invoke('media-download', projectPath, relPath),
  mediaPreview: (projectPath, relPath) => ipcRenderer.invoke('media-preview', projectPath, relPath),
  mediaDelete: (projectPath, kind, itemId, variantId, relPath) => ipcRenderer.invoke('media-delete', projectPath, kind, itemId, variantId, relPath),
  mediaVariants: (options) => ipcRenderer.invoke('media-variants', options),
  mediaAttachFiles: (projectPath, kind, itemId, variantId, fileNames) => ipcRenderer.invoke('media-attach-files', projectPath, kind, itemId, variantId, fileNames),
  mediaRename: (projectPath, kind, itemId, newName) => ipcRenderer.invoke('media-rename', projectPath, kind, itemId, newName),

  // --- Library communautaire ---
  libraryList: () => ipcRenderer.invoke('library-list'),
  libraryUpload: (filePath, assetType) => ipcRenderer.invoke('library-upload', filePath, assetType),
  libraryImport: (item) => ipcRenderer.invoke('library-import', item),

  // --- Notifications agents → renderer ---
  onNotification: (callback) => ipcRenderer.on('agent-notification', (event, data) => callback(data)),
  pushNotification: (data) => ipcRenderer.invoke('push-notification', data),

  // --- MCP Studio activity ---
  onMcpStudioActivity: (callback) => ipcRenderer.on('mcp-studio-activity', (event, data) => callback(data)),

  // --- Utilitaires ---
  openExternal: (url) => ipcRenderer.invoke('open-external', url),

  // --- Reglages globaux ---
  getAppSettings: () => ipcRenderer.invoke('get-app-settings'),
  saveAppSettings: (s) => ipcRenderer.invoke('save-app-settings', s),

  // --- Removal d'arriere-plan (rembg) ---
  removeBackground: (filePath) => ipcRenderer.invoke('remove-background', filePath),

  // --- Cleanup: retirer tous les listeners IPC ---
  removeAllListeners: (channel) => ipcRenderer.removeAllListeners(channel)
});