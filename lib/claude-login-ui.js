let claudeLoginSession = null, claudeLoginTerminal = null, claudeLoginOpening = false;
const claudeLoginEarly = new Map();
const claudeLoginDialog = document.getElementById('claudeLoginDialog');
const claudeLoginStatus = document.getElementById('claudeLoginStatus');
window.forgeAPI?.onPtyData?.(event => {
  if (event.sessionId === claudeLoginSession) claudeLoginTerminal?.write(event.data);
  else if (claudeLoginOpening) claudeLoginEarly.set(event.sessionId, (claudeLoginEarly.get(event.sessionId) || '') + event.data);
});
async function refreshClaudeLoginStatus() {
  const result = await window.forgeAPI.detectAgent('claude');
  claudeLoginStatus.textContent = result.auth?.state === 'connected' ? 'Compte connecté. Tu peux fermer cette fenêtre et ouvrir ton projet.' : 'Connexion non confirmée. Termine les étapes indiquées ou réessaie.';
  await detectAll();
}
window.forgeAPI?.onPtyExit?.(event => {
  if (event.sessionId === claudeLoginSession) {
    claudeLoginSession = null;
    refreshClaudeLoginStatus().catch(() => { claudeLoginStatus.textContent = 'Vérification indisponible. Utilise Vérifier la connexion.'; });
  } else if (claudeLoginOpening) claudeLoginEarly.set(event.sessionId + ':exit', true);
});
async function openClaudeLogin() {
  if (claudeLoginOpening || claudeLoginDialog.open) return;
  claudeLoginOpening = true;
  claudeLoginEarly.clear();
  claudeLoginDialog.showModal();
  claudeLoginStatus.textContent = 'Ouverture de la connexion officielle Claude…';
  claudeLoginTerminal = new Terminal({ cols: 90, rows: 20, fontSize: 13, cursorBlink: true, theme: { background: '#14110e', foreground: '#f3ede3' } });
  const fit = new FitAddon();
  claudeLoginTerminal.loadAddon(fit);
  claudeLoginTerminal.open(document.getElementById('claudeLoginTerminal'));
  fit.fit();
  claudeLoginTerminal.onData(data => { if (claudeLoginSession) window.forgeAPI.ptyInput(claudeLoginSession, data); });
  try {
    const result = await window.forgeAPI.claudeLogin();
    if (result.error) throw new Error(result.error);
    if (!claudeLoginDialog.open) { await window.forgeAPI.ptyKill(result.sessionId); return; }
    claudeLoginSession = result.sessionId;
    claudeLoginTerminal.write(claudeLoginEarly.get(result.sessionId) || '');
    await window.forgeAPI.ptyResize(result.sessionId, claudeLoginTerminal.cols, claudeLoginTerminal.rows);
    if (claudeLoginEarly.has(result.sessionId + ':exit')) { claudeLoginSession = null; await refreshClaudeLoginStatus(); }
    claudeLoginTerminal.focus();
  } catch (error) { claudeLoginStatus.textContent = 'Connexion impossible : ' + error.message; }
  finally { claudeLoginOpening = false; claudeLoginEarly.clear(); }
}
function closeClaudeLogin() {
  if (claudeLoginSession) window.forgeAPI.ptyKill(claudeLoginSession);
  claudeLoginSession = null;
  claudeLoginTerminal?.dispose();
  claudeLoginTerminal = null;
  document.getElementById('claudeLoginTerminal').replaceChildren();
  claudeLoginDialog.close();
  detectAll();
}
document.getElementById('closeClaudeLogin').addEventListener('click', closeClaudeLogin);
claudeLoginDialog.addEventListener('cancel', event => { event.preventDefault(); closeClaudeLogin(); });
