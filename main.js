const { app, BrowserWindow, ipcMain, safeStorage, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, execFile } = require('child_process');
const { canonicalExistingPath, isPathInside, isExistingDirectoryWithinRoots } = require('./lib/path-security');
const {
  buildCodexExec,
  buildCodexMediaInstructions,
  findMediaItem,
  findMediaEntry,
  normalizeMediaPath,
} = require('./lib/media-generation');
const {
  readNotifications,
  writeNotifications,
  appendNotification,
  updateNotification,
  deleteNotification,
} = require('./lib/notification-store');
const { syncForgeAgentInstructions } = require('./lib/forge-instructions');
const {
  buildRobloxAuthorizationUrl,
  parseRobloxOAuthCallback,
  normalizeRobloxTokenData,
  missingRobloxTokenScopes,
} = require('./lib/roblox-oauth');
require('dotenv').config({ path: path.join(app.isPackaged ? process.resourcesPath : __dirname, '.env') });

// ---- node-pty (terminal interactif) ----
let spawnPty = null;
try {
  ({ spawn: spawnPty } = require('node-pty'));
  console.log('[PTY] node-pty charge avec succes');
} catch (err) {
  console.error('[PTY] node-pty non disponible. Terminal externe utilise comme fallback.');
}

// ============================================
// CONFIG & UTILS
// ============================================
const HOME = os.homedir();
const FORGE_PROJECTS_ROOT = path.join(app.getPath('documents'), 'ForgeProjects');
const ALLOWED_ROOTS = [
  app.getPath('documents'),
  // Electron suit parfois la redirection OneDrive du dossier Documents alors
  // que d'anciens projets Forge se trouvent encore dans ~/Documents.
  path.join(HOME, 'Documents'),
  path.join(HOME, 'Desktop'),
  path.join(HOME, 'projects'),
  path.join(HOME, 'Dev'),
  path.join(HOME, 'dev'),
  path.join(HOME, 'Roblox'),
  FORGE_PROJECTS_ROOT,
];

function isPathAllowed(targetPath) {
  return isExistingDirectoryWithinRoots(targetPath, ALLOWED_ROOTS);
}

function sanitizePrompt(prompt) {
  return prompt.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f]/g, '').trim();
}

let forgeSystemPromptCache = null;

function loadForgeSystemPrompt() {
  if (forgeSystemPromptCache) return forgeSystemPromptCache;
  const candidates = [
    path.join(__dirname, 'forge-system-prompt.md'),
    path.join(process.resourcesPath || '', 'forge-system-prompt.md'),
  ];
  const promptPath = candidates.find(candidate => fs.existsSync(candidate));
  if (!promptPath) throw new Error('Fichier forge-system-prompt.md introuvable.');
  forgeSystemPromptCache = fs.readFileSync(promptPath, 'utf8').trim();
  return forgeSystemPromptCache;
}

function prepareForgeAgentInstructions(projectPath, agentType) {
  try {
    return syncForgeAgentInstructions(projectPath, agentType, loadForgeSystemPrompt());
  } catch (err) {
    console.error(`[Agents] Instructions Forge non installees pour ${agentType}:`, err.message);
    return { error: err.message };
  }
}

// ============================================
// REGISTRE DES PROJETS
// ============================================
function getProjectsRegistryPath() {
  return userDataFile('projects-registry.json');
}

function loadProjectsRegistry() {
  const p = getProjectsRegistryPath();
  if (!fs.existsSync(p)) return [];
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
  catch (e) { return []; }
}

function saveProjectsRegistry(projects) {
  fs.writeFileSync(getProjectsRegistryPath(), JSON.stringify(projects, null, 2));
}

function addProjectToRegistry(name, projectPath) {
  const registry = loadProjectsRegistry();
  const existing = registry.find(p => p.path === projectPath);
  if (!existing) {
    registry.push({
      name,
      path: projectPath,
      createdAt: new Date().toISOString(),
      linkedStudio: null
    });
    saveProjectsRegistry(registry);
  }
}

// ============================================
// AGENT MANAGER — Bridge local
// ============================================
class AgentManager {
  constructor() {
    this.sessions = new Map();
    this.win = null;
  }

  setWindow(win) {
    this.win = win;
  }

  async detect(agentType) {
    const cmd = this._getCommand(agentType);
    return new Promise((resolve) => {
      const child = spawn(cmd, ['--version'], { shell: true, timeout: 8000 });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', d => stdout += d.toString());
      child.stderr.on('data', d => stderr += d.toString());
      child.on('close', (code) => {
        if (code === 0) {
          resolve({ installed: true, version: stdout.trim() || stderr.trim() });
        } else {
          resolve({ installed: false });
        }
      });
      child.on('error', () => resolve({ installed: false }));
    });
  }

  async launch(agentType, projectPath, prompt, options = {}) {
    if (!isPathAllowed(projectPath)) {
      return { error: 'Chemin de projet non autorise. Place ton projet dans Documents, Desktop, ou un dossier de developpement.' };
    }

    const safePrompt = sanitizePrompt(prompt);
    if (!safePrompt) {
      return { error: 'Prompt vide' };
    }

    const sessionId = `sess_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    try {
      if (!options.skipForgeInstructions) {
        prepareForgeAgentInstructions(projectPath, agentType);
      }
      const { cmd, args, stdin } = this._buildCommand(agentType, safePrompt, options);
      const proc = spawn(cmd, args, {
        cwd: projectPath,
        shell: true,
        env: { ...process.env, FORCE_COLOR: '1', CLICOLOR_FORCE: '1' }
      });

      this.sessions.set(sessionId, {
        process: proc,
        agentType,
        projectPath,
        startTime: Date.now(),
        buffer: []
      });

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        this._emit(sessionId, 'stdout', chunk);
        const sess = this.sessions.get(sessionId);
        if (sess) sess.buffer.push({ t: 'out', d: chunk, ts: Date.now() });
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        this._emit(sessionId, 'stderr', chunk);
        const sess = this.sessions.get(sessionId);
        if (sess) sess.buffer.push({ t: 'err', d: chunk, ts: Date.now() });
      });

      proc.on('close', (code) => {
        this._emit(sessionId, 'exit', { code });
        const sess = this.sessions.get(sessionId);
        if (sess) {
          sess.exitCode = code;
          sess.endTime = Date.now();
          // Les générations de l'atelier Visuels doivent se terminer même si
          // l'utilisateur a quitté la page qui effectuait le polling.
          setTimeout(() => finalizeCodexMediaSession(sess.projectPath, sessionId), 750);
        }
      });

      if (stdin !== undefined && proc.stdin) proc.stdin.end(stdin);

      proc.on('error', (err) => {
        const msg = err.code === 'ENOENT'
          ? `Commande introuvable : "${cmd}". Verifie que l'agent est bien installe.`
          : err.message;
        this._emit(sessionId, 'error', msg);
        const sess = this.sessions.get(sessionId);
        if (sess) {
          sess.error = msg;
          sess.exitCode = -1;
          sess.endTime = Date.now();
        }
      });

      return { success: true, sessionId };

    } catch (err) {
      return { error: err.message };
    }
  }

  async stop(sessionId) {
    const sess = this.sessions.get(sessionId);
    if (!sess) return { error: 'Session inconnue' };
    try {
      sess.process.kill('SIGTERM');
      setTimeout(() => {
        if (!sess.process.killed) sess.process.kill('SIGKILL');
      }, 3000);
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }

  getStatus(sessionId) {
    const sess = this.sessions.get(sessionId);
    if (!sess) return { exists: false };
    return {
      exists: true,
      agentType: sess.agentType,
      projectPath: sess.projectPath,
      running: !sess.process.killed && sess.exitCode === undefined,
      exitCode: sess.exitCode,
      duration: Date.now() - sess.startTime,
      error: sess.error || null,
      outputTail: sess.buffer.slice(-12).map(chunk => chunk.d).join('').slice(-2000)
    };
  }

  listSessions() {
    const list = [];
    for (const [id, sess] of this.sessions) {
      list.push({
        sessionId: id,
        agentType: sess.agentType,
        projectPath: sess.projectPath,
        running: !sess.process.killed && sess.exitCode === undefined,
        startTime: sess.startTime
      });
    }
    return list;
  }

  async install(agentType) {
    const packages = {
      claude: '@anthropic-ai/claude-code',
      codex: '@openai/codex',
      antigravity: 'agy'
    };
    const pkg = packages[agentType];
    if (!pkg) return { error: 'Agent inconnu' };

    const hasNpm = await this._checkNpm();
    if (!hasNpm) {
      return { error: 'Node.js / npm non detecte. Installe Node.js depuis nodejs.org puis reessaie.' };
    }

    return new Promise((resolve) => {
      this._emitInstall(agentType, 'start', `Installation de ${pkg}...`);
      const proc = spawn('npm', ['install', '-g', pkg], { shell: true });
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        const chunk = data.toString();
        stdout += chunk;
        this._emitInstall(agentType, 'progress', chunk);
      });

      proc.stderr.on('data', (data) => {
        const chunk = data.toString();
        stderr += chunk;
        this._emitInstall(agentType, 'progress', chunk);
      });

      proc.on('close', (code) => {
        if (code === 0) {
          this._emitInstall(agentType, 'done', 'Installation terminee');
          resolve({ success: true });
        } else {
          this._emitInstall(agentType, 'error', stderr || `Code de sortie ${code}`);
          resolve({ error: stderr || `Installation echouee (code ${code})` });
        }
      });

      proc.on('error', (err) => {
        this._emitInstall(agentType, 'error', err.message);
        resolve({ error: err.message });
      });
    });
  }

  async _checkNpm() {
    return new Promise((resolve) => {
      const child = spawn('npm', ['--version'], { shell: true, timeout: 5000 });
      child.on('close', (code) => resolve(code === 0));
      child.on('error', () => resolve(false));
    });
  }

  _getCommand(agentType) {
    if (agentType === 'antigravity') {
      const cmd = resolveAgyCommand();
      return /\s/.test(cmd) ? '"' + cmd + '"' : cmd;
    }
    const map = { claude: 'claude', codex: 'codex' };
    return map[agentType] || agentType;
  }

  _buildCommand(agentType, prompt, options = {}) {
    const mcpServerPath = getMcpServerPath();
    if (!mcpServerPath && !options.skipMcp) {
      throw new Error('Serveur MCP Roblox introuvable. Reinstalle Forge ou reconstruis robloxstudio-mcp.');
    }

    switch (agentType) {
      case 'claude': {
        // Claude charge ce fichier pour cette session uniquement : on ne modifie
        // pas la configuration MCP personnelle de l'utilisateur.
        const configPath = writeAgentMcpConfig(mcpServerPath);
        return {
          cmd: 'claude',
          args: [
            '--mcp-config', configPath,
            '--strict-mcp-config',
            '--allowedTools', 'mcp__forge_roblox,mcp__forge_roblox__*',
            '--permission-mode', 'acceptEdits',
            '-p', prompt
          ]
        };
      }
      case 'codex':
        // Codex 0.150+ utilise 'codex mcp add' pour configurer les serveurs MCP
        // et --dangerously-bypass-approvals-and-sandbox au lieu de --full-auto.
        if (mcpServerPath && !options.skipMcp) ensureCodexMcpEntry(mcpServerPath);
        return { cmd: 'codex', ...buildCodexExec(prompt, options.images) };
      case 'antigravity':
        // agy lit ses serveurs MCP dans ~/.gemini/config/mcp_config.json
        // (pas de flag --mcp-config) : on y enregistre forge_roblox avant.
        ensureAgyMcpEntry(mcpServerPath);
        return { cmd: resolveAgyCommand(), args: ['--dangerously-skip-permissions', prompt] };
      default:
        throw new Error('Agent inconnu : ' + agentType);
    }
  }

  _emit(sessionId, type, data) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('agent-stream', { sessionId, type, data, ts: Date.now() });
    }
  }

  _emitInstall(agentType, stage, data) {
    if (this.win && !this.win.isDestroyed()) {
      this.win.webContents.send('agent-install', { agentType, stage, data, ts: Date.now() });
    }
  }

  openTerminal(agentType, projectPath) {
    if (!isPathAllowed(projectPath)) {
      return { error: 'Chemin de projet non autorise.' };
    }
    prepareForgeAgentInstructions(projectPath, agentType);
    const cmd = buildAgentShellCommand(agentType) || this._getCommand(agentType);
    const platform = process.platform;

    try {
      if (platform === 'win32') {
        spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', `cd /d "${projectPath}" && ${cmd}`], {
          shell: false,
          detached: true,
          windowsHide: false
        });
      } else if (platform === 'darwin') {
        const script = `cd "${projectPath}" && ${cmd}`;
        spawn('osascript', ['-e', `tell application "Terminal" to do script "${script}"`], {
          shell: false,
          detached: true
        });
      } else {
        spawn('gnome-terminal', ['--', 'bash', '-c', `cd "${projectPath}" && ${cmd}; exec bash`], {
          shell: false,
          detached: true
        });
      }
      return { success: true };
    } catch (err) {
      return { error: err.message };
    }
  }
}

const agentManager = new AgentManager();

// ============================================
// IPC HANDLERS — Agents
// ============================================
ipcMain.handle('open-agent-terminal', async (event, agentType, projectPath) => {
  return agentManager.openTerminal(agentType, projectPath);
});

ipcMain.handle('agent-detect', async (event, agentType) => {
  return await agentManager.detect(agentType);
});

ipcMain.handle('agent-detect-all', async () => {
  const agents = ['claude', 'codex', 'antigravity'];
  const results = {};
  for (const a of agents) {
    results[a] = await agentManager.detect(a);
  }
  return results;
});

ipcMain.handle('agent-launch', async (event, agentType, projectPath, prompt) => {
  return await agentManager.launch(agentType, projectPath, prompt);
});

ipcMain.handle('agent-stop', async (event, sessionId) => {
  return await agentManager.stop(sessionId);
});

ipcMain.handle('agent-status', async (event, sessionId) => {
  return agentManager.getStatus(sessionId);
});

ipcMain.handle('agent-list', async () => {
  return agentManager.listSessions();
});

// ============================================
// PERSISTANCE DES AGENTS (workspace navigation)
// ============================================
ipcMain.handle('save-agent-state', async (event, agentsState) => {
  try {
    const p = userDataFile('agents-state.json');
    fs.writeFileSync(p, JSON.stringify(agentsState, null, 2));
    return { success: true };
  } catch (err) {
    console.error('[Agents] Erreur sauvegarde etat:', err.message);
    return { error: err.message };
  }
});

ipcMain.handle('load-agent-state', async () => {
  try {
    const p = userDataFile('agents-state.json');
    if (!fs.existsSync(p)) return { agents: [] };
    const data = JSON.parse(fs.readFileSync(p, 'utf8'));
    // Conserver les panneaux en attente et ne rattacher que les PTY encore actifs.
    const restored = (data.agents || []).map((agent) => ({
      ...agent,
      sessionId: agent.sessionId && PTYS.has(agent.sessionId) ? agent.sessionId : null,
    }));
    return { ...data, agents: restored };
  } catch (err) {
    console.error('[Agents] Erreur chargement etat:', err.message);
    return { agents: [] };
  }
});

