'use strict';

// Restore Chromium keyboard focus after navigation and Windows activation.
// Background windows must not steal focus from other applications.
function attachWindowInputFocus(win) {
  const focusContents = () => {
    if (!win.isDestroyed() && win.isFocused() && !win.webContents.isDestroyed()) {
      win.webContents.focus();
    }
  };
  win.on('focus', focusContents);
  win.webContents.on('did-finish-load', focusContents);
}

function focusLoginInput(event, BrowserWindow, loginUrl) {
  if (event.senderFrame !== event.sender.mainFrame || event.sender.getURL().split(/[?#]/)[0] !== loginUrl) return;
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed() || !win.isVisible() || win.isMinimized()) return;
  win.focus();
  event.sender.focus();
}

module.exports = { attachWindowInputFocus, focusLoginInput };
