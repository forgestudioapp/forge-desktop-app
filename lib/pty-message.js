const MAX_MESSAGE_LENGTH = 200000;

function createPtyMessageSender(getSession, wait = ms => new Promise(resolve => setTimeout(resolve, ms))) {
  const sending = new Set();
  return async function sendMessage(sessionId, text, bracketedPaste) {
    if (typeof text !== 'string' || !text.trim()) return { error: 'Écris un message avant de l’envoyer.' };
    if (text.length > MAX_MESSAGE_LENGTH) return { error: 'Message trop long (200 000 caractères maximum).' };
    if (/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(text)) return { error: 'Le texte contient des caractères de contrôle. Colle du texte brut.' };
    const entry = getSession(sessionId);
    if (!entry) return { error: 'Cet agent est arrêté. Démarre-le avant d’envoyer ton message.' };
    if (sending.has(sessionId)) return { error: 'Un envoi est déjà en cours pour cet agent.' };
    if (bracketedPaste !== true && /[\r\n\t]/.test(text)) {
      return { error: 'Le terminal n’a pas encore activé le collage multiligne. Termine son démarrage puis réessaie ; ton brouillon est conservé.' };
    }
    sending.add(sessionId);
    let pasted = false;
    try {
      const normalized = text.replace(/\r\n?/g, '\n');
      // Paste and submit separately so the CLI receives Enter as a key, not part of the paste.
      entry.pty.write(bracketedPaste === true ? '\x1b[200~' + normalized + '\x1b[201~' : normalized);
      pasted = true;
      await wait(150);
      if (getSession(sessionId) !== entry) throw new Error('La session a changé pendant l’envoi.');
      entry.pty.write('\r');
      return { success: true };
    } catch (error) {
      return { error: (error.message || 'Envoi impossible.') + (pasted ? ' Le texte a pu être collé : vérifie le terminal avant de réessayer.' : '') };
    } finally { sending.delete(sessionId); }
  };
}

module.exports = { createPtyMessageSender };