ipcMain.handle('clear-agent-state', async () => {
  try {
    const p = userDataFile('agents-state.json');
    if (fs.existsSync(p)) fs.unlinkSync(p);
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// Reconnecter les PTY existants a un nouveau renderer (navigation workspace)
ipcMain.handle('reconnect-pty', async (event, sessionId) => {
  const ptyEntry = PTYS.get(sessionId);
  if (!ptyEntry) return { error: 'Session PTY introuvable' };
  const sender = event.sender;
  // Remplacer le callback onData pour envoyer au nouveau renderer
  ptyEntry.pty.onData((data) => {
    if (!sender.isDestroyed()) {
      sender.send('pty-data', { sessionId, data });
    }
  });
  ptyEntry.pty.onExit(({ exitCode, signal }) => {
    if (!sender.isDestroyed()) {
      sender.send('pty-exit', { sessionId, exitCode, signal });
    }
    PTYS.delete(sessionId);
  });
  return { success: true };
});

ipcMain.handle('agent-install', async (event, agentType) => {
  return await agentManager.install(agentType);
});

// ============================================
// STOCKAGE CLES API
// ============================================
function getApiKeysPath() {
  return userDataFile('api-keys.json');
}

function loadApiKeys() {
  const p = getApiKeysPath();
  if (!fs.existsSync(p)) return {};
  try {
    const file = JSON.parse(fs.readFileSync(p, 'utf8'));
    const keys = {};
    if (!safeStorage.isEncryptionAvailable()) return file;
    for (const [service, encryptedB64] of Object.entries(file)) {
      try {
        const encryptedBuffer = Buffer.from(encryptedB64, 'base64');
        keys[service] = safeStorage.decryptString(encryptedBuffer);
      } catch (err) {
        console.error(`[API Keys] Impossible de dechiffrer "${service}" :`, err.message);
      }
    }
    return keys;
  } catch (err) {
    console.error('[API Keys] Erreur chargement :', err.message);
    return {};
  }
}

function saveApiKeys(keys) {
  const p = getApiKeysPath();
  if (!safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(p, JSON.stringify(keys, null, 2));
    return;
  }
  const encrypted = {};
  for (const [service, key] of Object.entries(keys)) {
    try {
      const buffer = safeStorage.encryptString(key);
      encrypted[service] = buffer.toString('base64');
    } catch (err) {
      console.error(`[API Keys] Impossible de chiffrer "${service}" :`, err.message);
    }
  }
  fs.writeFileSync(p, JSON.stringify(encrypted, null, 2));
}

ipcMain.handle('save-api-key', async (event, service, key) => {
  const keys = loadApiKeys();
  keys[service] = key;
  saveApiKeys(keys);

  // Redemarrer le serveur MCP si une cle qu'il utilise a changee,
  // pour que la nouvelle cle soit prise en compte.
  if ((service === 'tripo' || service === 'roblox') && mcpServerProcess) {
    console.log(`[MCP] Redemarrage du serveur (cle "${service}" modifiee)`);
    mcpServerProcess.kill();
    mcpServerProcess = null;
    mcpServerReady = false;
    mcpInitialized = false;
    mcpPending.clear();
    startMcpServer();
  }

  return { success: true };
});

ipcMain.handle('get-api-keys', async () => loadApiKeys());

ipcMain.handle('verify-api-key', async (event, service, key) => {
  if (!key || key.trim().length < 8) return { valid: false, error: 'Cle trop courte' };
  const k = key.trim();

  try {
    switch (service) {
      case 'tripo': {
        // GET sur un taskId fake : 401+1002 = clé invalide, sinon = clé valide
        const r = await fetchWithTimeout('https://api.tripo3d.ai/v2/openapi/task/fake_test_id', {
          headers: { 'Authorization': `Bearer ${k}` }
        }, 15000);
        const d = await r.json();
        if (d.code === 1002) return { valid: false, error: 'Clé Tripo invalide' };
        return { valid: true };
      }
      case 'gemini': {
        const r = await fetchWithTimeout(`https://generativelanguage.googleapis.com/v1beta/models?key=${k}`, {}, 15000);
        const d = await r.json();
        if (r.ok && d.models) return { valid: true };
        return { valid: false, error: d.error?.message || 'Cle Gemini invalide' };
      }
      case 'elevenlabs': {
        const r = await fetchWithTimeout('https://api.elevenlabs.io/v1/user', {
          headers: { 'xi-api-key': k }
        }, 15000);
        const d = await r.json();
        if (r.ok && d.subscription) return { valid: true };
        return { valid: false, error: d.detail?.message || 'Cle ElevenLabs invalide' };
      }
      default:
        return { valid: false, error: 'Service inconnu' };
    }
  } catch (err) {
    return { valid: false, error: 'Erreur reseau : ' + (err.message || err) };
  }
});

// ============================================
// SUPABASE AUTH
// ============================================
// DONNÉES PAR COMPTE — chaque compte possède ses propres dossiers et
// fichiers (projets, clés API, connexions Roblox / GitHub). On résout
// toujours le chemin via le compte connecté, ce qui isole totalement
// les données d'un utilisateur à l'autre. Quand un compte revient,
// ses données sont déjà là, dans son sous-dossier dédié.
const USER_DATA_ROOT = path.join(app.getPath('userData'), 'forge-users');

function getCurrentUserKey() {
  const session = loadForgeSession();
  if (session && session.user && (session.user.id || session.user.email)) {
    return String(session.user.id || session.user.email).replace(/[^\w@.\-]+/g, '_');
  }
  return null;
}

// Répertoire de données du compte courant (null tant qu'aucun compte).
function getUserDataDir() {
  const key = getCurrentUserKey();
  return key ? path.join(USER_DATA_ROOT, key) : null;
}

// Résout un fichier de données propre au compte courant et garantit que
// son dossier existe. Sans compte (avant connexion), retombe global.
function userDataFile(name) {
  const dir = getUserDataDir();
  if (dir) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
    return path.join(dir, name);
  }
  return path.join(app.getPath('userData'), name);
}

// Racine des projets propre au compte courant.
function getUserProjectsRoot() {
  const key = getCurrentUserKey();
  return key ? path.join(FORGE_PROJECTS_ROOT, key) : FORGE_PROJECTS_ROOT;
}

function removeIfExists(p) {
  try { if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
}

// Migration une fois : si le dossier du compte est vide mais que des
// données existent dans l'ancien emplacement global, on les rapatrie.
function migrateLegacyData() {
  const dir = getUserDataDir();
  if (!dir) return;
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
  const legacyFiles = [
    'api-keys.json', 'roblox-token.json', 'github-token.json',
    'projects-registry.json', 'active-project.json'
  ];
  let migrated = false;
  for (const name of legacyFiles) {
    const dest = path.join(dir, name);
    const src = path.join(__dirname, name);
    if (!fs.existsSync(dest) && fs.existsSync(src)) {
      try { fs.copyFileSync(src, dest); migrated = true; } catch (e) {}
    }
  }
  if (migrated) console.log('[UserData] Données existantes rapatriées vers', dir);
}

// ============================================
// LICENCE STRIPE + SUPABASE (paywall création de compte)
// Les clés sont générées par le webhook Stripe → Supabase Edge Function.
// L'app vérifie la clé contre la table license_keys via Supabase REST.
// ============================================

function getLicenseUrl() {
  return process.env.FORGE_LICENSE_URL || 'https://forgestudioapp.github.io/forge-desktop-app/forge/get-license.html';
}

function getStripeStoreUrl() {
  return process.env.STRIPE_STORE_URL || 'https://forgestudioapp.itch.io/forge';
}

function getLicenseFilePath() {
  return path.join(app.getPath('userData'), 'forge-license.json');
}

function readLicenseFile() {
  const p = getLicenseFilePath();
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { return null; }
}

function getSupabaseConfig() {
  const url = (process.env.SUPABASE_URL || 'https://quzbsdcjtkmdeuiyyhnv.supabase.co').replace(/\/$/, '');
  const anonKey = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1emJzZGNqdGttZGV1aXl5aG52Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODYwMjAwNTksImV4cCI6MjEwMTU5NjA1OX0.ToM71JAeMxTQNFatqcnSPK2xLQIye8vRU1nDmoyyMbE';
  if (!url || !anonKey) return null;
  return { url, anonKey, serviceKey: anonKey };
}

async function supabaseVerifyLicense(licenseKey) {
  const { url, serviceKey } = getSupabaseConfig();
  if (!url || !serviceKey) {
    return { valid: false, error: 'Supabase non configuré (variables d\'environnement manquantes)' };
  }
  const endpoint = `${url}/rest/v1/rpc/verify_license`;
  const res = await fetchWithTimeout(endpoint, {
    method: 'POST',
    headers: {
      'apikey': serviceKey,
      'Authorization': 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ key: licenseKey }),
  }, 15000);
  if (!res.ok) {
    const txt = await res.text();
    return { valid: false, error: 'Erreur Supabase : ' + txt.slice(0, 150) };
  }
  const rows = await res.json().catch(() => []);
  if (!rows.length) return { valid: false, error: 'Clé introuvable.' };
  const r = rows[0];
  return { valid: r.valid, status: r.license_status, email: r.license_email, plan: r.license_plan };
}

function licenseError(msg) {
  return typeof msg === 'string' ? msg : 'Clé de licence invalide.';
}

ipcMain.handle('buy-license', async () => {
  const { shell } = require('electron');
  shell.openExternal(getStripeStoreUrl());
  return { success: true };
});

ipcMain.handle('verify-license', async (event, licenseKey) => {
  if (!licenseKey || typeof licenseKey !== 'string') {
    return { error: 'Entre ta clé de licence reçue après l\'achat.' };
  }
  const existing = readLicenseFile();
  if (existing && existing.key === licenseKey) {
    return { success: true, license: existing };
  }
  try {
    const result = await supabaseVerifyLicense(licenseKey.trim());
    if (result.valid) {
      const license = {
        key: licenseKey.trim(),
        email: result.email || null,
        plan: result.plan || 'pro',
        activatedAt: new Date().toISOString()
      };
      fs.writeFileSync(getLicenseFilePath(), JSON.stringify(license, null, 2));
      return { success: true, license };
    }
    return { error: licenseError(result.error || 'Clé inactive ou expirée.') };
  } catch (err) {
    return { error: 'Impossible de valider la licence (hors-ligne ?) : ' + err.message };
  }
});

ipcMain.handle('license-status', async () => {
  const license = readLicenseFile();
  if (!license) return { licensed: false };
  try {
    const result = await supabaseVerifyLicense(license.key);
    return { licensed: !!result.valid, license };
  } catch (e) {
    return { licensed: true, license, offline: true };
  }
});

ipcMain.handle('supabase-auth', async (event, mode, email, password, licenseKey) => {
  const { url: supabaseUrl, serviceKey: supabaseKey } = getSupabaseConfig();
  if (!supabaseUrl || !supabaseKey) {
    return { error: 'Configuration Supabase manquante dans .env' };
  }

  // Paywall : la création de compte Forge exige une clé de licence active.
  if (mode === 'signup') {
    if (!licenseKey || typeof licenseKey !== 'string' || !licenseKey.trim()) {
      return { error: 'Une licence doit être achetée pour créer un compte (bouton "Acheter une licence").' };
    }
    const existing = readLicenseFile();
    if (!existing || existing.key !== licenseKey.trim()) {
      try {
        const result = await supabaseVerifyLicense(licenseKey.trim());
        if (!result.valid) {
          return { error: 'Clé de licence invalide : ' + (result.error || 'clé inactive ou expirée') };
        }
      } catch (err) {
        return { error: 'Impossible de valider la licence (hors-ligne ?) : ' + err.message };
      }
    }
  }

    const endpoint = mode === 'signup'
    ? `${supabaseUrl}/auth/v1/signup`
    : `${supabaseUrl}/auth/v1/token?grant_type=password`;
  try {
    const response = await fetchWithTimeout(endpoint, {
      method: 'POST',
      headers: { 'apikey': supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    }, 15000);
    const data = await response.json();
    if (!response.ok) {
      return { error: data.error_description || data.msg || 'Erreur de connexion' };
    }
    // Apres creation de compte, marquer la cle comme utilisee
    if (mode === 'signup' && licenseKey) {
      try {
        const { url: svcUrl, serviceKey: svcKey } = getSupabaseConfig();
        if (svcUrl && svcKey) {
          await fetchWithTimeout(`${svcUrl}/rest/v1/rpc/consume_license`, {
            method: 'POST',
            headers: { 'apikey': svcKey, 'Authorization': 'Bearer ' + svcKey, 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: licenseKey.trim(), user_email: email }),
          }, 10000);
        }
      } catch (e) { /* best effort */ }
    }
    const sessionPath = path.join(app.getPath('userData'), 'forge-session.json');
    fs.writeFileSync(sessionPath, JSON.stringify(data));
    // Rapatrie d'éventuelles données d'un ancien emplacement global.
    migrateLegacyData();
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('is-forge-connected', async () => {
  const sessionPath = path.join(app.getPath('userData'), 'forge-session.json');
  if (!fs.existsSync(sessionPath)) return { connected: false };
  try {
    const session = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    return { connected: true, email: session.user?.email || null };
  } catch (e) {
    return { connected: true, email: null };
  }
});

ipcMain.handle('logout-forge', async () => {
  // Chaque compte garde ses données dans son propre dossier : on ne
  // supprime rien de ses fichiers. On met fin à la session en cours :
  // - coupe le pont MCP (le compte déconnecté n'est plus utilisé),
  // - oublie le token Roblox en mémoire,
  // - efface le flux de connexion GitHub en attente,
  // - supprime la session Forge (on repasse au login).
  if (mcpServerProcess) {
    mcpServerProcess.kill();
    mcpServerProcess = null;
    mcpServerReady = false;
    mcpInitialized = false;
  }
  if (syncMcpProcess) {
    syncMcpProcess.kill();
    syncMcpProcess = null;
    syncMcpReady = false;
    syncMcpInitialized = false;
  }
  global.robloxAccessToken = null;
  clearGithubDevice();

  const sessionPath = path.join(app.getPath('userData'), 'forge-session.json');
  removeIfExists(sessionPath);

  // Nettoyer l'etat des agents
  try {
    const agentsStatePath = userDataFile('agents-state.json');
    removeIfExists(agentsStatePath);
  } catch (e) {}

  return { success: true };
});

// ============================================
// ROBOLOX OAUTH
// ============================================
const crypto = require('crypto');
const http = require('http');
const { shell } = require('electron');
const ROBLOX_CLIENT_ID = '7245830824313073651';
const ROBLOX_REDIRECT_URI = 'http://localhost:3000/oauth/callback';

function base64url(buffer) {
  return buffer.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

ipcMain.handle('connect-roblox', async () => {
  return new Promise((resolve) => {
    const codeVerifier = base64url(crypto.randomBytes(32));
    const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
    const state = base64url(crypto.randomBytes(16));
    const nonce = base64url(crypto.randomBytes(16));
    const authUrl = buildRobloxAuthorizationUrl({
      clientId: ROBLOX_CLIENT_ID,
      redirectUri: ROBLOX_REDIRECT_URI,
      codeChallenge,
      state,
      nonce,
    });

    let settled = false;
    const settle = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      try { server.close(); } catch {}
      resolve(value);
    };

    // Timeout de secours : si l'utilisateur ferme l'onglet ou abandonne le
    // flux OAuth, l'app ne reste pas bloquee sur "Connexion..." en attente.
    const timeout = setTimeout(() => {
      settle({ error: 'Connexion Roblox annulee (delai de 3 minutes depasse). Reessaie.' });
    }, 180000);

    const server = http.createServer(async (req, res) => {
      const callback = parseRobloxOAuthCallback(req.url || '/', ROBLOX_REDIRECT_URI, state);
      if (callback.ignored) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      if (callback.error || !callback.code) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end('<html><body style="background:#14110E;color:#F3EDE3;font-family:sans-serif;"><h2>Connexion Roblox refusée ou invalide.</h2></body></html>');
        settle({ error: callback.error || 'Aucun code reçu de Roblox.' });
        return;
      }
      try {
        const tokenResponse = await fetchWithTimeout('https://apis.roblox.com/oauth/v1/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: ROBLOX_CLIENT_ID, code: callback.code, grant_type: 'authorization_code',
            redirect_uri: ROBLOX_REDIRECT_URI, code_verifier: codeVerifier
          })
        }, 15000);
        const tokenData = await tokenResponse.json();
        if (!tokenResponse.ok) {
          res.end('<html><body style="background:#14110E;color:#F3EDE3;font-family:sans-serif;"><h2>Echec de l\'echange du jeton.</h2></body></html>');
          settle({ error: JSON.stringify(tokenData) }); return;
        }
        const normalizedToken = normalizeRobloxTokenData(tokenData);
        const missingScopes = missingRobloxTokenScopes(normalizedToken);
        const tokenPath = userDataFile('roblox-token.json');
        fs.writeFileSync(tokenPath, JSON.stringify({ ...normalizedToken, obtained_at: Date.now() }));
        global.robloxAccessToken = normalizedToken.access_token;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        const permissionNotice = missingScopes.length
          ? '<p>Certaines permissions n’ont pas été accordées. Tu pourras reconnecter le compte depuis Forge.</p>'
          : '';
        res.end('<html><body style="background:#14110E;color:#F3EDE3;font-family:sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;"><h2>Connexion Roblox réussie, tu peux fermer cet onglet.</h2>' + permissionNotice + '</body></html>');
        settle({ success: true, permissionsReady: missingScopes.length === 0, missingScopes });
      } catch (err) {
        res.end('<html><body style="background:#14110E;color:#F3EDE3;font-family:sans-serif;"><h2>Erreur technique.</h2></body></html>');
        settle({ error: err.message });
      }
    });
    server.on('error', (err) => {
      const msg = err.code === 'EADDRINUSE'
        ? 'Le port 3000 est deja utilise. Ferme l\'autre application (Roblox Studio ?) puis reessaie de connecter.'
        : 'Erreur serveur OAuth : ' + err.message;
      console.error('[Roblox] echec serveur OAuth:', err.message);
      settle({ error: msg });
    });
    server.listen(3000, '127.0.0.1', () => shell.openExternal(authUrl));
  });
});

ipcMain.handle('is-roblox-connected', async () => {
  const tokenPath = userDataFile('roblox-token.json');
  if (!fs.existsSync(tokenPath)) return { connected: false };
  try {
    const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
    const missingScopes = missingRobloxTokenScopes(tokenData);
    return {
      connected: Boolean(tokenData.access_token),
      permissionsReady: missingScopes.length === 0,
      missingScopes,
    };
  } catch {
    return { connected: false };
  }
});

ipcMain.handle('disconnect-roblox', async () => {
  const tokenPath = userDataFile('roblox-token.json');
  try {
    if (fs.existsSync(tokenPath)) {
      const tokenData = JSON.parse(fs.readFileSync(tokenPath, 'utf8'));
      // Best-effort : revoque la session cote Roblox, sans bloquer la deconnexion locale.
      const tokenToRevoke = tokenData.refresh_token || tokenData.access_token;
      if (tokenToRevoke) {
        await fetchWithTimeout('https://apis.roblox.com/oauth/v1/token/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: tokenToRevoke, client_id: ROBLOX_CLIENT_ID })
        }, 5000).catch(() => {});
      }
      fs.unlinkSync(tokenPath);
    }
    global.robloxAccessToken = null;
    return { success: true };
  } catch (err) {
    return { error: err.message };
  }
});

// ============================================
// GITHUB OAUTH
// ============================================
const GITHUB_CLIENT_ID = 'Ov23liEBYcGFFSTwIidX';
function getGithubTokenPath() { return userDataFile('github-token.json'); }
function getGithubDevicePath() { return userDataFile('github-device.json'); }
let githubPollingPromise = null;

function loadGithubDevice() {
  try { if (fs.existsSync(getGithubDevicePath())) return JSON.parse(fs.readFileSync(getGithubDevicePath(), 'utf8')); }
  catch (e) {}
  return null;
}
function saveGithubDevice(data) { fs.writeFileSync(getGithubDevicePath(), JSON.stringify(data, null, 2)); }
function clearGithubDevice() { removeIfExists(getGithubDevicePath()); }

function notifyAllWindows(channel, ...args) {
  BrowserWindow.getAllWindows().forEach(win => {
    if (!win.isDestroyed()) win.webContents.send(channel, ...args);
  });
}

async function runGithubPolling() {
  if (githubPollingPromise) return githubPollingPromise;
  githubPollingPromise = new Promise(async (resolve) => {
    const deviceData = loadGithubDevice();
    if (!deviceData) { resolve({ error: 'Aucune connexion en cours' }); githubPollingPromise = null; return; }
    let interval = deviceData.interval || 5;
    const expiresIn = deviceData.expires_in || 900;
    const startTime = Date.now();
    let attempts = 0;
    const maxAttempts = Math.ceil(expiresIn / interval) + 10;
    while (attempts < maxAttempts && (Date.now() - startTime) < (expiresIn * 1000)) {
      await new Promise(r => setTimeout(r, interval * 1000));
      attempts++;
      try {
        const tokenResponse = await fetchWithTimeout('https://github.com/login/oauth/access_token', {
          method: 'POST',
          headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
          body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, device_code: deviceData.device_code, grant_type: 'urn:ietf:params:oauth:grant-type:device_code' })
        }, 15000);
        const tokenData = await tokenResponse.json();
        if (tokenData.access_token) {
          fs.writeFileSync(getGithubTokenPath(), JSON.stringify(tokenData));
          clearGithubDevice(); notifyAllWindows('github-auth-success');
          resolve({ success: true }); githubPollingPromise = null; return;
        }
        if (tokenData.error) {
          if (tokenData.error === 'authorization_pending') continue;
          if (tokenData.error === 'slow_down') { interval += 5; continue; }
          if (tokenData.error === 'expired_token') { clearGithubDevice(); notifyAllWindows('github-auth-error', 'Le code a expire.'); resolve({ error: 'expired' }); githubPollingPromise = null; return; }
          if (tokenData.error === 'access_denied') { clearGithubDevice(); notifyAllWindows('github-auth-error', 'Acces refuse.'); resolve({ error: 'denied' }); githubPollingPromise = null; return; }
          clearGithubDevice(); notifyAllWindows('github-auth-error', tokenData.error); resolve({ error: tokenData.error }); githubPollingPromise = null; return;
        }
      } catch (err) { console.error('[GitHub] Erreur reseau polling:', err.message); }
    }
    clearGithubDevice(); notifyAllWindows('github-auth-error', 'Delai depasse.'); resolve({ error: 'timeout' }); githubPollingPromise = null;
  });
  return githubPollingPromise;
}

