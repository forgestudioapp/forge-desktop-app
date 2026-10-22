(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ForgeAgentMessageBudget = factory();
})(typeof window === 'object' ? window : globalThis, function() {
  'use strict';
  const LONG_MESSAGE_LENGTH = 12000;
  const DEFAULT_MAX_LENGTH = 8000;
  const SIGNAL = /(?:error|erreur|fail|échec|exception|warning|avertissement|traceback|\bat\s+[^\s]+:\d+|[^\s]+\.(?:js|ts|tsx|jsx|lua|luau|json|md|py|rs|go|java|cs):\d+)/i;

  function isLongMessage(text) { return String(text || '').length > LONG_MESSAGE_LENGTH; }

  function compactMessage(text, maxLength = DEFAULT_MAX_LENGTH, labels = {}) {
    const source = String(text || '').replace(/\r\n?/g, '\n');
    if (source.length <= maxLength) return source;
    const lines = source.split('\n');
    const selected = new Set();
    for (let index = 0; index < Math.min(lines.length, 35); index += 1) selected.add(index);
    for (let index = Math.max(0, lines.length - 35); index < lines.length; index += 1) selected.add(index);
    lines.forEach((line, index) => { if (SIGNAL.test(line)) selected.add(index); });
    const ordered = [...selected].sort((a, b) => a - b);
    const output = [];
    let previous = -2;
    for (const index of ordered) {
      if (index > previous + 1) {
        output.push(String(labels.omitted || '… {count} ligne(s) omise(s) …').replace('{count}', String(index - previous - 1)));
      }
      output.push(lines[index]);
      previous = index;
      if (output.join('\n').length > maxLength - 500) break;
    }
    const body = output.join('\n').slice(0, maxLength - 220);
    const header = String(labels.header || '[Extrait local Forge : {chars} caractères, {lines} lignes. Le texte complet reste dans le brouillon d’origine.]')
      .replace('{chars}', String(source.length)).replace('{lines}', String(lines.length));
    const footer = String(labels.footer || '[Fin de l’extrait]');
    return `${header}\n${body}\n${footer}`;
  }

  return { LONG_MESSAGE_LENGTH, DEFAULT_MAX_LENGTH, isLongMessage, compactMessage };
});
