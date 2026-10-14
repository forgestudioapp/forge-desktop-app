const path = require('node:path');
const { fileURLToPath } = require('node:url');

function navigationKind(url, root) {
  try {
    const parsed = new URL(url);
    if (parsed.protocol === 'https:' || parsed.protocol === 'http:') return 'external';
    if (parsed.protocol !== 'file:') return 'deny';
    const file = fileURLToPath(parsed);
    return path.dirname(path.resolve(file)).toLowerCase() === path.resolve(root).toLowerCase() && path.extname(file) === '.html' ? 'internal' : 'deny';
  } catch { return 'deny'; }
}
function attachWindowNavigation(win, { root, openExternal }) {
  win.webContents.setWindowOpenHandler(({ url }) => {
    const kind = navigationKind(url, root);
    if (kind === 'internal') win.loadURL(url);
    else if (kind === 'external') openExternal(url);
    return { action: 'deny' };
  });
  win.webContents.on('will-navigate', (event, url) => {
    const kind = navigationKind(url, root);
    if (kind !== 'internal') { event.preventDefault(); if (kind === 'external') openExternal(url); }
  });
}
module.exports = { navigationKind, attachWindowNavigation };