ipcMain.handle('github-start', async () => {
  githubPollingPromise = null;
  const deviceResponse = await fetchWithTimeout('https://github.com/login/device/code', {
    method: 'POST',
    headers: { 'Accept': 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({ client_id: GITHUB_CLIENT_ID, scope: 'repo' })
  }, 15000);
  const data = await deviceResponse.json();
  saveGithubDevice(data);
  shell.openExternal(data.verification_uri);
  return { userCode: data.user_code, verificationUri: data.verification_uri };
});

ipcMain.handle('github-poll', async () => await runGithubPolling());
ipcMain.handle('is-github-connected', async () => ({ connected: fs.existsSync(getGithubTokenPath()) }));
ipcMain.handle('get-github-device-status', async () => {
  const deviceData = loadGithubDevice();
  return {
    hasDeviceFlow: !!deviceData,
    connected: fs.existsSync(getGithubTokenPath()),
    userCode: deviceData ? deviceData.user_code : null,
    verificationUri: deviceData ? deviceData.verification_uri : null
  };
});

if (loadGithubDevice()) { console.log('[GitHub] Reprise du polling au demarrage...'); runGithubPolling(); }

// ============================================
// SYSTEME, PRE-REQUIS & PLUGIN ROBOLOX
// ============================================
// Tout ce qu'il faut verifier / installer lors de l'installation de Forge.
// L'onboarding affiche cette liste et propose une installation en un clic
// (winget pour Node/Python/Roblox, npm pour les agents IA).

const REQUIREMENT_MAP = {
  node:   { kind: 'winget', id: 'OpenJS.NodeJS.LTS',       label: 'Node.js LTS',  url: 'https://nodejs.org/' },
  python: { kind: 'winget', id: 'Python.Python.3.12',      label: 'Python 3',     url: 'https://www.python.org/downloads/' },
  roblox: { kind: 'winget', id: 'Roblox.RobloxStudio',     label: 'Roblox Studio', url: 'https://www.roblox.com/create' },
  agents: { kind: 'npm',    pkgs: ['@openai/codex', '@anthropic-ai/claude-code'], label: 'Agents IA (Codex + Claude Code)' }
};

// Detecte une commande systeme et retourne { installed, version, major, minor, ok }.
function detectVersion(cmd, args, parse) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args || ['--version'], { shell: true, timeout: 8000 });
    let out = '';
    child.stdout.on('data', d => out += d.toString());
    child.stderr.on('data', d => out += d.toString());
    child.on('error', () => resolve({ installed: false }));
    child.on('close', (code) => {
      if (code !== 0) return resolve({ installed: false });
      const first = (out.match(/\d+(\.\d+)+/) || [''])[0];
      const parsed = (parse ? parse(first) : {});
      return resolve({ installed: true, version: first, ...parsed });
    });
  });
}

const parseNodeVersion = (v) => {
  const m = /v?(\d+)/.exec(v);
  const major = m ? +m[1] : 0;
  return { major, ok: major >= 18 };
};

const parsePythonVersion = (v) => {
  const m = /(\d+)\.(\d+)/.exec(v);
  const major = m ? +m[1] : 0;
  const minor = m ? +m[2] : 0;
  return { major, minor, ok: major >= 3 && minor >= 9 };
};

// fetch avec timeout : evite que les appels reseau (licences, auth, Tripo)
// pendent indefiniment quand le reseau est gele ou le service hors-ligne.
async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Recharge PATH depuis le registre (utile apres une installation winget : le
// nouveau node/python/npm devient utilisable sans redemarrer l'app).
function refreshPathEnv() {
  const { execSync } = require('child_process');
  try {
    const hives = [
      'HKCU\\Environment',
      'HKLM\\SYSTEM\\CurrentControlSet\\Control\\Session Manager\\Environment'
    ];
    const added = [];
    for (const hive of hives) {
      const out = execSync(`reg query "${hive}" /v Path`, { encoding: 'utf8', windowsHide: true });
      const m = out.split(/\r?\n/).map(l => l.trim()).find(l => /^Path\s+REG_(EXPAND_)?SZ\s+/i.test(l));
      if (m) added.push(m.replace(/^Path\s+REG_(EXPAND_)?SZ\s+/i, ''));
    }
    if (added.length) process.env.PATH = added.concat(process.env.PATH).join(';');
    console.log('[System] PATH rechargé depuis le registre');
  } catch (err) {
    console.warn('[System] Relecture PATH impossible:', err.message);
  }
}

// Envoie une ligne de progression d'installation a toutes les fenetres.
function broadcastInstallProgress(item, line) {
  const text = String(line || '').trim();
  if (!text) return;
  for (const w of BrowserWindow.getAllWindows()) {
    if (w && !w.isDestroyed()) {
      try { w.webContents.send('install-progress', { item, line: text }); } catch (e) {}
    }
  }
}

function runSystemInstall(meta, args) {
  return new Promise((resolve) => {
    broadcastInstallProgress(meta.label, 'Démarrage de l\'installation…');
    const proc = spawn('winget', args, { shell: true, windowsHide: true });
    let chunkBuf = '';
    proc.stdout.on('data', d => { chunkBuf = (chunkBuf + d.toString()).slice(-6000); broadcastInstallProgress(meta.label, d.toString()); });
    proc.stderr.on('data', d => { chunkBuf = (chunkBuf + d.toString()).slice(-6000); broadcastInstallProgress(meta.label, d.toString()); });
    proc.on('error', (e) => resolve({ code: -1, tail: e.message }));
    proc.on('close', (code) => resolve({ code, tail: chunkBuf.slice(-300) }));
  });
}

ipcMain.handle('check-system', async () => {
  const robloxPath = process.env.LOCALAPPDATA + '\\Roblox';
  const robloxInstalled = fs.existsSync(robloxPath);
  const pluginsFolder = robloxPath + '\\Plugins';
  let pluginInstalled = false;
  if (robloxInstalled) {
    try {
      if (!fs.existsSync(pluginsFolder)) fs.mkdirSync(pluginsFolder, { recursive: true });
      const sourcePlugin = getForgePluginPath();
      const destPlugin = pluginsFolder + '\\ForgePlugin.rbxmx';
      if (sourcePlugin && fs.existsSync(sourcePlugin)) { fs.copyFileSync(sourcePlugin, destPlugin); pluginInstalled = true; }
      else if (fs.existsSync(destPlugin)) pluginInstalled = true;
    } catch (err) {
      pluginInstalled = fs.existsSync(pluginsFolder + '\\ForgePlugin.rbxmx');
    }
  }

  const node = await detectVersion('node', ['--version'], parseNodeVersion);
  const python = await detectVersion('python', ['--version'], parsePythonVersion);
  const winget = await detectVersion('winget', ['--version']);
  // Detection via AgentManager : il connait le vrai binaire de chaque agent
  // (antigravity est lance via 'agy', pas 'antigravity').
  const agents = {};
  for (const a of ['codex', 'claude', 'antigravity']) {
    agents[a] = await agentManager.detect(a);
  }
  const rembg = await detectVersion('rembg', ['--version']);

  // Reglage auto-rembg (fichier JSON dans le dossier utilisateur)
  let autoRemoveBg = false;
  try {
    const sPath = userDataFile('forge-settings.json');
    if (fs.existsSync(sPath)) {
      const s = JSON.parse(fs.readFileSync(sPath, 'utf8'));
      autoRemoveBg = !!s.autoRemoveBg;
    }
  } catch (e) {}

  return {
    os: { platform: process.platform, arch: process.arch, release: os.release() },
    robloxInstalled,
    pluginInstalled,
    nodeInstalled: node.installed,
    nodeVersion: node.version || '',
    nodeOk: !!node.ok,
    pythonInstalled: python.installed,
    pythonVersion: python.version || '',
    pythonOk: !!python.ok,
    wingetInstalled: winget.installed,
    rembgInstalled: rembg.installed,
    rembgVersion: rembg.version || '',
    autoRemoveBg,
    agents,
    message: robloxInstalled ? 'Roblox detecte' : 'Roblox non detecte'
  };
});

// Installation d'un pre-requis manquant depuis l'onboarding (un bouton par ligne).
ipcMain.handle('install-requirement', async (event, requirement) => {
  const meta = REQUIREMENT_MAP[requirement];
  if (!meta) return { error: 'Pré-requis inconnu: ' + requirement };

  try {
    if (meta.kind === 'winget') {
      const winget = await detectVersion('winget', ['--version']);
      if (!winget.installed) {
        broadcastInstallProgress(meta.label, 'winget est indisponible : ouverture de la page de téléchargement…');
        const { shell } = require('electron');
        shell.openExternal(meta.url);
        return { success: false, error: 'winget manquant. Installe le Windows App Installer depuis le Microsoft Store puis réessaie.' };
      }
      const res = await runSystemInstall(meta, [
        'install', '--id', meta.id, '-e', '--silent',
        '--accept-package-agreements', '--accept-source-agreements', '--disable-interactivity'
      ]);
      if (res.code !== 0) {
        broadcastInstallProgress(meta.label, 'Installation non aboutie (code ' + res.code + '). Ouverture de la page officielle…');
        const { shell } = require('electron');
        shell.openExternal(meta.url);
        return { success: false, error: res.tail };
      }
      refreshPathEnv();
      broadcastInstallProgress(meta.label, 'Installation terminée.');
      return { success: true };
    }

    if (meta.kind === 'npm') {
      const node = await detectVersion('node', ['--version']);
      if (!node.installed) {
        return { error: 'Installe d\'abord Node.js (nécessaire à npm).' };
      }
      for (const pkg of meta.pkgs) {
        const res = await runNpmGlobalInstall('Agent: ' + pkg, pkg);
        if (res.code !== 0) {
          broadcastInstallProgress(meta.label, 'Échec de ' + pkg + ' (code ' + res.code + ').');
          return { success: false, error: res.tail };
        }
      }
      broadcastInstallProgress(meta.label, 'Agents installés.');
      return { success: true };
    }

    return { error: 'Type de pré-requis inconnu' };
  } catch (err) {
    console.error('[System] install-requirement:', err);
    return { error: err.message };
  }
});

function runNpmGlobalInstall(item, pkg) {
  return new Promise((resolve) => {
    broadcastInstallProgress(item, 'npm install -g ' + pkg + '…');
    const proc = spawn('npm', ['install', '-g', pkg], { shell: true, windowsHide: true });
    let chunkBuf = '';
    proc.stdout.on('data', d => { chunkBuf = (chunkBuf + d.toString()).slice(-6000); broadcastInstallProgress(item, d.toString()); });
    proc.stderr.on('data', d => { chunkBuf = (chunkBuf + d.toString()).slice(-6000); broadcastInstallProgress(item, d.toString()); });
    proc.on('error', (e) => resolve({ code: -1, tail: e.message }));
    proc.on('close', (code) => resolve({ code, tail: chunkBuf.slice(-300) }));
  });
}

// ============================================
// MCP SERVER — CORRIGE
// ============================================
let mcpServerProcess = null;
let mcpServerReady = false;
let mcpRequestId = 0;
let mcpPending = new Map();
let mcpInitialized = false;

// ── 2e serveur MCP dedie au file sync (pas de queue avec les agents) ──
let syncMcpProcess = null;
let syncMcpReady = false;
let syncMcpRequestId = 0;
let syncMcpPending = new Map();
let syncMcpInitialized = false;

function getBundledResourcePath(...relativeParts) {
  const candidates = [
    // Production : les ressources sont placees a cote de l'executable, hors app.asar.
    path.join(process.resourcesPath || '', ...relativeParts),
    // Developpement : le serveur MCP est le projet frere de Forge.
    path.join(__dirname, '..', ...relativeParts),
    path.join(__dirname, ...relativeParts)
  ];
  return candidates.find(candidate => fs.existsSync(candidate)) || null;
}

function getMcpServerPath() {
  return getBundledResourcePath('robloxstudio-mcp', 'dist', 'index.js');
}

function getForgePluginPath() {
  return getBundledResourcePath('ForgePlugin.rbxmx');
}

function writeAgentMcpConfig(mcpServerPath) {
  const configDir = path.join(app.getPath('userData'), 'mcp');
  fs.mkdirSync(configDir, { recursive: true });
  const configPath = path.join(configDir, 'forge-roblox.json');
  const config = {
    mcpServers: {
      forge_roblox: { command: 'node', args: [mcpServerPath] }
    }
  };
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
  return configPath;
}

// agy (Antigravity) n'a pas de flag --mcp-config : ses serveurs MCP vivent
// dans ~/.gemini/config/mcp_config.json. On y enregistre (ou met a jour)
// l'entree forge_roblox avant chaque lancement — operation idempotente qui
// preserve les autres serveurs configures par l'utilisateur.
function ensureAgyMcpEntry(mcpServerPath) {
  try {
    const configPath = path.join(os.homedir(), '.gemini', 'config', 'mcp_config.json');
    let config = { mcpServers: {} };
    if (fs.existsSync(configPath)) {
      try {
        config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      } catch (e) {
        console.error('[Agents] mcp_config.json illisible, reecriture:', e.message);
      }
    }
    if (!config.mcpServers || typeof config.mcpServers !== 'object') {
      config.mcpServers = {};
    }
    config.mcpServers.forge_roblox = { command: 'node', args: [mcpServerPath], disabled: false };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), 'utf8');
    return true;
  } catch (e) {
    console.error('[Agents] Impossible de configurer agy MCP:', e.message);
    return false;
  }
}

// agy installe son vrai exe hors PATH npm ; le PATH herite par les terminaux
// de Forge peut etre obsolete (install/update recent) — on resolve le chemin
// complet pour eviter "Le systeme ne peut pas executer le programme specifie".
function resolveAgyCommand() {
  const agyExe = path.join(os.homedir(), 'AppData', 'Local', 'agy', 'bin', 'agy.exe');
  return fs.existsSync(agyExe) ? agyExe : 'agy';
}

// Enregistre le serveur MCP forge_roblox dans la config de Codex via
// 'codex mcp add' (idempotent : ne cree pas de doublon).
function ensureCodexMcpEntry(mcpServerPath) {
  try {
    const { spawnSync } = require('child_process');
    const res = spawnSync('codex', ['mcp', 'add', 'forge_roblox', '--', 'node', mcpServerPath], {
      shell: true, timeout: 10000, windowsHide: true
    });
    if (res.status === 0) {
      console.log('[Agents] MCP forge_roblox enregistre pour Codex.');
    } else {
      console.warn('[Agents] codex mcp add retourne', res.status, (res.stderr || '').toString().slice(0, 200));
    }
  } catch (e) {
    console.error('[Agents] Impossible d\'enregistrer le MCP Codex:', e.message);
  }
}

// Commande shell complete pour lancer un agent avec le pont Roblox Studio.
// Renvoie null si l'agent n'est pas branche au MCP ou si le serveur MCP est
// introuvable — l'appelant retombe alors sur la commande nue.
function buildAgentShellCommand(agentType) {
  const mcpServerPath = getMcpServerPath();
  if (!mcpServerPath) return null;

  if (agentType === 'claude') {
    const configPath = writeAgentMcpConfig(mcpServerPath);
    return 'claude --mcp-config "' + configPath + '" --strict-mcp-config'
      + ' --allowedTools "mcp__forge_roblox,mcp__forge_roblox__*"'
      + ' --permission-mode acceptEdits';
  }
  if (agentType === 'codex') {
    ensureCodexMcpEntry(mcpServerPath);
    return 'codex --dangerously-bypass-approvals-and-sandbox';
  }
  if (agentType === 'antigravity') {
    if (!ensureAgyMcpEntry(mcpServerPath)) return null;
    return '"' + resolveAgyCommand() + '" --dangerously-skip-permissions';
  }
  return null;
}

function startMcpServer() {
  if (mcpServerProcess) return;

  const finalPath = getMcpServerPath();

  if (!finalPath) {
    console.error('[MCP] Serveur introuvable dans les ressources Forge.');
    return;
  }

  console.log('[MCP] Demarrage du serveur:', finalPath);
  // Le serveur MCP utilise ces variables pour appeler les APIs Roblox avec
  // le compte OAuth connecte par l'utilisateur (page Comptes). Le fichier est
  // lu paresseusement, donc on passe toujours le chemin meme s'il n'existe pas
  // encore (l'utilisateur peut connecter son compte apres le demarrage).
  const mcpEnv = { ...process.env };
  mcpEnv.FORGE_ROBLOX_TOKEN_FILE = userDataFile('roblox-token.json');
  mcpEnv.FORGE_ROBLOX_CLIENT_ID = ROBLOX_CLIENT_ID;

  // Injecter les cles API sauvegardees par l'utilisateur (page Cles API).
  // Le serveur MCP lit TRIPO_API_KEY / ROBLOX_API_KEY via process.env ;
  // dotenv ne_ecrase pas une variable deja definie, donc celles-ci prennent
  // le pas sur le fichier .env du serveur MCP.
  const userApiKeys = loadApiKeys();
  if (userApiKeys.tripo) {
    mcpEnv.TRIPO_API_KEY = userApiKeys.tripo;
    console.log('[MCP] Cle Tripo3D injectee depuis api-keys.json');
  }
  if (userApiKeys.roblox) {
    mcpEnv.ROBLOX_API_KEY = userApiKeys.roblox;
    console.log('[MCP] Cle Roblox injectee depuis api-keys.json');
  }

  mcpServerProcess = spawn('node', [finalPath], { env: mcpEnv });

  // Le SDK MCP 0.6+ utilise NDJSON (un JSON par ligne terminee par \n)
  // et non le framing Content-Length type LSP.
  mcpServerProcess.stdout.on('data', (data) => {
    const lines = data.toString().split('\n');
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && mcpPending.has(msg.id)) {
          const { resolve, reject } = mcpPending.get(msg.id);
          mcpPending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (e) {
        console.log('[MCP Server] JSON parse error:', e.message, line.substring(0, 200));
      }
    }
  });

  mcpServerProcess.stderr.on('data', (data) => {
    const text = data.toString();
    const lines = text.split('\n');
    for (const line of lines) {
      if (line.startsWith('__FORGE_ACTIVITY__')) {
        try {
          const payload = JSON.parse(line.slice('__FORGE_ACTIVITY__'.length));
          const w = BrowserWindow.getAllWindows()[0];
          if (w && !w.isDestroyed()) {
            w.webContents.send('mcp-studio-activity', payload);
          }
        } catch (e) { /* ignore */ }
        continue;
      }
      if (line.trim()) console.error('[MCP Server]', line);
    }
  });

  mcpServerProcess.on('exit', (code) => {
    console.log('[MCP Server] Processus termine, code:', code);
    mcpServerProcess = null;
    mcpInitialized = false;
    mcpServerReady = false;
    for (const [id, { reject }] of mcpPending) {
      reject(new Error('MCP Server crashed'));
    }
    mcpPending.clear();
  });

  mcpServerProcess.on('error', (err) => {
    console.error('[MCP Server] Erreur de demarrage:', err.message);
    mcpServerProcess = null;
  });

  // Demarrer aussi le serveur sync dedie au file sync
  startSyncMcpServer();
}

