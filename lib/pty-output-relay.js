// One subscription per PTY. Navigation only changes the destination renderer.
function createPtyOutputRelay(pty, sessionId, initialSender, onExit) {
  let sender = initialSender, disposed = false;
  const subscriptions = [];
  function deliver(channel, payload) {
    try {
      if (sender && !sender.isDestroyed()) sender.send(channel, { sessionId, ...payload });
    } catch (_) { /* The renderer may close between isDestroyed() and send(). */ }
  }
  function dispose() {
    if (disposed) return;
    disposed = true; sender = null;
    for (const subscription of subscriptions) subscription.dispose();
  }
  subscriptions.push(pty.onData(data => { if (!disposed) deliver('pty-data', { data }); }));
  subscriptions.push(pty.onExit(({ exitCode, signal }) => {
    if (disposed) return;
    deliver('pty-exit', { exitCode, signal });
    dispose();
    onExit();
  }));
  return {
    setSender(nextSender) { if (disposed) return false; sender = nextSender; return true; },
    dispose,
  };
}

module.exports = { createPtyOutputRelay };
