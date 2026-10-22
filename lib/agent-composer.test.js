const test = require('node:test');
const assert = require('node:assert/strict');
const { mount } = require('./agent-composer');

function element(ownerDocument) {
  return {
    ownerDocument,
    children: [],
    listeners: {},
    className: '',
    textContent: '',
    value: '',
    hidden: false,
    disabled: false,
    append(...items) { this.children.push(...items); },
    addEventListener(name, listener) { this.listeners[name] = listener; },
    setAttribute() {},
    remove() { this.removed = true; },
  };
}

function fixture() {
  const document = { createElement() { return element(document); } };
  const panel = element(document);
  const labels = {
    placeholder: 'Message', hint: 'Hint', start: 'Start', send: 'Send', sending: 'Sending', failed: 'Failed',
    longWarning: 'Long', sendExcerpt: 'Excerpt', sendAll: 'All', excerptHeader: '', excerptFooter: '', excerptOmitted: '',
  };
  return { panel, labels };
}

test('AI shortcuts send to the active agent without replacing the user draft', async () => {
  const { panel, labels } = fixture();
  const agent = { sessionId: 'codex-1', starting: false, _closed: false, draft: 'Mon brouillon', xterm: { modes: {} } };
  const sent = [], completed = [];
  const composer = mount({
    agent,
    panel,
    labels,
    send: async (...args) => { sent.push(args); return { success: true }; },
    onDraft() {},
    onSent: text => completed.push(text),
  });

  const result = await composer.sendText('Teste le jeu');

  assert.equal(result.success, true);
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].slice(0, 3), ['codex-1', 'Teste le jeu', false]);
  assert.equal(sent[0][3].missionText, 'Teste le jeu');
  assert.equal(composer.input.value, 'Mon brouillon');
  assert.equal(agent.draft, 'Mon brouillon');
  assert.deepEqual(completed, ['Teste le jeu']);
});