async function waitForMcpServer(maxWaitMs = 10000) {
  startMcpServer();
  if (!mcpServerProcess) return false;
  if (mcpServerReady) return true;

  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    if (mcpServerProcess.killed || mcpServerProcess.exitCode !== null) {
      console.error('[MCP] Processus mort au demarrage');
      return false;
    }
    try {
      // Le serveur ne repond sur stdio qu'une fois son pont HTTP pret — ou
      // qu'il a rejoint un pont existant en mode proxy. initialize est donc
      // un signal de disponibilite fiable dans les deux modes, la ou un ping
      // TCP sur un port fixe echouerait en proxy.
      await mcpSend('initialize', {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'forge-desktop', version: '1.0.0' }
      }, 2000, true);
      mcpServerProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
      mcpServerReady = true;
      mcpInitialized = true;
      console.log('[MCP] Serveur MCP pret (initialize OK)');
      return true;
    } catch {
      await new Promise(r => setTimeout(r, 300));
    }
  }
  return false;
}

async function mcpSend(method, params, timeoutMs = 15000, skipReadyWait = false) {
  if (!mcpServerProcess) startMcpServer();
  if (!mcpServerProcess) throw new Error('MCP Server non demarre — verifie que robloxstudio-mcp est installe');

  if (!skipReadyWait) {
    for (let i = 0; i < 50; i++) {
      if (mcpServerReady) break;
      await new Promise(r => setTimeout(r, 200));
    }
    if (!mcpServerReady) throw new Error('MCP Server ne repond pas au demarrage');
  }

  const id = ++mcpRequestId;
  // NDJSON : un message JSON par ligne, comme attendu par le SDK MCP 0.6+.
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      if (mcpPending.has(id)) {
        const req = mcpPending.get(id);
        mcpPending.delete(id);
        reject(new Error(`Timeout MCP (${timeoutMs}ms) sur ${req.method}`));
      }
    }, timeoutMs);

    mcpPending.set(id, {
      resolve: (val) => { clearTimeout(timer); resolve(val); },
      reject: (err) => { clearTimeout(timer); reject(err); },
      method,
      time: Date.now()
    });

    try {
      mcpServerProcess.stdin.write(payload);
    } catch (err) {
      clearTimeout(timer);
      mcpPending.delete(id);
      reject(new Error('Impossible d\'ecrire sur le MCP Server: ' + err.message));
    }
  });
}

async function mcpInitialize() {
  if (mcpInitialized) return;
  await mcpSend('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'forge-desktop', version: '1.0.0' }
  });
  mcpServerProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  mcpInitialized = true;
  console.log('[MCP] Initialise');
}

async function mcpCallTool(name, args, timeoutMs) {
  await mcpInitialize();
  return await mcpSend('tools/call', { name, arguments: args }, timeoutMs || 15000);
}

// ── Serveur MCP dedie au file sync (canal separe, pas de queue avec les agents) ──
function startSyncMcpServer() {
  if (syncMcpProcess) return;
  const finalPath = getMcpServerPath();
  if (!finalPath) { console.error('[SyncMCP] Serveur introuvable'); return; }

  const mcpEnv = { ...process.env };
  mcpEnv.FORGE_ROBLOX_TOKEN_FILE = userDataFile('roblox-token.json');
  mcpEnv.FORGE_ROBLOX_CLIENT_ID = ROBLOX_CLIENT_ID;
  const userApiKeys = loadApiKeys();
  if (userApiKeys.tripo) mcpEnv.TRIPO_API_KEY = userApiKeys.tripo;
  if (userApiKeys.roblox) mcpEnv.ROBLOX_API_KEY = userApiKeys.roblox;

  syncMcpProcess = spawn('node', [finalPath], { env: mcpEnv });

  syncMcpProcess.stdout.on('data', (data) => {
    for (const line of data.toString().split('\n')) {
      if (!line.trim()) continue;
      try {
        const msg = JSON.parse(line);
        if (msg.id !== undefined && syncMcpPending.has(msg.id)) {
          const { resolve, reject } = syncMcpPending.get(msg.id);
          syncMcpPending.delete(msg.id);
          if (msg.error) reject(new Error(msg.error.message || JSON.stringify(msg.error)));
          else resolve(msg.result);
        }
      } catch (e) {}
    }
  });

  syncMcpProcess.stderr.on('data', () => {});
  syncMcpProcess.on('exit', () => { syncMcpProcess = null; syncMcpInitialized = false; syncMcpReady = false; syncMcpPending.clear(); });
  syncMcpProcess.on('error', (err) => { console.error('[SyncMCP] Erreur:', err.message); syncMcpProcess = null; });
}

async function syncMcpSend(method, params, timeoutMs = 5000) {
  if (!syncMcpProcess) startSyncMcpServer();
  if (!syncMcpProcess) throw new Error('SyncMCP non demarre');
  for (let i = 0; i < 25; i++) { if (syncMcpReady) break; await new Promise(r => setTimeout(r, 200)); }
  if (!syncMcpReady) throw new Error('SyncMCP ne repond pas');

  const id = ++syncMcpRequestId;
  const payload = JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n';
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { if (syncMcpPending.has(id)) { syncMcpPending.delete(id); reject(new Error('Timeout SyncMCP')); } }, timeoutMs);
    syncMcpPending.set(id, { resolve: (v) => { clearTimeout(timer); resolve(v); }, reject: (e) => { clearTimeout(timer); reject(e); }, method });
    try { syncMcpProcess.stdin.write(payload); } catch (err) { clearTimeout(timer); syncMcpPending.delete(id); reject(err); }
  });
}

async function syncMcpInitialize() {
  if (syncMcpInitialized) return;
  await syncMcpSend('initialize', { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'forge-sync', version: '1.0.0' } });
  syncMcpProcess.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n');
  syncMcpInitialized = true;
}

async function syncMcpCallTool(name, args, timeoutMs) {
  await syncMcpInitialize();
  return await syncMcpSend('tools/call', { name, arguments: args }, timeoutMs || 5000);
}

async function isStudioConnected() {
  try {
    await mcpInitialize();
    const result = await mcpSend('tools/call', {
      name: 'execute_luau',
      arguments: { code: 'return "ForgePing"', datamodel_type: 'Edit' }
    }, 2000);
    return { connected: true, result };
  } catch (err) {
    return { connected: false, error: err.message };
  }
}

ipcMain.handle('check-plugin-connection', async () => {
  const ready = await waitForMcpServer(10000);
  if (!ready) return { connected: false, error: 'Serveur MCP non demarre ou ne repond pas. Verifie que dist/index.js existe et que le build a reussi.' };

  try {
    const studio = await isStudioConnected();
    if (studio.connected) {
      return { connected: true, studioConnected: true, message: 'Serveur MCP et Studio connectes' };
    }
  } catch (err) {
    console.log('[MCP] Studio pas encore connecte:', err.message);
  }

  return { connected: true, studioConnected: false, message: 'Serveur MCP pret. Ouvre Roblox Studio pour te connecter.' };
});

ipcMain.handle('execute-luau', async (event, code, datamodelType) => {
  try {
    const ping = await isStudioConnected();
    if (!ping.connected) {
      return { error: 'Roblox Studio non connecte. Ouvre Studio et assure-toi que le plugin Forge est charge.\nDetail: ' + ping.error };
    }
    const result = await mcpCallTool('execute_luau', {
      code: code,
      datamodel_type: datamodelType || 'Edit'
    });
    return { success: true, result };
  } catch (err) {
    console.error('[MCP] Erreur execute_luau:', err.message);
    return { error: err.message };
  }
});

