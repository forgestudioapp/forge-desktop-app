let codexLoginSession = null, codexLoginTerminal = null, codexLoginOpening = false;
const codexLoginEarly = new Map();
const codexLoginDialog = document.getElementById('codexLoginDialog');
const codexLoginStatus = document.getElementById('codexLoginStatus');
window.forgeAPI?.onPtyData?.(event => {
  if (event.sessionId === codexLoginSession) codexLoginTerminal?.write(event.data);
  else if (codexLoginOpening) codexLoginEarly.set(event.sessionId, (codexLoginEarly.get(event.sessionId) || '') + event.data);
});
async function refreshCodexLoginStatus() {
  const result = await window.forgeAPI.detectAgent('codex');
  codexLoginStatus.textContent = result.auth?.state === 'connected' ? 'Compte connecté. Tu peux fermer cette fenêtre et ouvrir ton projet.' : 'Connexion non confirmée. Termine les étapes indiquées ou réessaie.';
  await detectAll();
}
window.forgeAPI?.onPtyExit?.(event => {
  if (event.sessionId === codexLoginSession) {
    codexLoginSession = null;
    refreshCodexLoginStatus().catch(() => { codexLoginStatus.textContent = 'Vérification indisponible. Utilise Vérifier la connexion.'; });
  } else if (codexLoginOpening) codexLoginEarly.set(event.sessionId + ':exit', true);
});
async function openCodexLogin() {
  if (codexLoginOpening || codexLoginDialog.open) return;
  codexLoginOpening = true;
  codexLoginEarly.clear();
  codexLoginDialog.showModal();
  codexLoginStatus.textContent = 'Ouverture de la connexion officielle OpenAI…';
  codexLoginTerminal = new Terminal({ cols: 90, rows: 20, fontSize: 13, cursorBlink: true, theme: { background: '#14110e', foreground: '#f3ede3' } });
  const fit = new FitAddon();
  codexLoginTerminal.loadAddon(fit);
  codexLoginTerminal.open(document.getElementById('codexLoginTerminal'));
  fit.fit();
  codexLoginTerminal.onData(data => { if (codexLoginSession) window.forgeAPI.ptyInput(codexLoginSession, data); });
  try {
    const result = await window.forgeAPI.codexLogin();
    if (result.error) throw new Error(result.error);
    if (!codexLoginDialog.open) { await window.forgeAPI.ptyKill(result.sessionId); return; }
    codexLoginSession = result.sessionId;
    codexLoginTerminal.write(codexLoginEarly.get(result.sessionId) || '');
    await window.forgeAPI.ptyResize(result.sessionId, codexLoginTerminal.cols, codexLoginTerminal.rows);
    if (codexLoginEarly.has(result.sessionId + ':exit')) { codexLoginSession = null; await refreshCodexLoginStatus(); }
    codexLoginTerminal.focus();
  } catch (error) { codexLoginStatus.textContent = 'Connexion impossible : ' + error.message; }
  finally { codexLoginOpening = false; codexLoginEarly.clear(); }
}
function closeCodexLogin() {
  if (codexLoginSession) window.forgeAPI.ptyKill(codexLoginSession);
  codexLoginSession = null;
  codexLoginTerminal?.dispose();
  codexLoginTerminal = null;
  document.getElementById('codexLoginTerminal').replaceChildren();
  codexLoginDialog.close();
  detectAll();
}
document.getElementById('closeCodexLogin').addEventListener('click', closeCodexLogin);
codexLoginDialog.addEventListener('cancel', event => { event.preventDefault(); closeCodexLogin(); });
