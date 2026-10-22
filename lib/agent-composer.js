(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ForgeAgentComposer = factory();
})(typeof window === 'object' ? window : globalThis, function() {
  function mount({ agent, panel, labels, send, confirmDuplicate, onDraft, onSent }) {
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
    const longActions = doc.createElement('div'); longActions.className = 'agent-composer-long-actions'; longActions.hidden = true;
    const excerptButton = doc.createElement('button'); excerptButton.type = 'button'; excerptButton.textContent = labels.sendExcerpt;
    const allButton = doc.createElement('button'); allButton.type = 'button'; allButton.textContent = labels.sendAll;
    longActions.append(excerptButton, allButton);
    footer.append(hint, button); form.append(input, footer, status, longActions); panel.append(form);
    let busy = false, disposed = false;
    function refresh() {
      button.disabled = busy || !input.value.trim() || !agent.sessionId || agent.starting || agent._closed;
      button.textContent = busy ? labels.sending : labels.send;
      hint.textContent = agent.sessionId ? labels.hint : labels.start;
    }
    input.addEventListener('input', () => { agent.draft = input.value; status.textContent = ''; longActions.hidden = true; onDraft(); refresh(); });
    // Native editing/paste stays inside this field, away from page/terminal shortcuts.
    input.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault(); submit();
      }
    });
    input.addEventListener('paste', event => event.stopPropagation());
    form.addEventListener('submit', event => { event.preventDefault(); submit(); });
    excerptButton.addEventListener('click', () => submit('excerpt'));
    allButton.addEventListener('click', () => submit('all'));
    async function dispatch(textToSend, clearComposer, missionText) {
      if (busy || disposed || !String(textToSend || '').trim()) return { error: labels.failed };
      const sessionId = agent.sessionId;
      if (!sessionId || agent.starting || agent._closed) { status.textContent = labels.start; return { error: labels.start }; }
      const text = String(textToSend), originalText = String(missionText || text);
      busy = true; status.textContent = ''; longActions.hidden = true; refresh();
      try {
        let result = await send(sessionId, text, agent.xterm?.modes?.bracketedPasteMode === true, { missionText: originalText });
        if (result?.duplicate === true) {
          const accepted = typeof confirmDuplicate === 'function' && confirmDuplicate(result) === true;
          if (!accepted) return result;
          result = await send(sessionId, text, agent.xterm?.modes?.bracketedPasteMode === true, { missionText: originalText, allowDuplicate: true });
        }
        if (!result?.success) throw new Error(result?.error || labels.failed);
        if (disposed || agent.sessionId !== sessionId) return { error: labels.failed };
        if (clearComposer && input.value === originalText) { input.value = ''; agent.draft = ''; }
        onSent(originalText); if (clearComposer) onDraft();
        return result;
      } catch (error) {
        if (!disposed) status.textContent = error.message || labels.failed;
        return { error: error.message || labels.failed };
      } finally { busy = false; if (!disposed) refresh(); }
    }
    async function submit(mode) {
      if (busy || disposed || !input.value.trim()) return;
      const originalText = input.value;
      if (!agent.sessionId || agent.starting || agent._closed) { status.textContent = labels.start; return; }
      const budget = typeof ForgeAgentMessageBudget === 'object' ? ForgeAgentMessageBudget : null;
      if (!mode && budget?.isLongMessage(originalText)) {
        status.textContent = labels.longWarning;
        longActions.hidden = false;
        return;
      }
      const text = mode === 'excerpt' && budget ? budget.compactMessage(originalText, undefined, {
        header: labels.excerptHeader,
        footer: labels.excerptFooter,
        omitted: labels.excerptOmitted,
      }) : originalText;
      return dispatch(text, true, originalText);
    }
    refresh();
    return {
      input,
      refresh,
      sendText(text) { return dispatch(String(text || ''), false, String(text || '')); },
      dispose() { disposed = true; form.remove(); },
    };
  }
  return { mount };
});