// ============================================
// PROJETS — Creation directe dans Documents/ForgeProjects
// ============================================
ipcMain.handle('create-project', async (event, projectName, language) => {
  try {
    const projectsRoot = getUserProjectsRoot();
    if (!fs.existsSync(projectsRoot)) {
      fs.mkdirSync(projectsRoot, { recursive: true });
    }

    const projectDir = path.join(projectsRoot, projectName);
    if (fs.existsSync(projectDir)) return { error: 'Un dossier avec ce nom existe deja' };

    const isTypeScript = language === 'typescript';

    if (isTypeScript) {
      // Copier le template TypeScript
      const templatePath = path.join(__dirname, 'templates', 'typescript');
      if (!fs.existsSync(templatePath)) return { error: 'Template TypeScript introuvable' };

      // Creer la structure de dossiers
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'sounds'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'models'), { recursive: true });

      // Copier recursivement le template
      function copyDirSync(src, dest) {
        const entries = fs.readdirSync(src, { withFileTypes: true });
        for (const entry of entries) {
          const srcPathCopy = path.join(src, entry.name);
          const destPathCopy = path.join(dest, entry.name);
          if (entry.isDirectory()) {
            fs.mkdirSync(destPathCopy, { recursive: true });
            copyDirSync(srcPathCopy, destPathCopy);
          } else {
            fs.copyFileSync(srcPathCopy, destPathCopy);
          }
        }
      }
      copyDirSync(templatePath, projectDir);

      // Installer les dependances
      console.log('[TypeScript] Installation des dependances...');
      const npmResult = await new Promise((resolve) => {
        const proc = spawn('npm', ['install'], {
          cwd: projectDir,
          shell: true,
          windowsHide: true
        });
        let stderr = '';
        proc.stderr.on('data', d => stderr += d.toString());
        proc.on('close', (code) => resolve({ code, stderr }));
        proc.on('error', (err) => resolve({ code: -1, stderr: err.message }));
      });
      if (npmResult.code !== 0) {
        console.error('[TypeScript] npm install echoue:', npmResult.stderr);
      }

      // Initialiser git
      await new Promise((resolve) => {
        const proc = spawn('git', ['init'], {
          cwd: projectDir,
          shell: true,
          windowsHide: true
        });
        proc.on('close', () => resolve());
        proc.on('error', () => resolve());
      });
    } else {
      // Projet Lua classique
      fs.mkdirSync(projectDir, { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'assets'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'sounds'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'models'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'src'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'src', 'ServerScriptService'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'src', 'ReplicatedStorage'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'src', 'StarterPlayer'), { recursive: true });
      fs.mkdirSync(path.join(projectDir, 'src', 'StarterGui'), { recursive: true });

      const mainLua = `-- Forge Project: ${projectName}
-- Genere automatiquement par Forge
local Players = game:GetService("Players")
local ReplicatedStorage = game:GetService("ReplicatedStorage")
print("[Forge] Projet '${projectName}' charge !")
`;
      fs.writeFileSync(path.join(projectDir, 'src', 'ServerScriptService', 'main.lua'), mainLua);
    }

    const activeProjectPath = userDataFile('active-project.json');
    fs.writeFileSync(activeProjectPath, JSON.stringify({ name: projectName, path: projectDir, language: language || 'lua' }));

    startFileSync(projectDir);
    addProjectToRegistry(projectName, projectDir);

    return { success: true, path: projectDir, language: language || 'lua' };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('get-active-project', async () => {
  const activePath = userDataFile('active-project.json');
  if (!fs.existsSync(activePath)) return { project: null };
  const project = JSON.parse(fs.readFileSync(activePath, 'utf8'));
  if (project && project.path) startFileSync(project.path);
  return { project };
});

ipcMain.handle('list-projects', async () => {
  return { projects: loadProjectsRegistry() };
});

ipcMain.handle('set-active-project', async (event, projectPath) => {
  const registry = loadProjectsRegistry();
  const proj = registry.find(p => p.path === projectPath);
  if (!proj) return { error: 'Projet inconnu' };
  const activeProjectPath = userDataFile('active-project.json');
  fs.writeFileSync(activeProjectPath, JSON.stringify({ name: proj.name, path: proj.path }));
  startFileSync(proj.path);
  return { success: true, project: proj };
});

ipcMain.handle('delete-project', async (event, projectPath, deleteFiles) => {
  try {
    const registry = loadProjectsRegistry();
    const idx = registry.findIndex(p => p.path === projectPath);
    if (idx === -1) return { error: 'Projet inconnu' };

    const projName = registry[idx].name;

    // Remove from registry
    registry.splice(idx, 1);
    saveProjectsRegistry(registry);

    // If it was the active project, clear it
    const activeProjectPath = userDataFile('active-project.json');
    if (fs.existsSync(activeProjectPath)) {
      try {
        const active = JSON.parse(fs.readFileSync(activeProjectPath, 'utf8'));
        if (active && active.path === projectPath) {
          fs.writeFileSync(activeProjectPath, JSON.stringify({ name: null, path: null }));
          stopFileSync();
        }
      } catch (e) {}
    }

    // Delete project files from disk if requested
    if (deleteFiles && fs.existsSync(projectPath)) {
      fs.rmSync(projectPath, { recursive: true, force: true });
    }

    return { success: true, name: projName };
  } catch (e) {
    return { error: e.message };
  }
});

// ============================================
// MEDIA : MINIATURES, ICONES & CONVERSIONS 2D/3D
// ============================================
// Fichiers stockés DANS le dossier du projet (thumbnails/, icons/,
// conversions/). L'ARBRE (catégories → éléments → variantes) est décrit
// dans .forge-media/manifest.json à la racine du projet.
//  - Miniatures / icônes (images) : générées par l'agent Codex.
//  - Conversion 2D→3D et 3D→2D : API Tripo3D (clé `tripo`).
const MEDIA_KINDS = {
  thumb:     { folder: 'thumbnails',  exts: ['.jpg', '.png', '.webp'],      label: 'Miniatures' },
  icon:      { folder: 'icons',       exts: ['.png', '.jpg', '.webp', '.svg'], label: 'Icônes de jeu' },
  img2model: { folder: 'conversions', exts: ['.glb', '.fbx', '.obj'],        label: '2D → 3D' },
  model2img: { folder: 'conversions', exts: ['.png', '.jpg', '.webp'],       label: '3D → 2D' }
};
const notifiedMediaJobs = new Set();

function mediaManifestPath(projectPath) {
  return path.join(projectPath, '.forge-media', 'manifest.json');
}

function loadMediaManifest(projectPath) {
  try {
    const p = mediaManifestPath(projectPath);
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return { categories: {} };
}

function saveMediaManifest(projectPath, manifest) {
  const dir = path.join(projectPath, '.forge-media');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(mediaManifestPath(projectPath), JSON.stringify(manifest, null, 2));
}

function ensureMediaFolder(projectPath, folder) {
  const dir = path.join(projectPath, folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function resolveMediaSource(projectPath, source) {
  if (!source || typeof source !== 'string') return null;
  const projectRoot = canonicalExistingPath(projectPath);
  const requested = path.isAbsolute(source) ? source : path.join(projectPath, source);
  const resolved = canonicalExistingPath(requested);
  if (!projectRoot || !resolved || !isPathInside(projectRoot, resolved)) return null;
  try { return fs.statSync(resolved).isFile() ? resolved : null; }
  catch (e) { return null; }
}

function mediaGenId(prefix) {
  return (prefix || 'm') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function listMediaFiles(projectPath, folder, exts) {
  const dir = path.join(projectPath, folder);
  if (!fs.existsSync(dir)) return [];
  try {
    return fs.readdirSync(dir)
      .filter(f => exts.some(e => f.toLowerCase().endsWith(e)))
      .map(f => ({ name: f, path: path.join(dir, f), url: './' + folder + '/' + encodeURIComponent(f) }));
  } catch (e) { return []; }
}

// Rescanne les dossiers du projet et reconstruit l'arbre des fichiers bruts.
ipcMain.handle('media-list-files', async (event, projectPath) => {
  if (!projectPath || !fs.existsSync(projectPath)) return { error: 'Aucun projet actif' };
  const folders = {};
  for (const [kind, info] of Object.entries(MEDIA_KINDS)) {
    folders[kind] = listMediaFiles(projectPath, info.folder, info.exts);
  }
  const manifest = loadMediaManifest(projectPath);
  return { folders, categories: manifest.categories || {}, jobs: manifest.jobs || [] };
});

// Crée une catégorie racine dans l'arbre (type d'élément).
ipcMain.handle('media-create-item', async (event, projectPath, kind, name) => {
  try {
    if (!projectPath || !fs.existsSync(projectPath)) return { error: 'Aucun projet actif' };
    const info = MEDIA_KINDS[kind];
    if (!info) return { error: 'Type inconnu' };
    ensureMediaFolder(projectPath, info.folder);
    const manifest = loadMediaManifest(projectPath);
    const catKey = kind;
    if (!manifest.categories[catKey]) manifest.categories[catKey] = { label: info.label, items: [] };
    const item = {
      id: mediaGenId(), name: name || 'Nouvel élément', kind, prompt: '',
      files: [], variants: [], status: 'draft', expectedCount: 0,
      createdAt: Date.now(), error: null
    };
    manifest.categories[catKey].items.push(item);
    saveMediaManifest(projectPath, manifest);
    return { success: true, item };
  } catch (err) { return { error: err.message }; }
});

// Génère des fichiers pour un élément (images via Codex, 3D via Tripo3D).
// kind : thumb | icon | img2model | model2img
ipcMain.handle('media-generate', async (event, options) => {
  const { projectPath, kind, prompt, count, itemId, variantId, baseImage } = options || {};
  try {
    if (!projectPath || !fs.existsSync(projectPath)) return { error: 'Aucun projet actif' };
    const info = MEDIA_KINDS[kind];
    if (!info) return { error: 'Type inconnu' };
    const n = Math.max(1, Math.min(parseInt(count, 10) || 1, 8));
    const folder = ensureMediaFolder(projectPath, info.folder);

    // --- Images (miniatures / icônes) : via l'agent Codex ---
    if (kind === 'thumb' || kind === 'icon') {
      return await generateMediaWithCodex({ projectPath, kind, info, prompt, n, itemId, variantId, folder });
    }

    // --- 3D : via l'API Tripo3D ---
    return await generateMediaWithTripo({ projectPath, kind, info, prompt, n, itemId, variantId, baseImage, folder });
  } catch (err) { return { error: err.message }; }
});

// Codex : lance l'agent avec une consigne pour créer les images à l'endroit
// exact du dossier du projet. On retourne l'id de session pour le suivi.
async function generateMediaWithCodex({ projectPath, kind, info, prompt, n, itemId, variantId, folder, baseImage }) {
  const agentType = 'codex';
  const generationId = mediaGenId('codex');
  const outputPrefix = `${kind}_${generationId}_`;
  const outputNames = Array.from({ length: n }, (_, index) => `${outputPrefix}${index + 1}.png`);
  const outputPaths = outputNames.map(name => path.join(folder, name));
  const sourceImage = resolveMediaSource(projectPath, baseImage);
  let manifest = loadMediaManifest(projectPath);
  let entry = findMediaEntry(manifest, kind, itemId, variantId);
  if (!entry) return { error: 'Élément de génération introuvable' };

  entry.prompt = prompt;
  entry.status = 'starting';
  entry.error = null;
  entry.expectedCount = n;
  entry.startedAt = Date.now();
  saveMediaManifest(projectPath, manifest);

  const instructions = buildCodexMediaInstructions({
    kind,
    label: info.label,
    prompt,
    count: n,
    sourceImage,
    outputPaths,
  });
  const res = await agentManager.launch(agentType, projectPath, instructions, {
    skipMcp: true,
    skipForgeInstructions: true,
    images: sourceImage ? [sourceImage] : [],
  });
  if (!res || res.error) {
    manifest = loadMediaManifest(projectPath);
    entry = findMediaEntry(manifest, kind, itemId, variantId);
    if (entry) {
      entry.status = 'failed';
      entry.error = (res && res.error) || 'Échec du lancement de Codex';
      entry.finishedAt = Date.now();
      saveMediaManifest(projectPath, manifest);
    }
    return { error: (res && res.error) || 'Echec du lancement de Codex' };
  }

  manifest = loadMediaManifest(projectPath);
  entry = findMediaEntry(manifest, kind, itemId, variantId);
  if (entry) {
    entry.status = 'running';
    entry.sessionId = res.sessionId;
    entry.generationId = generationId;
  }
  manifest.jobs = manifest.jobs || [];
  manifest.jobs.push({
    id: generationId,
    sessionId: res.sessionId,
    kind,
    method: 'codex',
    itemId,
    variantId: variantId || null,
    prompt,
    target: info.folder,
    outputPrefix,
    outputNames,
    expectedCount: n,
    status: 'running',
    startedAt: Date.now(),
    finishedAt: null,
    notified: false,
  });
  if (manifest.jobs.length > 50) manifest.jobs = manifest.jobs.slice(-50);
  saveMediaManifest(projectPath, manifest);
  return { sessionId: res.sessionId, jobId: generationId, method: 'codex', message: 'Génération Codex lancée' };
}

function generatedFilesForCodexJob(projectPath, job) {
  const info = MEDIA_KINDS[job.kind];
  if (!info) return [];
  return listMediaFiles(projectPath, info.folder, info.exts)
    .filter(file => file.name.startsWith(job.outputPrefix || ''))
    .map(file => normalizeMediaPath(path.join(info.folder, file.name)));
}

function notifyCodexMediaJobOnce(projectPath, job, generated) {
  if (job.notified || notifiedMediaJobs.has(job.id)) return;
  notifiedMediaJobs.add(job.id);
  notifyMediaDone(projectPath, job.kind, generated[generated.length - 1], job.prompt, job.status === 'failed');
  job.notified = true;
}

function finalizeCodexMediaSession(projectPath, sessionId) {
  try {
    if (!projectPath || !sessionId || !fs.existsSync(projectPath)) return;
    const manifest = loadMediaManifest(projectPath);
    const matchingJobs = (manifest.jobs || []).filter(job =>
      job.method === 'codex' && job.sessionId === sessionId &&
      job.status !== 'done' && job.status !== 'partial' && job.status !== 'failed'
    );
    if (!matchingJobs.length) return;

    for (const job of matchingJobs) {
      const generated = generatedFilesForCodexJob(projectPath, job);
      const expected = job.expectedCount || 1;
      if (generated.length >= expected) job.status = 'done';
      else if (generated.length) {
        job.status = 'partial';
        job.error = `Codex a créé ${generated.length} image(s) sur ${expected}.`;
      } else {
        const agentStatus = agentManager.getStatus(sessionId);
        job.status = 'failed';
        job.error = agentStatus.error || agentStatus.outputTail || `Codex s'est arrêté sans créer d'image (code ${agentStatus.exitCode ?? 'inconnu'}).`;
      }
      job.finishedAt = Date.now();
      const entry = findMediaEntry(manifest, job.kind, job.itemId, job.variantId);
      if (entry) {
        entry.files = Array.from(new Set([...(entry.files || []), ...generated]));
        entry.status = job.status;
        entry.error = job.error || null;
        entry.finishedAt = job.finishedAt;
      }
      notifyCodexMediaJobOnce(projectPath, job, generated);
    }
    saveMediaManifest(projectPath, manifest);
  } catch (error) {
    console.error('[Media] Finalisation Codex en arrière-plan :', error.message);
  }
}

// Tripo3D V2 (docs.tripo3d.ai) :
//  - 2D→3D : image_to_model exige file.{url|file_token} (le champ `image:` et
//    les data-URI sont retirés de l'API). Les fichiers locaux doivent d'abord
//    être uploadés (POST /openapi/upload → image_token).
//  - 3D→2D : le type `render` a été remplacé par render_image, qui référence
//    un modèle via original_model_task_id. Un modèle local GLB/FBX doit donc
//    d'abord être importé : upload STS (POST /openapi/upload/sts/token puis PUT
//    S3 signé SigV4) → import_model → render_image.
async function generateMediaWithTripo({ projectPath, kind, info, prompt, n, itemId, variantId, baseImage, folder }) {
  const key = loadApiKeys().tripo || process.env.TRIPO_API_KEY;
  if (!key) return { error: 'Clé API Tripo3D manquante (page Clés API → Tripo3D)' };
  const jobIds = [];
  const manifest = loadMediaManifest(projectPath);
  const needSource = kind === 'img2model' || kind === 'model2img';
  const source = needSource ? await tripoResolveSource(projectPath, baseImage) : null;
  if (kind === 'img2model' && !source) return { error: 'Une image source (2D) est requise pour créer un modèle 3D' };
  if (kind === 'model2img' && !source) return { error: 'Un modèle 3D source est requis pour le rendre en image' };

  // Modèle local → import Tripo une seule fois, puis n rendus 2D se basent dessus.
  let importTaskId = null;
  if (kind === 'model2img') {
    const obj = await tripoUploadModel(source);
    importTaskId = await tripoCreateTask({ type: 'import_model', file: { object: obj } });
    await tripoWaitTask(importTaskId, 120000);
    console.log('[tripo] modèle importé (import_model', importTaskId + ')');
  }
  const imgFile = kind === 'img2model'
    ? (source.url ? { type: source.ext, url: source.url } : { type: source.ext, file_token: await tripoUploadImage(source) })
    : null;
  for (let i = 0; i < n; i++) {
    let taskId = null;
    if (kind === 'img2model') {
      taskId = await tripoCreateTask({ type: 'image_to_model', prompt: prompt || 'Reproduire ce modèle', file: imgFile });
    } else if (kind === 'model2img') {
      taskId = await tripoCreateTask({ type: 'render_image', original_model_task_id: importTaskId, prompt: prompt || '' });
    } else {
      return { error: 'Type 3D non supporté' };
    }
    jobIds.push(taskId);
    attachJob(manifest, kind, 'tripo', taskId, prompt, baseImage || '');
  }
  saveMediaManifest(projectPath, manifest);
  return { jobIds, method: 'tripo', message: `Génération Tripo3D lancée (${jobIds.length} tâche(s))` };
}

// Résout la source (chemin local, data-URI baseline ou URL http(s)) en
// { url } si distante, sinon { buf, ext } prêt pour l'upload.
async function tripoResolveSource(projectPath, source) {
  if (!source || typeof source !== 'string') return null;
  if (/^https?:/i.test(source)) {
    const ext = ((source.split('?')[0].match(/\.(\w+)$/) || [])[1] || 'png').toLowerCase();
    return { url: source, ext };
  }
  let buf, ext;
  if (/^data:/i.test(source)) {
    const m = /^data:([^,]+)?;base64,(.*)$/s.exec(source);
    if (!m) return null;
    const mime = (m[1] || '').toLowerCase();
    ext = mime.includes('glb') || mime.includes('fbx') || mime.includes('obj') ? (mime.includes('fbx') ? 'fbx' : mime.includes('obj') ? 'obj' : 'glb') : (mime.split('/')[1] || 'png').replace('jpeg', 'jpg');
    buf = Buffer.from(m[2], 'base64');
  } else {
    const full = path.isAbsolute(source) ? source : path.join(projectPath, source);
    if (!fs.existsSync(full)) return null;
    buf = fs.readFileSync(full);
    ext = (path.extname(full) || '.png').toLowerCase().replace('.', '');
  }
  if (!buf || !buf.length) return null;
  return { buf, ext };
}

const TRIPO_EXT_STS_FORMAT = { jpg: 'jpeg', jpeg: 'jpeg', png: 'png', webp: 'webp', glb: 'glb', obj: 'obj', fbx: 'fbx', stl: 'stl' };

// Upload une image via l'endpoint simple (multipart) → image_token.
async function tripoUploadImage(source) {
  const key = loadApiKeys().tripo || process.env.TRIPO_API_KEY;
  const fd = new FormData();
  fd.append('file', new Blob([new Uint8Array(source.buf)], { type: 'image/' + (source.ext === 'jpg' ? 'jpeg' : source.ext) }), 'source.' + source.ext);
  const r = await fetchWithTimeout('https://api.tripo3d.ai/v2/openapi/upload', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}` },
    body: fd
  }, 30000);
  const d = await r.json();
  if (d.code !== 0) throw new Error('Upload image Tripo3D: ' + JSON.stringify(d));
  return d.data.image_token;
}

// Upload un modèle 3D via STS (bucket S3 signé SigV4) → { bucket, key }.
async function tripoUploadModel(source) {
  const key = loadApiKeys().tripo || process.env.TRIPO_API_KEY;
  const format = TRIPO_EXT_STS_FORMAT[source.ext] || 'glb';
  const r = await fetchWithTimeout('https://api.tripo3d.ai/v2/openapi/upload/sts/token', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ format })
  }, 30000);
  const d = await r.json();
  if (d.code !== 0) throw new Error('STS token Tripo3D: ' + JSON.stringify(d));
  const sts = d.data;
  const host = (sts.s3_host || '').replace(/^https?:\/\//, '');
  if (!host || !sts.resource_bucket || !sts.resource_uri) throw new Error('Réponse STS invalide');
  const region = (host.match(/\.([a-z0-9-]+)\.amazonaws/) || [])[1] || 'us-west-2';
  await s3PutObject({ host, bucket: sts.resource_bucket, key: sts.resource_uri, buf: source.buf, ak: sts.sts_ak, sk: sts.sts_sk, token: sts.session_token, region });
  return { bucket: sts.resource_bucket, key: sts.resource_uri };
}

// PUT signé AWS SigV4 (le jeton STS doit être signé : x-amz-security-token).
async function s3PutObject({ host, bucket, key, buf, ak, sk, token, region }) {
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '');
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = crypto.createHash('sha256').update(buf).digest('hex');
  const uri = '/' + bucket + '/' + key;
  const amzHeaders = 'host:' + host + '\n'
    + 'x-amz-content-sha256:' + payloadHash + '\n'
    + 'x-amz-date:' + amzDate + '\n'
    + 'x-amz-security-token:' + token + '\n';
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date;x-amz-security-token';
  const CR = ['PUT', uri, '', amzHeaders, signedHeaders, payloadHash].join('\n');
  const scope = dateStamp + '/' + region + '/s3/aws4_request';
  const STS = 'AWS4-HMAC-SHA256\n' + amzDate + '\n' + scope + '\n' + crypto.createHash('sha256').update(CR).digest('hex');
  const kHmac = (k, s) => crypto.createHmac('sha256', k).update(s).digest();
  const kDate = kHmac('AWS4' + sk, dateStamp);
  const kRegion = kHmac(kDate, region);
  const kService = kHmac(kRegion, 's3');
  const kSigning = kHmac(kService, 'aws4_request');
  const signature = crypto.createHmac('sha256', kSigning).update(STS).digest('hex');
  const auth = `AWS4-HMAC-SHA256 Credential=${ak}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  const res = await fetchWithTimeout('https://' + host + uri, {
    method: 'PUT',
    headers: {
      'Host': host,
      'Authorization': auth,
      'x-amz-date': amzDate,
      'x-amz-content-sha256': payloadHash,
      'x-amz-security-token': token,
      'Content-Length': buf.length
    },
    body: buf
  }, 60000);
  if (!res.ok) throw new Error('S3 PUT ' + res.status + ' ' + (await res.text()).slice(0, 200));
}

// Attend la fin d'une tâche (import rapide, model plus long) jusqu'au délai max.
async function tripoWaitTask(taskId, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < maxMs) {
    const data = await tripoPoll(taskId);
    if (data.status === 'success') return;
    if (data.status === 'failed') throw new Error('Tâche Tripo3D en échec');
    await new Promise(r => setTimeout(r, 5000));
  }
  throw new Error('Délai dépassé pour la tâche Tripo3D');
}

function attachJob(manifest, kind, method, jobId, prompt, target) {
  manifest.jobs = manifest.jobs || [];
  manifest.jobs.push({ id: jobId, kind, method, prompt, target, status: 'pending', finishedAt: null });
  if (manifest.jobs.length > 50) manifest.jobs = manifest.jobs.slice(-50);
}

// Vérifie l'avancement des tâches Tripo, télécharge les résultats dans le
// dossier du projet et met l'arbre à jour.
ipcMain.handle('media-poll', async (event, projectPath) => {
  try {
    if (!projectPath || !fs.existsSync(projectPath)) return { error: 'Aucun projet actif' };
    const manifest = loadMediaManifest(projectPath);
    if (!manifest.jobs || !manifest.jobs.length) return { done: true, jobs: [] };
    const jobs = [];
    let anyRunning = false;
    for (const job of manifest.jobs) {
      if (job.method === 'codex') {
        if (job.status === 'done' || job.status === 'partial' || job.status === 'failed') {
          jobs.push(job);
          continue;
        }

        const entry = findMediaEntry(manifest, job.kind, job.itemId, job.variantId);
        const generated = generatedFilesForCodexJob(projectPath, job);

        if (entry && generated.length) {
          entry.files = Array.from(new Set([...(entry.files || []), ...generated]));
        }

        const agentStatus = job.sessionId ? agentManager.getStatus(job.sessionId) : { exists: false };
        const timedOut = Date.now() - (job.startedAt || Date.now()) > 10 * 60 * 1000;
        if (generated.length >= (job.expectedCount || 1)) {
          job.status = 'done';
        } else if (agentStatus.running && !timedOut) {
          job.status = 'running';
          anyRunning = true;
        } else if (generated.length) {
          job.status = 'partial';
          job.error = `Codex a créé ${generated.length} image(s) sur ${job.expectedCount || 1}.`;
        } else {
          job.status = 'failed';
          job.error = timedOut
            ? 'La génération Codex a dépassé 10 minutes.'
            : (agentStatus.error || agentStatus.outputTail || `Codex s'est arrêté sans créer d'image (code ${agentStatus.exitCode ?? 'inconnu'}).`);
        }

        if (job.status !== 'running') {
          job.finishedAt = Date.now();
          if (entry) {
            entry.status = job.status;
            entry.error = job.error || null;
            entry.finishedAt = job.finishedAt;
          }
          notifyCodexMediaJobOnce(projectPath, job, generated);
        } else if (entry) {
          entry.status = 'running';
        }
        jobs.push(job);
        continue;
      }
      if (job.status === 'done' || job.status === 'failed') { jobs.push(job); continue; }
      anyRunning = true;
      try {
        const data = await tripoPoll(job.id);
        if (data.status === 'success') {
          const out = data.output || {};
          const url = job.kind === 'img2model'
            ? (out.fbx_model || out.pbr_model || out.model || out.base_model)
            : (out.rendered_image || out.image_url || out.images || out.result_image);
          job.status = 'done';
          job.finishedAt = Date.now();
          if (url) { const saved = await downloadMediaToProject(url, projectPath, job.kind, data); if (saved) job.saved = saved;
            // Auto-rembg : supprime l'arriere-plan des images generees si active.
            if (saved && (job.kind === 'thumb' || job.kind === 'icon' || job.kind === 'model2img')) {
              const ext = path.extname(saved).toLowerCase();
              if (['.png', '.jpg', '.jpeg'].includes(ext)) {
                const appSettings = loadAppSettings();
                if (appSettings.autoRemoveBg) {
                  const fullPath = path.join(projectPath, saved);
                  const nobg = await runRembg(fullPath);
                  if (nobg.success) {
                    job.savedBg = path.relative(projectPath, nobg.path).replace(/\\/g, '/');
                    console.log('[rembg] Arriere-plan supprime :', job.savedBg);
                  } else {
                    console.warn('[rembg] Echec :', nobg.error);
                  }
                }
              }
            }
          }
          notifyMediaDone(projectPath, job.kind, job.saved, job.prompt, false);
        } else if (data.status === 'failed') {
          job.status = 'failed';
          notifyMediaDone(projectPath, job.kind, null, job.prompt, true);
        }
      } catch (err) {
        job.status = 'failed'; job.error = err.message;
        notifyMediaDone(projectPath, job.kind, null, job.prompt, true);
      }
      jobs.push(job);
    }
    saveMediaManifest(projectPath, manifest);
    return { done: !anyRunning, jobs };
  } catch (err) { return { error: err.message }; }
});

async function tripoCreateTask(body) {
  const key = loadApiKeys().tripo || process.env.TRIPO_API_KEY;
  const r = await fetchWithTimeout('https://api.tripo3d.ai/v2/openapi/task', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  }, 30000);
  const d = await r.json();
  if (!r.ok) throw new Error(`Tripo3D ${r.status}: ${JSON.stringify(d)}`);
  return d.data.task_id;
}

async function tripoPoll(taskId) {
  const key = loadApiKeys().tripo || process.env.TRIPO_API_KEY;
  const r = await fetchWithTimeout(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
    headers: { 'Authorization': `Bearer ${key}` }
  }, 30000);
  const d = await r.json();
  if (!r.ok) throw new Error('Erreur de polling Tripo3D');
  return d.data;
}

// Télécharge un fichier distant (glb/fbx/png) dans le dossier du projet.
async function downloadMediaToProject(url, projectPath, kind, data) {
  try {
    const extMatch = /\.(\w{3,4})(\?.*)?$/.exec(new URL(url).pathname);
    const ext = extMatch ? extMatch[1].toLowerCase() : (kind === 'img2model' ? 'fbx' : 'png');
    const name = (path.basename(decodeURIComponent(new URL(url).pathname)).split('?')[0])
      || (mediaGenId('asset') + '.' + ext);
    const folder = ensureMediaFolder(projectPath, MEDIA_KINDS[kind].folder);
    const target = path.join(folder, name);
    const res = await fetchWithTimeout(url, {}, 60000);
    if (!res.ok) throw new Error('Téléchargement échoué ' + res.status);
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(target, buf);
    return path.relative(projectPath, target).replace(/\\/g, '/');
  } catch (e) {
    console.error('[Media] Téléchargement échoué :', e.message);
    return null;
  }
}

// Suppression d'arriere-plan avec rembg (Python).
// Genere un fichier _nobg.png a cote de l'original.
// Modele u2netp (leger ~5 Mo) : evite le telechargement de u2net (~1 Go)
// qui echoue sur les disques presque pleins.
async function runRembg(inputPath) {
  const outputPath = inputPath.replace(/(\.\w+)$/, '_nobg.png');
  return new Promise((resolve) => {
    const proc = spawn('rembg', ['i', '-m', 'u2netp', inputPath, outputPath], { shell: true, windowsHide: true, timeout: 120000 });
    let stderr = '';
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', (code) => {
      if (code === 0 && fs.existsSync(outputPath)) {
        resolve({ success: true, path: outputPath });
      } else {
        resolve({ success: false, error: (stderr || '').slice(-300) || 'rembg failed (code ' + code + ')' });
      }
    });
    proc.on('error', (e) => resolve({ success: false, error: e.message }));
  });
}

