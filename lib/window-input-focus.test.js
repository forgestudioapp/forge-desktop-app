'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { attachWindowInputFocus, focusLoginInput } = require('./window-input-focus');

function fixture() {
  const win = new EventEmitter();
  const contents = new EventEmitter();
  const state = { focused: false, visible: true, minimized: false, windowCalls: 0, contentCalls: 0 };
  Object.assign(win, { webContents: contents, isDestroyed: () => false,
    isFocused: () => state.focused, isVisible: () => state.visible, isMinimized: () => state.minimized,
    focus: () => { state.focused = true; state.windowCalls++; } });
  Object.assign(contents, { isDestroyed: () => false, focus: () => state.contentCalls++,
    mainFrame: {}, getURL: () => 'file:///forge/login.html' });
  return { win, contents, state, BrowserWindow: { fromWebContents: () => win },
    event: { sender: contents, senderFrame: contents.mainFrame } };
}

test('navigation never activates a background window, but reactivation restores keyboard focus', () => {
  const { win, contents, state } = fixture();
  attachWindowInputFocus(win);
  contents.emit('did-finish-load');
  assert.equal(state.contentCalls, 0);
  state.focused = true;
  win.emit('focus');
  contents.emit('did-finish-load');
  assert.equal(state.contentCalls, 2);
  assert.equal(state.windowCalls, 0);
});

test('login field interaction can restore both native and content focus', () => {
  const { event, BrowserWindow, state } = fixture();
  focusLoginInput(event, BrowserWindow, 'file:///forge/login.html');
  assert.equal(state.windowCalls, 1);
  assert.equal(state.contentCalls, 1);
});

test('other pages, subframes and hidden windows cannot use login focus recovery', () => {
  const { event, BrowserWindow, state } = fixture();
  focusLoginInput(event, BrowserWindow, 'file:///forge/accounts.html');
  focusLoginInput({ ...event, senderFrame: {} }, BrowserWindow, 'file:///forge/login.html');
  state.visible = false;
  focusLoginInput(event, BrowserWindow, 'file:///forge/login.html');
  state.visible = true;
  state.minimized = true;
  focusLoginInput(event, BrowserWindow, 'file:///forge/login.html');
  assert.equal(state.windowCalls, 0);
  assert.equal(state.contentCalls, 0);
});
