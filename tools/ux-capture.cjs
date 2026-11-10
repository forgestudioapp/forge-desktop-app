'use strict';
// Captures de contrôle visuel avec un profil et des données fictifs.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { projectHealth } = require('../lib/project-health');

const root = path.join(__dirname, '..');
const output = process.argv[2] || path.join(root, 'docs', 'ux-captures');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-ux-capture-'));
app.setPath('userData', profile);
app.on('window-all-closed', () => {});
let project = { name: 'Mon premier jeu', path: path.join(profile, 'mon-premier-jeu'), language: 'typescript', syncPaused: true, linkedStudio: null };
let studioOpen = false, linked = 0, synced = 0;
const handle = (name, callback) => ipcMain.handle(name, (_event, ...args) => callback(...args));
handle('is-forge-connected', () => ({ connected: true }));
handle('create-project', name => { project = { name, path: path.join(profile, name), language: 'typescript', syncPaused: true, linkedStudio: null }; return { success: true, path: project.path }; });
handle('get-studio-place-info', () => studioOpen ? { place: { placeId: '123', placeName: 'Place de test' } } : { error: 'Studio fermé' });
handle('link-project-studio', (_path, options) => { if (options.expectedPlaceId !== '123') return { error: 'La place a changé.', code: 'place-changed' }; linked++; project.linkedStudio = { placeId: '123', placeName: 'Place de test' }; return { success: true, project }; });
handle('start-file-sync', () => { synced++; project.syncPaused = false; return { success: true, firstSync: { status: 'confirmed', buildId: 'build-test' } }; });
handle('get-active-project', () => ({ project }));
handle('list-projects', () => ({ projects: [project, { name: 'Course spatiale', path: path.join(profile, 'course-spatiale'), linkedStudio: { placeName: 'Course spatiale', placeId: '123' }, syncPaused: false }] }));
handle('places-list', () => ({ manifest: { places: [] }, reservations: {}, syncByPlace: {}, currentPlaceId: null, studioError: 'Studio fermé' }));
handle('get-project-health', () => projectHealth(project, { phase: 'local', pending: 0 }, { ready: false, code: 'studio-unavailable' }));
handle('load-agent-state', () => ({ agents: [], projectKey: 'ux-capture', agentCounter: { codex: 1, claude: 1 } }));
handle('save-agent-state', () => ({ success: true }));
handle('agent-activity-list', () => ({ agents: [] }));
handle('notifications-list', () => ({ notifications: [] }));
handle('get-active-project-info', () => ({ project }));
handle('asset-catalog-list', () => ({ assets: [
  { id: 'asset-1', name: 'Icône du jeu', type: 'image', status: 'needs-review', agent: 'Forge', provider: 'Génération locale', localFile: 'assets/icon.png', revisions: [{ number: 1, status: 'needs-review', createdAt: new Date().toISOString() }] },
  { id: 'asset-2', name: 'Musique du menu', type: 'audio', status: 'validated', agent: 'Forge', provider: 'Génération locale', localFile: 'assets/menu.wav', revisions: [{ number: 1, status: 'validated', createdAt: new Date().toISOString() }] },
] }));
handle('media-preview', () => ({}));

async function capture(page, width, height, filename) {
  const win = new BrowserWindow({ show: false, width, height, useContentSize: true, enableLargerThanScreen: true, webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false } });
  if (width > 1500) {
    // Le moniteur de test limite les fenêtres hors écran. Le zoom donne le viewport CSS demandé.
    win.setContentSize(1524, 857);
  }
  await win.loadFile(path.join(root, page));
  await new Promise(resolve => setTimeout(resolve, 600));
  await win.webContents.executeJavaScript('document.body.style.animation="none";document.body.style.opacity="1";document.querySelectorAll(".section-head,.proj-card").forEach(e=>{e.style.animation="none";e.style.opacity="1"})');
  if (width > 1500) win.webContents.setZoomFactor(1524 / width);
  await new Promise(resolve => setTimeout(resolve, 200));
  const image = await win.webContents.capturePage();
  fs.writeFileSync(path.join(output, filename), image.toPNG());
  const metrics = await win.webContents.executeJavaScript('({url:location.pathname.split("/").pop(),width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,opacity:getComputedStyle(document.body).opacity,heading:document.querySelector("h1")?.textContent,headerOpacity:document.querySelector(".projects-header")&&getComputedStyle(document.querySelector(".projects-header")).opacity,wrapOpacity:document.querySelector(".wrap")&&getComputedStyle(document.querySelector(".wrap")).opacity,logo:document.querySelector(".logo-pill")?.getBoundingClientRect().toJSON(),project:document.querySelector(".project-pill")?.getBoundingClientRect().toJSON()})');
  console.log(filename, JSON.stringify(metrics));
  win.destroy();
}

async function checkNewUserFlow() {
  const win = new BrowserWindow({ show: false, width: 1280, height: 720, webPreferences: { preload: path.join(root, 'preload.js'), contextIsolation: true, backgroundThrottling: false } });
  try {
    await win.loadFile(path.join(root, 'project-create.html'));
    await win.webContents.executeJavaScript('document.getElementById("projectNameInput").value="Essai UX";document.getElementById("createBtn").click()');
    await new Promise(resolve => setTimeout(resolve, 900));
    let state = await win.webContents.executeJavaScript('({page:location.pathname.split("/").pop(),text:document.body.innerText})');
    if (state.page !== 'workspace.html' || !state.text.includes('Ouvre dans Roblox Studio')) throw new Error('Studio fermé : parcours non affiché');
    studioOpen = true;
    await new Promise(resolve => setTimeout(resolve, 2300));
    state = await win.webContents.executeJavaScript('({text:document.body.innerText,button:[...document.querySelectorAll("button")].find(b=>b.textContent==="Connecter")?.textContent})');
    if (!state.text.includes('Place de test') || state.button !== 'Connecter') throw new Error('Confirmation de la place absente');
    await win.webContents.executeJavaScript('[...document.querySelectorAll("button")].find(b=>b.textContent==="Connecter").click()');
    await new Promise(resolve => setTimeout(resolve, 250));
    if (linked !== 1 || synced !== 1) throw new Error(`Liaison/synchronisation incorrecte : ${linked}/${synced}`);
    console.log('parcours nouveau projet : Studio fermé → détecté → confirmation → synchronisation : OK');
  } finally { win.destroy(); }
}

app.whenReady().then(async () => {
  fs.mkdirSync(output, { recursive: true });
  try {
    await capture('projects.html', 1280, 720, 'accueil-1280x720.png');
    await capture('project-create.html', 1280, 720, 'creation-1280x720.png');
    await capture('workspace.html', 1280, 720, 'projet-1280x720.png');
    await capture('assets-page.html', 1280, 720, 'assets-1280x720.png');
    await capture('projects.html', 1920, 1080, 'accueil-1920x1080.png');
    await capture('workspace.html', 1920, 1080, 'projet-1920x1080.png');
    await checkNewUserFlow();
  } catch (error) { console.error(error); app.exit(1); return; }
  app.quit();
});