// Reglages globaux de l'app (accessible depuis settings.html + main.js).
function loadAppSettings() {
  try {
    const p = userDataFile('forge-settings.json');
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {}
  return {};
}

function saveAppSettings(s) {
  try {
    const p = userDataFile('forge-settings.json');
    fs.writeFileSync(p, JSON.stringify(s, null, 2));
  } catch (e) {}
}

ipcMain.handle('get-app-settings', async () => loadAppSettings());
ipcMain.handle('save-app-settings', async (event, s) => { saveAppSettings(s); return { success: true }; });

// Suppression d'arriere-plan en un clic depuis le renderer.
ipcMain.handle('remove-background', async (event, filePath) => {
  if (!filePath || !fs.existsSync(filePath)) return { error: 'Fichier introuvable' };
  const rembg = await detectVersion('rembg', ['--version']);
  if (!rembg.installed) return { error: 'rembg non installe. Lance pip install "rembg[cpu,cli]" puis relance Forge.' };
  return runRembg(filePath);
});

ipcMain.handle('media-download', async (event, projectPath, relPath) => {
  try {
    const full = path.join(projectPath, relPath || '');
    if (!fs.existsSync(full)) return { error: 'Fichier introuvable' };
    const win = BrowserWindow.getFocusedWindow();
    const res = await dialog.showSaveDialog(win, { defaultPath: path.basename(full) });
    if (res.canceled || !res.filePath) return { canceled: true };
    fs.copyFileSync(full, res.filePath);
    return { success: true, saved: res.filePath };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('media-delete', async (event, projectPath, kind, itemId, variantId, relPath) => {
  try {
    if (relPath) {
      const manifest = loadMediaManifest(projectPath);
      const item = findMediaItem(manifest, kind, itemId);
      const entry = findMediaEntry(manifest, kind, itemId, variantId);
      const normalized = normalizeMediaPath(relPath);
      const full = resolveMediaSource(projectPath, relPath);
      if (full) fs.unlinkSync(full);
      if (entry) entry.files = (entry.files || []).filter(file => normalizeMediaPath(file) !== normalized);
      if (item) {
        const directChildren = (item.variants || [])
          .filter(variant =>
            (variant.parentVariantId || null) === (variantId || null) &&
            normalizeMediaPath(variant.parentFile) === normalized
          )
          .map(variant => variant.id);
        const removedIds = collectVariantDescendants(item, directChildren);
        const removedVariants = (item.variants || []).filter(variant => removedIds.has(variant.id));
        removedVariants.forEach(variant => removeMediaFiles(projectPath, variant.files));
        item.variants = (item.variants || []).filter(variant => !removedIds.has(variant.id));
        await removeMediaJobs(manifest, job =>
          job.itemId === itemId && job.variantId && removedIds.has(job.variantId)
        );
      }
      saveMediaManifest(projectPath, manifest);
      return { success: true };
    }
    const manifest = loadMediaManifest(projectPath);
    const cat = manifest.categories[kind];
    if (cat) {
      if (itemId) {
        const idx = cat.items.findIndex(i => i.id === itemId);
        if (idx >= 0) {
          const item = cat.items[idx];
          if (variantId) {
            const removedIds = collectVariantDescendants(item, [variantId]);
            const removed = item.variants.filter(v => removedIds.has(v.id));
            removed.forEach(v => removeMediaFiles(projectPath, v.files));
            item.variants = item.variants.filter(v => !removedIds.has(v.id));
            await removeMediaJobs(manifest, job =>
              job.itemId === itemId && job.variantId && removedIds.has(job.variantId)
            );
          } else {
            (item.variants || []).forEach(v => removeMediaFiles(projectPath, v.files));
            removeMediaFiles(projectPath, item.files);
            await removeMediaJobs(manifest, job => job.itemId === itemId);
            cat.items.splice(idx, 1);
          }
        }
      }
    }
    saveMediaManifest(projectPath, manifest);
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

async function removeMediaFiles(projectPath, files) {
  if (!Array.isArray(files)) return;
  for (const f of files) {
    try { const p = path.join(projectPath, f); if (fs.existsSync(p)) fs.unlinkSync(p); } catch (e) {}
  }
}

function collectVariantDescendants(item, initialIds) {
  const ids = new Set(initialIds || []);
  let changed = true;
  while (changed) {
    changed = false;
    for (const variant of item.variants || []) {
      if (variant.parentVariantId && ids.has(variant.parentVariantId) && !ids.has(variant.id)) {
        ids.add(variant.id);
        changed = true;
      }
    }
  }
  return ids;
}

async function removeMediaJobs(manifest, predicate) {
  const removed = (manifest.jobs || []).filter(predicate);
  manifest.jobs = (manifest.jobs || []).filter(job => !predicate(job));
  for (const job of removed) {
    if (job.method === 'codex' && job.sessionId && job.status === 'running') {
      try { await agentManager.stop(job.sessionId); } catch (e) {}
    }
  }
}

// Crée des variantes : Codex ré-utilise les fichiers existants pour
// décliner l'image ; Tripo relance une génération similaire.
ipcMain.handle('media-variants', async (event, options) => {
  const { projectPath, kind, itemId, variantId, prompt, count, baseImage } = options || {};
  try {
    if (!projectPath || !fs.existsSync(projectPath)) return { error: 'Aucun projet actif' };
    const info = MEDIA_KINDS[kind];
    const manifest = loadMediaManifest(projectPath);
    const item = findMediaItem(manifest, kind, itemId);
    const entry = findMediaEntry(manifest, kind, itemId, variantId);
    if (!item || !entry) return { error: 'Élément introuvable' };
    const n = Math.max(1, Math.min(parseInt(count, 10) || 4, 8));
    const folder = ensureMediaFolder(projectPath, info.folder);
    let jobs = [];
    if (kind === 'thumb' || kind === 'icon') {
      const sourceFile = baseImage || (entry.files && entry.files[0]);
      const seed = resolveMediaSource(projectPath, sourceFile);
      if (!seed) return { error: 'Image source introuvable pour créer la variante' };
      const newVariantId = mediaGenId('v');
      item.variants = item.variants || [];
      item.variants.push({
        id: newVariantId,
        parentVariantId: variantId || null,
        parentFile: normalizeMediaPath(sourceFile),
        prompt,
        files: [],
        status: 'draft',
        expectedCount: n,
        createdAt: Date.now(),
        error: null,
      });
      saveMediaManifest(projectPath, manifest);
      const res = await generateMediaWithCodex({
        projectPath, kind, info, prompt, n, itemId,
        variantId: newVariantId, folder, baseImage: seed
      });
      return { ...res, method: 'codex', variant: true, seed: seed, newVariantId };
    }
    const newVariantId = mediaGenId('v');
    entry.variants.push({ id: newVariantId, prompt, files: [], createdAt: Date.now() });
    saveMediaManifest(projectPath, manifest);
    const res = await generateMediaWithTripo({ projectPath, kind, info, prompt, n, baseImage: baseImage || (entry.files[0] && path.join(projectPath, entry.files[0])), folder });
    return { ...res, variant: true, newVariantId };
  } catch (err) { return { error: err.message }; }
});

// Après une génération Codex, la page appelle ceci pour rattacher les
// fichiers nouvellement créés à un élément / variante.
ipcMain.handle('media-attach-files', async (event, projectPath, kind, itemId, variantId, fileNames) => {
  try {
    const info = MEDIA_KINDS[kind];
    const manifest = loadMediaManifest(projectPath);
    const entry = findMediaEntry(manifest, kind, itemId, variantId);
    if (!entry) return { error: 'Élément introuvable' };
    const rels = (Array.isArray(fileNames) ? fileNames : []).map(f => info.folder + '/' + f);
    const list = entry.files.concat(rels.filter(r => !entry.files.includes(r)));
    entry.files = list;
    manifest._lastAttach = Date.now();
    saveMediaManifest(projectPath, manifest);
    if (rels.length && entry.files.length) {
      notifyMediaDone(projectPath, kind, entry.files[entry.files.length - 1], entry.prompt, false);
    }
    return { success: true, files: entry.files };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('media-rename', async (event, projectPath, kind, itemId, newName) => {
  try {
    const manifest = loadMediaManifest(projectPath);
    const entry = findMediaEntry(manifest, kind, itemId, null);
    if (entry) { entry.name = newName; saveMediaManifest(projectPath, manifest); return { success: true }; }
    return { error: 'Élément introuvable' };
  } catch (err) { return { error: err.message }; }
});

// Renvoie une image/média du projet sous forme de data-URL (le fichier vit
// hors du dossier de l'app, d'où l'envoi en base64 plutôt qu'une URL file://).
ipcMain.handle('media-preview', async (event, projectPath, relPath) => {
  try {
    const full = path.join(projectPath, relPath || '');
    if (!fs.existsSync(full)) return { error: 'Fichier introuvable' };
    const buf = fs.readFileSync(full);
    const ext = (path.extname(full) || '.png').toLowerCase().replace('.', '');
    const mime = ext === 'svg' ? 'image/svg+xml' : ext === 'jpg' ? 'image/jpeg' : ext === 'glb' ? 'model/gltf-binary' : ext === 'fbx' ? 'model/fbx' : 'image/' + ext;
    return { dataUrl: 'data:' + mime + ';base64,' + buf.toString('base64') };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('push-notification', async (event, data) => {
  return { success: true, notification: emitForgeNotification(data) };
});

const forgeNotificationsPath = () => userDataFile('notifications.json');

ipcMain.handle('notifications-list', async () => ({ notifications: readNotifications(forgeNotificationsPath()) }));
ipcMain.handle('notifications-clear', async () => {
  writeNotifications(forgeNotificationsPath(), []);
  return { success: true };
});
ipcMain.handle('notifications-mark-read', async (event, id) => ({ success: updateNotification(forgeNotificationsPath(), id, { read: true }) }));
ipcMain.handle('notifications-delete', async (event, id) => ({ success: deleteNotification(forgeNotificationsPath(), id) }));

// Notifie toutes les fenêtres (la cloche est dans workspace.html).
function broadcastNotification(data) {
  for (const w of BrowserWindow.getAllWindows()) {
    if (!w.isDestroyed()) {
      try { w.webContents.send('agent-notification', data); } catch (e) {}
    }
  }
}

function emitForgeNotification(data) {
  const notification = appendNotification(forgeNotificationsPath(), data || {});
  broadcastNotification(notification);
  return notification;
}

function escapeNotificationHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

// Notification de fin de génération média (Codex ou Tripo3D).
function notifyMediaDone(projectPath, kind, saved, prompt, failed) {
  try {
    const meta = MEDIA_KINDS[kind] || {};
    const fileName = saved ? path.basename(String(saved)) : '';
    const type = kind === 'img2model' ? 'model' : 'image';
    const agent = kind === 'thumb' || kind === 'icon' ? { n: 'Codex', c: '#10A37F' } : { n: 'Tripo3D', c: '#9B6BE3' };
    const notificationKinds = {
      thumb: { name: 'Miniature', ready: 'prête' },
      icon: { name: 'Icône de jeu', ready: 'prête' },
      img2model: { name: 'Modèle 3D', ready: 'prêt' },
      model2img: { name: 'Rendu 3D', ready: 'prêt' },
    };
    const notificationKind = notificationKinds[kind] || { name: meta.label || kind, ready: 'prêt' };
    const kindName = escapeNotificationHtml(notificationKind.name);
    const safeFileName = escapeNotificationHtml(fileName);
    const safePrompt = escapeNotificationHtml(prompt);
    const aiMessage = failed
      ? '<strong>Échec ' + kindName + '</strong> — la génération n\'a pas abouti.'
      : '<strong>' + kindName + ' ' + notificationKind.ready + (safeFileName ? ' : ' + safeFileName : '') + '</strong>' + (safePrompt ? '<br><span style="opacity:.7">' + safePrompt + '</span>' : '');
    emitForgeNotification({
      agentName: agent.n,
      agentColor: agent.c,
      aiMessage,
      assetType: type,
      filePath: saved ? path.join(projectPath, saved) : '',
      fileName
    });
  } catch (e) {}
}

ipcMain.handle('read-file-text', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { error: 'Fichier introuvable' };
    const text = fs.readFileSync(filePath, 'utf8');
    return { text };
  } catch (err) { return { error: err.message }; }
});

// Lecture binaire (pour décoder les sons et dessiner les waveforms côté renderer,
// car fetch('file://…') est bloqué par webSecurity dans le renderer Electron)
ipcMain.handle('read-file-binary', async (event, filePath) => {
  try {
    if (!fs.existsSync(filePath)) return { error: 'Fichier introuvable' };
    const data = fs.readFileSync(filePath);
    return { data: new Uint8Array(data) };
  } catch (err) { return { error: err.message }; }
});

// ============================================
// ROBLOX ASSET UPLOAD (Open Cloud v1)
// ============================================
const ROBLOX_TOKEN_PATH = () => userDataFile('roblox-token.json');

function getRobloxToken() {
  if (!fs.existsSync(ROBLOX_TOKEN_PATH())) return null;
  try { return JSON.parse(fs.readFileSync(ROBLOX_TOKEN_PATH(), 'utf8')); }
  catch (e) { return null; }
}

function saveRobloxToken(data) {
  fs.writeFileSync(ROBLOX_TOKEN_PATH(), JSON.stringify({ ...data, obtained_at: Date.now() }));
  global.robloxAccessToken = data.access_token;
}

// Returns fresh { accessToken, userId } — refreshes automatically if expired
async function getRobloxAuth() {
  let tok = getRobloxToken();
  if (!tok || !tok.access_token) return null;

  // Check expiry: obtained_at + expires_in (seconds), with 60s safety margin
  const expiresAt = (tok.obtained_at || 0) + ((tok.expires_in || 900) - 60) * 1000;
  if (Date.now() > expiresAt && tok.refresh_token) {
    console.log('[Roblox] Token expiré, refresh en cours...');
    try {
      const resp = await fetchWithTimeout('https://apis.roblox.com/oauth/v1/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: ROBLOX_CLIENT_ID,
          grant_type: 'refresh_token',
          refresh_token: tok.refresh_token,
        })
      }, 15000);
      if (resp.ok) {
        const fresh = await resp.json();
        // Preserve refresh_token if not returned (some providers omit it on refresh)
        if (!fresh.refresh_token) fresh.refresh_token = tok.refresh_token;
        if (!fresh.scope) fresh.scope = tok.scope || tok.requested_scope;
        if (!fresh.requested_scope) fresh.requested_scope = tok.requested_scope;
        saveRobloxToken(fresh);
        tok = fresh;
        console.log('[Roblox] Token rafraîchi avec succès.');
      } else {
        const err = await resp.text();
        console.error('[Roblox] Refresh échoué:', resp.status, err);
        // Token is dead — keep the old one, upload will fail with a clear message
      }
    } catch (e) {
      console.error('[Roblox] Refresh réseau:', e.message);
    }
  }

  try {
    const payload = JSON.parse(Buffer.from(tok.access_token.split('.')[1], 'base64').toString('utf8'));
    return { accessToken: tok.access_token, userId: payload.sub };
  } catch (e) { return null; }
}

// Upload an image asset to Roblox Open Cloud
// Returns { assetId } or { error }
async function uploadImageToRoblox(filePath, displayName) {
  const auth = await getRobloxAuth();
  if (!auth) return { error: 'Non connecté à Roblox — reconnecte ton compte dans les paramètres.' };

  const ext  = path.extname(filePath).toLowerCase().slice(1);
  const mimeMap = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', bmp: 'image/bmp', webp: 'image/webp', fbx: 'application/octet-stream', glb: 'model/gltf-binary', gltf: 'model/gltf+json', obj: 'text/plain' };
  const mimeType = mimeMap[ext] || 'application/octet-stream';
  const assetTypeMap = { png: 'Image', jpg: 'Image', jpeg: 'Image', gif: 'Image', bmp: 'Image', webp: 'Image', fbx: 'Mesh', glb: 'Mesh', gltf: 'Mesh', obj: 'Mesh' };
  const assetType = assetTypeMap[ext] || 'Image';

  let fileData;
  try { fileData = fs.readFileSync(filePath); }
  catch (e) { return { error: 'Impossible de lire le fichier : ' + e.message }; }

  const boundary = '----ForgeUpload' + Date.now();
  const metaJson = JSON.stringify({
    assetType: assetType,
    displayName: displayName || path.basename(filePath, path.extname(filePath)),
    description: 'Généré par Forge',
    creationContext: { creator: { userId: auth.userId } }
  });

  const CRLF = '\r\n';
  const metaPart = `--${boundary}${CRLF}Content-Disposition: form-data; name="request"${CRLF}Content-Type: application/json${CRLF}${CRLF}${metaJson}${CRLF}`;
  const filePart = `--${boundary}${CRLF}Content-Disposition: form-data; name="fileContent"; filename="${path.basename(filePath)}"${CRLF}Content-Type: ${mimeType}${CRLF}${CRLF}`;
  const end = `${CRLF}--${boundary}--${CRLF}`;

  const body = Buffer.concat([
    Buffer.from(metaPart, 'utf8'),
    Buffer.from(filePart, 'utf8'),
    fileData,
    Buffer.from(end, 'utf8')
  ]);

  try {
    const resp = await fetchWithTimeout('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + auth.accessToken,
        'Content-Type': `multipart/form-data; boundary=${boundary}`,
        'Content-Length': String(body.length),
      },
      body
    }, 60000);

    const text = await resp.text();
    if (!resp.ok) {
      console.error('[Roblox Upload] HTTP', resp.status, text);
      if (resp.status === 401) return { error: 'Token Roblox invalide — reconnecte ton compte Roblox dans les paramètres.' };
      return { error: `Roblox API ${resp.status}: ${text.slice(0, 200)}` };
    }

    let data;
    try { data = JSON.parse(text); } catch (e) { return { error: 'Réponse Roblox invalide : ' + text.slice(0, 100) }; }

    if (data.operationId) {
      const assetId = await pollRobloxOperation(data.operationId, auth.accessToken);
      return assetId ? { assetId } : { error: 'Timeout — réessaie dans quelques secondes.' };
    }
    if (data.assetId) return { assetId: String(data.assetId) };
    return { error: 'Réponse inattendue : ' + JSON.stringify(data).slice(0, 200) };
  } catch (e) {
    return { error: 'Erreur réseau : ' + e.message };
  }
}

async function pollRobloxOperation(operationId, accessToken, maxTries = 15) {
  for (let i = 0; i < maxTries; i++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const resp = await fetchWithTimeout(`https://apis.roblox.com/assets/v1/operations/${operationId}`, {
        headers: { 'Authorization': 'Bearer ' + accessToken }
      }, 15000);
      if (!resp.ok) continue;
      const data = await resp.json();
      if (data.done && data.response && data.response.assetId) return String(data.response.assetId);
      if (data.done && data.error) { console.error('[Roblox Poll] Erreur operation:', data.error); return null; }
    } catch (e) { continue; }
  }
  return null;
}

ipcMain.handle('upload-to-roblox', async (event, filePath) => {
  const displayName = path.basename(filePath, path.extname(filePath));
  const result = await uploadImageToRoblox(filePath, displayName);
  if (result.error) return result;
  return { assetId: result.assetId, rbxAssetId: `rbxassetid://${result.assetId}` };
});

ipcMain.handle('accept-asset', async (event, filePath, assetType) => {
  try {
    if (!fs.existsSync(filePath)) return { error: 'Fichier introuvable' };
    const activeProjectPath = userDataFile('active-project.json');
    let destDir = path.dirname(filePath); // default: keep in place
    if (fs.existsSync(activeProjectPath)) {
      const proj = JSON.parse(fs.readFileSync(activeProjectPath, 'utf8'));
      if (proj && proj.path) {
        const folderMap = { image: 'assets', audio: 'sounds', model3d: 'models' };
        const sub = folderMap[assetType] || 'assets';
        destDir = path.join(proj.path, sub);
        if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
      }
    }
    const dest = path.join(destDir, path.basename(filePath));
    if (path.resolve(filePath) !== path.resolve(dest)) {
      fs.copyFileSync(filePath, dest);
    }
    return { success: true, dest };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('delete-file', async (event, filePath) => {
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    return { success: true };
  } catch (err) { return { error: err.message }; }
});

ipcMain.handle('list-project-files', async (event, projectPath, folder) => {
  try {
    const targetPath = path.join(projectPath, folder);
    if (!fs.existsSync(targetPath)) return { files: [], tree: [] };

    function buildTree(dirPath, relBase) {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      const nodes = [];
      for (const entry of entries) {
        const relPath = relBase ? relBase + '/' + entry.name : entry.name;
        if (entry.isDirectory()) {
          nodes.push({
            type: 'dir',
            name: entry.name,
            path: relPath,
            children: buildTree(path.join(dirPath, entry.name), relPath)
          });
        } else {
          nodes.push({ type: 'file', name: entry.name, path: relPath });
        }
      }
      nodes.sort((a, b) => {
        if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
      return nodes;
    }

    if (folder === 'src' || folder === 'assets') {
      // Return a recursive tree
      return { tree: buildTree(targetPath, '') };
    } else {
      // Flat list for sounds/ and models/
      const files = fs.readdirSync(targetPath, { withFileTypes: true })
        .filter(e => e.isFile())
        .map(e => e.name)
        .sort((a, b) => a.localeCompare(b));
      return { files };
    }
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('open-external', async (event, url) => {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') {
      shell.openExternal(url);
    }
  } catch(e) {}
});

// ============================================
// CHECK STUDIO OPEN (via MCP)
// ============================================
ipcMain.handle('check-studio-open', async () => {
  return await isStudioConnected();
});

// ============================================
// PTY MANAGER
// ============================================
const PTYS = new Map();

ipcMain.handle('pty-create', async (event, agentType, projectPath, cols, rows) => {
  if (!isPathAllowed(projectPath)) {
    return { error: 'Chemin de projet non autorise.' };
  }

  prepareForgeAgentInstructions(projectPath, agentType);
  const cmd = agentType === 'claude' ? 'claude' : agentType === 'codex' ? 'codex' : 'agy';
  // Avec le pont MCP quand il est disponible : l'agent herite des tools
  // Roblox Studio (create_object, insert_asset, execute_luau, ...).
  const launchCmd = buildAgentShellCommand(agentType) || cmd;

  if (!spawnPty) return { error: 'Terminal intégré indisponible. Réinstalle Forge puis réessaie.' };

  const shell = process.platform === 'win32' ? 'cmd.exe' : (process.env.SHELL || 'bash');

  try {
    const ptyProcess = spawnPty(shell, [], {
      name: 'xterm-color',
      cols: cols || 80,
      rows: rows || 24,
      cwd: projectPath,
      env: { ...process.env, FORCE_COLOR: '1', TERM: 'xterm-256color', COLORTERM: 'truecolor' }
    });

    const sessionId = `pty_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;

    ptyProcess.onData((data) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('pty-data', { sessionId, data });
      }
    });

    ptyProcess.onExit(({ exitCode, signal }) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('pty-exit', { sessionId, exitCode, signal });
      }
      PTYS.delete(sessionId);
    });

    PTYS.set(sessionId, { pty: ptyProcess, agentType, projectPath });

    // Build env vars so the agent knows where to save files.
    const assetsDir  = path.join(projectPath, 'assets').replace(/\\/g, '/');
    const soundsDir  = path.join(projectPath, 'sounds').replace(/\\/g, '/');
    const modelsDir  = path.join(projectPath, 'models').replace(/\\/g, '/');

    // Injecter les cles API medias pour que l'agent puisse les utiliser
    // (ex: generate_image.py lit GEMINI_API_KEY, etc.)
    const userApiKeys = loadApiKeys();
    const apiEnv = {};
    if (userApiKeys.gemini) apiEnv.GEMINI_API_KEY = userApiKeys.gemini;
    if (userApiKeys.elevenlabs) apiEnv.ELEVENLABS_API_KEY = userApiKeys.elevenlabs;

    const envInject = process.platform === 'win32'
      ? `set FORGE_ASSETS_DIR=${assetsDir}\r\nset FORGE_SOUNDS_DIR=${soundsDir}\r\nset FORGE_MODELS_DIR=${modelsDir}\r\n`
        + Object.entries(apiEnv).map(([k, v]) => `set ${k}=${v}\r\n`).join('')
      : `export FORGE_ASSETS_DIR="${assetsDir}"; export FORGE_SOUNDS_DIR="${soundsDir}"; export FORGE_MODELS_DIR="${modelsDir}"\n`
        + Object.entries(apiEnv).map(([k, v]) => `export ${k}="${v}"\n`).join('');

    setTimeout(() => {
      ptyProcess.write(envInject);
      ptyProcess.write(`${launchCmd}\r`);
    }, 800);

    return { success: true, sessionId };
  } catch (err) {
    return { error: err.message };
  }
});

ipcMain.handle('pty-input', async (event, sessionId, data) => {
  const pty = PTYS.get(sessionId);
  if (pty) pty.pty.write(data);
});

ipcMain.handle('pty-resize', async (event, sessionId, cols, rows) => {
  const pty = PTYS.get(sessionId);
  if (pty) pty.pty.resize(cols, rows);
});

ipcMain.handle('pty-kill', async (event, sessionId) => {
  const pty = PTYS.get(sessionId);
  if (pty) {
    pty.pty.kill();
    PTYS.delete(sessionId);
  }
});

// ============================================
// LIBRARY COMMUNAUTAIRE (Supabase)
// ============================================
// Tout asset (image/son/modèle) détecté dans un projet est publié
// automatiquement ici, en plus de la notification locale.
const LIB_BUCKET = 'library-assets';

function loadForgeSession() {
  const sessionPath = path.join(app.getPath('userData'), 'forge-session.json');
  if (!fs.existsSync(sessionPath)) return null;
  try { return JSON.parse(fs.readFileSync(sessionPath, 'utf8')); }
  catch (e) { return null; }
}

// Retourne { accessToken, userId, email } ou null — rafraîchit la session
// Supabase automatiquement quand le jeton a expiré (1h).
async function getForgeAuth() {
  const cfg = getSupabaseConfig();
  if (!cfg) return null;
  let session = loadForgeSession();
  if (!session) return null;

  if (session.expires_at && session.expires_at * 1000 < Date.now() + 30000 && session.refresh_token) {
    try {
      const res = await fetchWithTimeout(`${cfg.url}/auth/v1/token?grant_type=refresh_token`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'apikey': cfg.anonKey },
        body: JSON.stringify({ refresh_token: session.refresh_token }),
      }, 15000);
      if (res.ok) {
        const data = await res.json();
        fs.writeFileSync(path.join(app.getPath('userData'), 'forge-session.json'), JSON.stringify(data));
        session = data;
        console.log('[Library] Session Supabase rafraîchie');
      } else {
        console.error('[Library] Refresh session échoué:', res.status);
      }
    } catch (err) {
      console.error('[Library] Refresh session erreur:', err.message);
    }
  }

  if (!session.access_token || !session.user || !session.user.id) return null;
  return { accessToken: session.access_token, userId: session.user.id, email: session.user.email };
}

function guessContentType(filePath) {
  const ext = path.extname(filePath).toLowerCase().slice(1);
  const map = {
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
    webp: 'image/webp', bmp: 'image/bmp', svg: 'image/svg+xml',
    mp3: 'audio/mpeg', ogg: 'audio/ogg', wav: 'audio/wav', flac: 'audio/flac', aac: 'audio/aac',
    obj: 'text/plain', fbx: 'application/octet-stream', gltf: 'model/gltf+json',
    glb: 'model/gltf-binary', rbxm: 'application/octet-stream', rbxmx: 'application/xml',
  };
  return map[ext] || 'application/octet-stream';
}

function normalizeAssetType(t) {
  if (t === 'audio') return 'audio';
  if (t === 'model3d' || t === 'model-unsupported' || t === 'model') return 'model';
  return 'image';
}

// Upload un fichier vers le bucket Storage puis insère la ligne en base.
async function libraryUploadFile(filePath, fileName, assetType, agentName) {
  const cfg = getSupabaseConfig();
  if (!cfg) return { error: 'config Supabase absente' };
  const auth = await getForgeAuth();
  if (!auth) return { error: 'Forge non connecté' };

  const type = normalizeAssetType(assetType);
  let buf;
  try { buf = fs.readFileSync(filePath); }
  catch (err) { return { error: err.message }; }
  if (!buf || buf.length === 0) return { error: 'fichier vide' };

  const safeName = fileName.replace(/[^\w.\-]+/g, '_').slice(-120);
  const storagePath = `${auth.userId}/${Date.now()}-${safeName}`;

  try {
    // 1) Upload vers Storage
    const upRes = await fetchWithTimeout(`${cfg.url}/storage/v1/object/${LIB_BUCKET}/${storagePath}`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'apikey': cfg.anonKey,
        'Content-Type': guessContentType(filePath),
        'x-upsert': 'true',
      },
      body: buf,
    }, 60000);
    if (!upRes.ok) {
      const txt = await upRes.text();
      const setupRequired = /Bucket not found|does not exist/i.test(txt);
      console.error('[Library] Upload erreur:', upRes.status, txt.slice(0, 200));
      return { error: `upload ${upRes.status}${setupRequired ? ' (setup requis)' : ''}`, setupRequired };
    }

    // 2) Métadonnées dans la table library_assets
    const row = {
      user_id: auth.userId,
      user_email: auth.email || null,
      file_name: fileName,
      asset_type: type,
      storage_path: storagePath,
      public_url: `${cfg.url}/storage/v1/object/public/${LIB_BUCKET}/${storagePath}`,
      size_bytes: buf.length,
      agent: agentName || null,
    };
    const insRes = await fetchWithTimeout(`${cfg.url}/rest/v1/library_assets`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${auth.accessToken}`,
        'apikey': cfg.anonKey,
        'Content-Type': 'application/json',
        'Prefer': 'return=representation',
      },
      body: JSON.stringify(row),
    }, 30000);
    if (!insRes.ok) {
      const txt = await insRes.text();
      const setupRequired = insRes.status === 404 || /could not find the table|does not exist|schema cache/i.test(txt);
      console.error('[Library] Insert erreur:', insRes.status, txt.slice(0, 200));
      return { error: `db ${insRes.status}${setupRequired ? ' (setup requis)' : ''}`, setupRequired };
    }
    const inserted = await insRes.json();
    return { success: true, row: Array.isArray(inserted) ? inserted[0] : inserted };
  } catch (err) {
    return { error: err.message };
  }
}

ipcMain.handle('library-list', async () => {
  const cfg = getSupabaseConfig();
  if (!cfg) return { error: 'Configuration Supabase manquante (.env)', items: [] };
  const auth = await getForgeAuth();
  const bearer = auth ? auth.accessToken : cfg.anonKey;
  try {
    const res = await fetchWithTimeout(`${cfg.url}/rest/v1/library_assets?select=*&order=created_at.desc&limit=300`, {
      headers: { 'apikey': cfg.anonKey, 'Authorization': `Bearer ${bearer}` },
    }, 15000);
    if (!res.ok) {
      const txt = await res.text();
      const setupRequired = res.status === 404 || /could not find the table|does not exist|schema cache/i.test(txt);
      console.error('[Library] List erreur:', res.status, txt.slice(0, 200));
      return { error: `HTTP ${res.status}`, setupRequired, items: [] };
    }
    const rows = await res.json();
    return { items: Array.isArray(rows) ? rows : [] };
  } catch (err) {
    return { error: err.message, items: [] };
  }
});

ipcMain.handle('library-upload', async (event, filePath, assetType) => {
  if (!filePath || !fs.existsSync(filePath)) return { error: 'Fichier introuvable' };
  const fileName = path.basename(filePath);
  const ext = fileName.split('.').pop().toLowerCase();
  const meta = ASSET_EXT_MAP[ext];
  const finalType = normalizeAssetType(assetType || (meta && meta.type) || 'image');
  const { agentName } = resolveAgent();
  const res = await libraryUploadFile(filePath, fileName, finalType, agentName);
  if (res.success) console.log('[Library] ✅ Publié (manuel) :', fileName);
  else console.error('[Library] ✗ Publication manuelle échouée (' + fileName + ') :', res.error);
  return res;
});

// Télécharge un asset de la library et le copie dans le projet actif
// (bon sous-dossier selon son type) — il apparaît aussitôt dans « Mes assets ».
ipcMain.handle('library-import', async (event, item) => {
  try {
    if (!item || !item.public_url || !item.file_name) return { error: 'Item invalide' };
    const activeProjectPath = userDataFile('active-project.json');
    let projPath = null;
    if (fs.existsSync(activeProjectPath)) {
      const proj = JSON.parse(fs.readFileSync(activeProjectPath, 'utf8'));
      if (proj && proj.path && fs.existsSync(proj.path)) projPath = proj.path;
    }
    if (!projPath) return { error: 'Aucun projet actif' };

    const ext = (item.file_name.split('.').pop() || '').toLowerCase();
    const meta = ASSET_EXT_MAP[ext] || { folder: 'assets' };
    const destDir = path.join(projPath, meta.folder);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    let dest = path.join(destDir, item.file_name);
    if (fs.existsSync(dest)) {
      const base = path.basename(item.file_name, path.extname(item.file_name));
      dest = path.join(destDir, base + '-import' + path.extname(item.file_name));
    }

    const res = await fetchWithTimeout(item.public_url, {}, 60000);
    if (!res.ok) return { error: 'Téléchargement impossible (' + res.status + ')' };
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) return { error: 'Fichier vide' };
    fs.writeFileSync(dest, buf);
    console.log('[Library] Importé dans le projet :', dest);
    return { success: true, dest, folder: meta.folder + '/', fileName: path.basename(dest) };
  } catch (err) {
    return { error: err.message };
  }
});

// ============================================
// FENETRE PRINCIPALE
// ============================================
function getStartPage() {
  // L'app démarre TOUJOURS sur l'onboarding, que l'on soit connecté ou non.
  // La suite du flux (roblox-studio → login/accounts) est gérée dans
  // onboarding.html et roblox-studio.html selon la session.
  console.log('[Boot] Démarré sur onboarding.html');
  return 'onboarding.html';
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1400, height: 900, title: 'Forge',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      webSecurity: true
    }
  });
  agentManager.setWindow(win);
  win.webContents.on('console-message', (event, level, message, line, sourceId) => {
    try { console.log('[renderer] L' + level + ' (ligne ' + line + ', ' + (sourceId || '?') + '): ' + message); } catch (e) {}
  });
  win.loadFile(getStartPage());
}

// ============================================
// FILE SYNC + ASSET WATCHER
// ============================================
let fileWatcher = null;
let assetWatchers = []; // watchers for assets/, sounds/, models/, root
let lastSyncTime = 0;
let currentSyncProjectPath = null;
const MCP_HTTP_PORT = 58741;

// Extensions → asset type + target folder
const ASSET_EXT_MAP = {
  png: { type: 'image', folder: 'assets' },
  jpg: { type: 'image', folder: 'assets' },
  jpeg: { type: 'image', folder: 'assets' },
  gif: { type: 'image', folder: 'assets' },
  webp: { type: 'image', folder: 'assets' },
  bmp: { type: 'image', folder: 'assets' },
  svg: { type: 'image', folder: 'assets' },
  mp3: { type: 'audio', folder: 'sounds' },
  ogg: { type: 'audio', folder: 'sounds' },
  wav: { type: 'audio', folder: 'sounds' },
  flac: { type: 'audio', folder: 'sounds' },
  aac: { type: 'audio', folder: 'sounds' },
  obj: { type: 'model3d', folder: 'models' },
  fbx: { type: 'model3d', folder: 'models' },
  gltf: { type: 'model3d', folder: 'models' },
  glb: { type: 'model3d', folder: 'models' },
  rbxm: { type: 'model-unsupported', folder: 'models' },
  rbxmx: { type: 'model-unsupported', folder: 'models' },
};

function getAgentColorForSession(sessionId) {
  if (!sessionId) return '#3B82F6';
  const pty = PTYS.get(sessionId);
  if (!pty) return '#3B82F6';
  const colors = { claude: '#CC785C', codex: '#10A37F', antigravity: '#4285F4' };
  return colors[pty.agentType] || '#3B82F6';
}

function getAgentNameForSession(sessionId) {
  if (!sessionId) return 'Agent';
  const pty = PTYS.get(sessionId);
  if (!pty) return 'Agent';
  const names = { claude: 'Claude Code', codex: 'OpenAI Codex', antigravity: 'Antigravity' };
  return names[pty.agentType] || 'Agent';
}

function notifyAssetCreated(filePath, filename, agentName, agentColor, libResult) {
  const ext = filename.split('.').pop().toLowerCase();
  const meta = ASSET_EXT_MAP[ext];
  if (!meta) return;

  const typeLabels = {
    image: 'image',
    audio: 'fichier audio',
    model3d: 'modèle 3D',
  };
  const folderLabels = {
    assets: 'assets/',
    sounds: 'sounds/',
    models: 'models/',
  };
  const label = typeLabels[meta.type] || 'fichier';
  const folder = folderLabels[meta.folder] || meta.folder + '/';

  const safeFilename = escapeNotificationHtml(filename);
  let aiMessage = `Voilà ce que j'ai généré — un nouveau ${label} est prêt : <strong>${safeFilename}</strong>. Il a été déplacé dans <strong>${folder}</strong>.`;
  if (libResult && libResult.success) {
    aiMessage += ` Il est aussi publié dans la <strong>Library</strong> communautaire ✅`;
  } else if (libResult && libResult.error) {
    const reason = String(libResult.error).replace(/[<>&"]/g, '').slice(0, 60);
    aiMessage += ` <span style="color:#948B7C;">(Library : non publié — ${reason})</span>`;
  }

  emitForgeNotification({
    agentName: agentName || 'Agent',
    agentColor: agentColor || '#3B82F6',
    aiMessage,
    assetType: meta.type,
    filePath,
    fileName: filename,
  });

  console.log('[AssetWatcher] Nouvelle notif →', filename, '(', meta.type, ')');
}

// Move a file from anywhere in the project to the right subfolder
// Returns the new path (or original if already in place)
function autoMoveAsset(filePath, filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const meta = ASSET_EXT_MAP[ext];
  if (!meta || !currentSyncProjectPath) return filePath;

  const targetDir = path.join(currentSyncProjectPath, meta.folder);
  if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

  const targetPath = path.join(targetDir, filename);
  if (path.resolve(filePath) === path.resolve(targetPath)) return filePath; // already there

  try {
    fs.renameSync(filePath, targetPath);
    console.log('[AssetWatcher] Déplacé :', filename, '→', meta.folder + '/');
    return targetPath;
  } catch (err) {
    // rename across drives fails — fallback to copy+delete
    try {
      fs.copyFileSync(filePath, targetPath);
      fs.unlinkSync(filePath);
      console.log('[AssetWatcher] Copié+Supprimé :', filename, '→', meta.folder + '/');
      return targetPath;
    } catch (e) {
      console.error('[AssetWatcher] Impossible de déplacer :', e.message);
      return filePath;
    }
  }
}

// Track recently notified files to avoid double-firing.
// Key = filename (not path — path changes when root→subfolder move happens).
const seenAssets = new Set();

function resolveAgent() {
  let agentName = 'Agent', agentColor = '#3B82F6';
  const sessions = [...PTYS.entries()];
  if (sessions.length > 0) {
    const last = sessions[sessions.length - 1][1];
    const nameMap  = { claude: 'Claude Code', codex: 'OpenAI Codex', antigravity: 'Antigravity' };
    const colorMap = { claude: '#CC785C', codex: '#10A37F', antigravity: '#4285F4' };
    agentName  = nameMap[last.agentType]  || 'Agent';
    agentColor = colorMap[last.agentType] || '#3B82F6';
  }
  return { agentName, agentColor };
}

function handleNewAssetFile(filePath, filename) {
  // De-duplicate: ignore if we already fired a notif for this filename recently
  if (seenAssets.has(filename)) return;
  seenAssets.add(filename);
  setTimeout(() => seenAssets.delete(filename), 5000);

  // Debounce: wait for the file to finish writing
  setTimeout(async () => {
    // Re-resolve path in case it was already moved
    let resolvedPath = filePath;
    if (!fs.existsSync(resolvedPath)) {
      // Try to find it in the expected subfolder
      const ext = filename.split('.').pop().toLowerCase();
      const meta = ASSET_EXT_MAP[ext];
      if (meta && currentSyncProjectPath) {
        const candidate = path.join(currentSyncProjectPath, meta.folder, filename);
        if (fs.existsSync(candidate)) resolvedPath = candidate;
        else return;
      } else return;
    }

    try {
      const stat = fs.statSync(resolvedPath);
      if (!stat.isFile() || stat.size === 0) return;
    } catch (e) { return; }

    const ext = filename.split('.').pop().toLowerCase();
    const meta = ASSET_EXT_MAP[ext];
    if (!meta) return;

    const { agentName, agentColor } = resolveAgent();

    // RÉFLEXE SYSTÉMATIQUE : publication automatique dans la Library
    // communautaire (Supabase) en même temps que la notification locale.
    let libResult = null;
    try {
      libResult = await Promise.race([
        publishToLibrary(resolvedPath, filename, meta.type, agentName),
        new Promise(resolve => setTimeout(() => resolve({ error: 'délai dépassé' }), 8000)),
      ]);
    } catch (e) {
      libResult = { error: e.message };
    }

    notifyAssetCreated(resolvedPath, filename, agentName, agentColor, libResult);
  }, 800);
}

// Anti double-publication : clé = nom + taille, fenêtre d'1 minute
const libraryPublishLog = new Map();

function publishToLibrary(filePath, filename, assetType, agentName) {
  return (async () => {
    try {
      const stat = fs.statSync(filePath);
      const key = `${filename}:${stat.size}`;
      const last = libraryPublishLog.get(key);
      if (last && Date.now() - last < 60000) return { skipped: true };
      libraryPublishLog.set(key, Date.now());

      const res = await libraryUploadFile(filePath, filename, assetType, agentName);
      if (res.success) console.log('[Library] ✅ Publié automatiquement :', filename);
      else console.error('[Library] ✗ Non publié (' + filename + ') :', res.error || '?');
      return res;
    } catch (err) {
      return { error: err.message };
    }
  })();
}

function watchAssetFolder(dirPath) {
  if (!fs.existsSync(dirPath)) {
    try { fs.mkdirSync(dirPath, { recursive: true }); } catch (e) { return; }
  }
  const w = fs.watch(dirPath, { recursive: false }, (eventType, filename) => {
    if (!filename || eventType !== 'rename') return;
    const ext = filename.split('.').pop().toLowerCase();
    if (!ASSET_EXT_MAP[ext]) return;
    // Only handle files that arrive here (not deletions/moves-out)
    const filePath = path.join(dirPath, filename);
    // Use a small delay to let the file system settle, then check existence
    setTimeout(() => {
      if (fs.existsSync(filePath)) {
        handleNewAssetFile(filePath, filename);
      }
    }, 200);
  });
  assetWatchers.push(w);
  console.log('[AssetWatcher] Surveillance :', dirPath);
}

// Also watch the project root for misplaced asset files — move them first, then notify
function watchProjectRoot(projectPath) {
  const w = fs.watch(projectPath, { recursive: false }, (eventType, filename) => {
    if (!filename || eventType !== 'rename') return;
    const ext = filename.split('.').pop().toLowerCase();
    if (!ASSET_EXT_MAP[ext]) return;

    const filePath = path.join(projectPath, filename);
    setTimeout(() => {
      if (!fs.existsSync(filePath)) return; // already moved or deleted
      try {
        const stat = fs.statSync(filePath);
        if (!stat.isFile() || stat.size === 0) return;
      } catch (e) { return; }

      // Move to correct subfolder — this will trigger watchAssetFolder,
      // but handleNewAssetFile deduplicates by filename so only one notif fires.
      autoMoveAsset(filePath, filename);
    }, 400);
  });
  assetWatchers.push(w);
  console.log('[AssetWatcher] Surveillance racine :', projectPath);
}

function startFileSync(projectPath) {
  if (currentSyncProjectPath === projectPath) {
    console.log('[FileSync] Deja actif pour:', projectPath);
    return;
  }
  
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  // Stop previous asset watchers
  assetWatchers.forEach(w => { try { w.close(); } catch(e) {} });
  assetWatchers = [];

  const srcPath = path.join(projectPath, 'src');
  if (!fs.existsSync(srcPath)) {
    console.log('[FileSync] Dossier src introuvable, sync desactivee');
    currentSyncProjectPath = null;
    return;
  }

  console.log('[FileSync] Surveillance activee pour:', srcPath);
  currentSyncProjectPath = projectPath;

  fileWatcher = fs.watch(srcPath, { recursive: true }, async (eventType, filename) => {
    if (!filename) return;
    const ext = path.extname(filename).toLowerCase();
    const isLua = ext === '.lua';
    const isTs = ext === '.ts' || ext === '.tsx';
    if (!isLua && !isTs) return;
    const now = Date.now();
    if (now - lastSyncTime < 400) return;
    lastSyncTime = now;
    const filePath = path.join(srcPath, filename);
    if (!fs.existsSync(filePath)) return;

    // TypeScript : compiler d'abord, puis sync le fichier compile
    if (isTs) {
      const tsConfigPath = path.join(path.dirname(srcPath), 'tsconfig.json');
      if (fs.existsSync(tsConfigPath)) {
        console.log('[FileSync] Compilation TypeScript pour:', filename);
        const result = await compileTypeScript(path.dirname(srcPath));
        if (result.success) {
          // Resolver le fichier compile dans out/
          const outDir = path.join(path.dirname(srcPath), 'out');
          const relativeToSrc = filename.replace(/\\/g, '/');
          const baseName = path.basename(filename, ext);
          const outExt = '.luau';
          // Chercher le fichier compile correspondant dans out/
          const serviceName = relativeToSrc.split('/')[0];
          const compiledPath = path.join(outDir, serviceName, path.dirname(filename).replace(/\\/g, '/').replace(/^[^/]+\//, ''), baseName + outExt);
          if (fs.existsSync(compiledPath)) {
            try {
              const compiledSource = fs.readFileSync(compiledPath, 'utf8');
              const compiledFilename = path.relative(srcPath, compiledPath).replace(/\\/g, '/');
              syncScriptToStudio(compiledFilename, compiledSource);
            } catch (err) {
              console.error('[FileSync] Erreur lecture fichier compile:', err.message);
            }
          } else {
            console.warn('[FileSync] Fichier compile introuvable:', compiledPath);
          }
        } else {
          console.error('[FileSync] Echec compilation TypeScript:', result.error);
        }
        return;
      }
    }

    // Lua : sync direct
    try {
      const source = fs.readFileSync(filePath, 'utf8');
      syncScriptToStudio(filename, source);
    } catch (err) {
      console.error('[FileSync] Erreur lecture:', err.message);
    }
  });

  // Watch asset subfolders + project root for any new image/sound/model
  watchProjectRoot(projectPath);
  watchAssetFolder(path.join(projectPath, 'assets'));
  watchAssetFolder(path.join(projectPath, 'sounds'));
  watchAssetFolder(path.join(projectPath, 'models'));
}

function stopFileSync() {
  if (fileWatcher) {
    fileWatcher.close();
    fileWatcher = null;
  }
  assetWatchers.forEach(w => { try { w.close(); } catch(e) {} });
  assetWatchers = [];
  currentSyncProjectPath = null;
  console.log('[FileSync] Surveillance arretee');
}

// ============================================
// TYPESCRIPT COMPILATION (roblox-ts)
// ============================================
function compileTypeScript(projectPath) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32';
    const rbxtscBin = isWin ? 'node_modules\\.bin\\rbxtsc.cmd' : 'node_modules/.bin/rbxtsc';
    const rbxtscPath = path.join(projectPath, rbxtscBin);
    const proc = spawn(rbxtscPath, [], {
      cwd: projectPath,
      shell: true,
      windowsHide: true
    });
    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', d => stdout += d.toString());
    proc.stderr.on('data', d => stderr += d.toString());
    proc.on('close', (code) => {
      if (code === 0) {
        console.log('[TypeScript] Compilation reussie pour:', projectPath);
        resolve({ success: true });
      } else {
        console.error('[TypeScript] Echec compilation (code ' + code + '):', stderr || stdout);
        resolve({ success: false, error: stderr || stdout || 'Compilation echouee' });
      }
    });
    proc.on('error', (err) => {
      console.error('[TypeScript] Erreur lancement rbxtsc:', err.message);
      resolve({ success: false, error: err.message });
    });
  });
}

function getScriptClassName(serviceName, relativePath) {
  if (relativePath.includes('StarterPlayer') || relativePath.includes('StarterGui') || relativePath.includes('StarterPack')) {
    return 'LocalScript';
  }
  if (relativePath.includes('ServerScriptService')) {
    return 'Script';
  }
  return 'ModuleScript';
}

function httpRequest(hostname, port, path, body) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname, port, path, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }
    };
    const req = require('http').request(options, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function syncScriptToStudio(filename, source) {
  const ping = await isStudioConnected();
  if (!ping.connected) {
    console.error('[FileSync] Studio deconnecte, sync ignore:', filename);
    console.error('[FileSync] Detail:', ping.error);
    console.error('[FileSync] ACTION REQUISE: Ouvre Roblox Studio et verifie que le plugin Forge est charge (Plugins > Forge).');
    return { error: 'Studio deconnecte — ' + ping.error };
  }

  const normalized = filename.replace(/\\/g, '/');
  let relativePath = normalized;
  const srcIndex = normalized.indexOf('src/');
  if (srcIndex !== -1) {
    relativePath = normalized.slice(srcIndex + 4);
  } else if (normalized.startsWith('src/')) {
    relativePath = normalized.slice(4);
  }
  const pathParts = relativePath.split('/');
  if (pathParts.length < 2) return { error: 'Chemin trop court' };
  const serviceName = pathParts[0];
  const scriptName = pathParts[pathParts.length - 1].replace('.lua', '');
  const parentParts = pathParts.slice(1, -1);
  const scriptClass = getScriptClassName(serviceName, normalized);

  let injectCode = `local service = game:GetService("${serviceName}")\n`;
  injectCode += `local parent = service\n`;
  parentParts.forEach((part, i) => {
    injectCode += `local folder${i} = parent:FindFirstChild("${part}") or Instance.new("Folder", parent)\n`;
    injectCode += `folder${i}.Name = "${part}"\n`;
    injectCode += `parent = folder${i}\n`;
  });
  injectCode += `local script = parent:FindFirstChild("${scriptName}") or Instance.new("${scriptClass}", parent)\n`;
  injectCode += `script.Name = "${scriptName}"\n`;
  injectCode += `script.Source = ${JSON.stringify(source)}\n`;
  const execCode = source;
  const fullCode = injectCode + "\n" + execCode;

  // Sync prioritaire : utilise le serveur MCP dedie au file sync (pas de queue avec les agents)
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await syncMcpCallTool('execute_luau', {
        code: fullCode,
        datamodel_type: 'Edit'
      }, 5000);
      console.log('[FileSync] ✓ Sync + exec OK:', relativePath);
      if (result && result.content) {
        const text = result.content.map(c => c.text).join('');
        console.log('[FileSync] Resultat MCP:', text.substring(0, 300));
      }
      return { success: true, result };
    } catch (err) {
      if (attempt === 0) {
        console.warn('[FileSync] Tentative 1 echouee, retry dans 2s:', err.message);
        await new Promise(r => setTimeout(r, 2000));
      } else {
        console.error('[FileSync] ✗ MCP Error (2 tentatives):', err.message);
        return { error: err.message };
      }
    }
  }
}

ipcMain.handle('start-file-sync', async (event, projectPath) => {
  startFileSync(projectPath);
  return { success: true };
});

ipcMain.handle('stop-file-sync', async () => {
  stopFileSync();
  return { success: true };
});

// ============================================
// Auto-update (electron-updater + GitHub Releases)
// ============================================
const { autoUpdater } = require('electron-updater');

autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

autoUpdater.on('update-available', (info) => {
  console.log('[Updater] MAJ disponible: v' + info.version);
  dialog.showMessageBox({
    type: 'info',
    title: 'Mise à jour disponible',
    message: `Une nouvelle version (v${info.version}) est disponible.\nVoulez-vous la télécharger ?`,
    buttons: ['Télécharger', 'Plus tard']
  }).then(({ response }) => {
    if (response === 0) autoUpdater.downloadUpdate();
  });
});

autoUpdater.on('update-downloaded', () => {
  dialog.showMessageBox({
    type: 'info',
    title: 'Mise à jour prête',
    message: 'La mise à jour a été téléchargée.\nL\'app va redémarrer pour appliquer les changements.',
    buttons: ['Redémarrer', 'Plus tard']
  }).then(({ response }) => {
    if (response === 0) autoUpdater.quitAndInstall();
  });
});

autoUpdater.on('error', (err) => {
  console.error('[Updater] Erreur:', err.message);
  console.error('[Updater] Detail:', JSON.stringify(err));
});

// ============================================
app.whenReady().then(() => {
  createWindow();
  // Verifier les MAJ apres 5s pour laisser le temps au window de se charger
  setTimeout(() => {
    console.log('[Updater] Verification des mises a jour...');
    autoUpdater.checkForUpdates().catch((err) => {
      console.error('[Updater] Echec verification:', err.message);
    });
  }, 5000);
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => {
  if (mcpServerProcess) { mcpServerProcess.kill(); mcpServerProcess = null; }
  if (syncMcpProcess) { syncMcpProcess.kill(); syncMcpProcess = null; }
  // Nettoyer l'etat des agents a la fermeture
  try {
    const agentsStatePath = userDataFile('agents-state.json');
    removeIfExists(agentsStatePath);
  } catch (e) {}
  if (process.platform !== 'darwin') app.quit();
});
