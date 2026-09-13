(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ForgeAgentComposer = factory();
})(typeof window === 'object' ? window : globalThis, function() {
  function mount({ agent, panel, labels, send, onDraft, onSent }) {
    const doc = panel.ownerDocument;
    const form = doc.createElement('form'); form.className = 'agent-composer';
    const input = doc.createElement('textarea'); input.className = 'agent-composer-input';
    input.rows = 2; input.maxLength = 200000; input.spellcheck = false;
    input.value = agent.draft || '';
    input.placeholder = labels.placeholder; input.setAttribute('aria-label', labels.placeholder);
    const footer = doc.createElement('div'); footer.className = 'agent-composer-footer';
    const hint = doc.createElement('span'); hint.className = 'agent-composer-hint'; hint.textContent = labels.hint;
    const button = doc.createElement('button'); button.type = 'submit'; button.className = 'agent-composer-send'; button.textContent = labels.send;
    const status = doc.createElement('div'); status.className = 'agent-composer-status'; status.setAttribute('role', 'status');
    footer.append(hint, button); form.append(input, footer, status); panel.append(form);
    let busy = false, disposed = false;
    function refresh() {
      button.disabled = busy || !input.value.trim() || !agent.sessionId || agent.starting || agent._closed;
      button.textContent = busy ? labels.sending : labels.send;
      hint.textContent = agent.sessionId ? labels.hint : labels.start;
    }
    input.addEventListener('input', () => { agent.draft = input.value; status.textContent = ''; onDraft(); refresh(); });
    // Native editing/paste stays inside this field, away from page/terminal shortcuts.
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault(); submit();
      }
    });
    input.addEventListener('paste', event => event.stopPropagation());
    form.addEventListener('submit', event => { event.preventDefault(); submit(); });
    async function submit() {
      if (busy || disposed || !input.value.trim()) return;
      const sessionId = agent.sessionId, text = input.value;
      if (!sessionId || agent.starting || agent._closed) { status.textContent = labels.start; return; }
      busy = true; status.textContent = ''; refresh();
      try {
        const result = await send(sessionId, text, agent.xterm?.modes?.bracketedPasteMode === true);
        if (!result?.success) throw new Error(result?.error || labels.failed);
        if (disposed || agent.sessionId !== sessionId) return;
        if (input.value === text) { input.value = ''; agent.draft = ''; }
        onSent(text); onDraft();
      } catch (error) { if (!disposed) status.textContent = error.message || labels.failed; }
      finally { busy = false; if (!disposed) refresh(); }
    }
    refresh();
    return { input, refresh, dispose() { disposed = true; form.remove(); } };
  }
  return { mount };
});
