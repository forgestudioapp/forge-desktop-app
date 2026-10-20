const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const VERSION = 1;
const PROTECTION = 'electron-safe-storage';

function writeAtomic(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally {
    if (fs.existsSync(temporary)) fs.unlinkSync(temporary);
  }
}

function encryptionAvailable(safeStorage) {
  return Boolean(
    safeStorage
    && safeStorage.isEncryptionAvailable()
    && safeStorage.getSelectedStorageBackend?.() !== 'basic_text'
  );
}

function createProtectedJsonStore(file, safeStorage) {
  function decodeEnvelope(envelope) {
    if (!encryptionAvailable(safeStorage)) {
      throw new Error('Le chiffrement système est indisponible. La session enregistrée est conservée mais ne peut pas être ouverte.');
    }
    if (!envelope || envelope.version !== VERSION || envelope.protection !== PROTECTION || typeof envelope.payload !== 'string') {
      throw new Error('Le format de session protégée est inconnu. Le fichier a été conservé.');
    }
    try {
      const plaintext = safeStorage.decryptString(Buffer.from(envelope.payload, 'base64'));
      return JSON.parse(plaintext);
    } catch {
      throw new Error('La session protégée est illisible. Le fichier a été conservé ; reconnecte le compte pour le remplacer.');
    }
  }

  function write(value) {
    if (!encryptionAvailable(safeStorage)) {
      throw new Error('Le chiffrement système est indisponible. La session ne sera pas enregistrée en clair.');
    }
    const payload = safeStorage.encryptString(JSON.stringify(value)).toString('base64');
    writeAtomic(file, { version: VERSION, protection: PROTECTION, payload });
  }

  function read(options = {}) {
    if (!fs.existsSync(file)) return null;
    let parsed;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      throw new Error('Le fichier de session est endommagé. Il a été conservé pour récupération.');
    }
    if (parsed?.protection || Object.prototype.hasOwnProperty.call(parsed || {}, 'version')) {
      return decodeEnvelope(parsed);
    }
    if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
      throw new Error('L’ancienne session est invalide. Le fichier a été conservé.');
    }
    if (options.migrate !== false) write(parsed);
    return parsed;
  }

  function remove() {
    if (fs.existsSync(file)) fs.unlinkSync(file);
  }

  function status() {
    if (!fs.existsSync(file)) return { stored: false, readable: false, protected: false };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const protectedValue = parsed?.version === VERSION && parsed?.protection === PROTECTION;
      read({ migrate: false });
      return { stored: true, readable: true, protected: protectedValue };
    } catch (error) {
      return { stored: true, readable: false, protected: false, error: error.message };
    }
  }

  return { read, write, remove, status, file };
}

module.exports = { createProtectedJsonStore, encryptionAvailable, writeAtomic };
