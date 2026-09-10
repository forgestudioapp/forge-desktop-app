const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { StringDecoder } = require('string_decoder');

// One lazily started child, with project switches serialized after active calls.
// A failed call is never replayed automatically: tools may have side effects.
class MemoryMcp {
  constructor({ getBinary, spawnProcess = spawn, timeoutMs = 15000, idleMs = 60000 }) {
    this.getBinary = getBinary;
    this.spawnProcess = spawnProcess;
    this.timeoutMs = timeoutMs;
    this.idleMs = idleMs;
    this.queue = Promise.resolve();
    this.session = null;
    this.closed = false;
  }

  call(projectPath, name, args, timeoutMs = this.timeoutMs) {
    const run = this.queue.then(async () => {
      if (this.closed) throw new Error('MemoryMCP fermé');
      const root = fs.realpathSync(projectPath);
      if (!fs.statSync(root).isDirectory()) throw new Error('Projet invalide');
      clearTimeout(this.idleTimer);
      if (this.session && this.session.root !== root) this.stop(this.session, new Error('Changement de projet'));
      const session = this.session || this.start(root);
      try {
        if (!session.ready) {
          await this.send(session, 'initialize', { protocolVersion: '2024-11-05', capabilities: {},
            clientInfo: { name: 'forge-memory', version: '1.0.0' } }, timeoutMs);
          await new Promise((resolve, reject) => session.child.stdin.write(JSON.stringify({
            jsonrpc: '2.0', method: 'notifications/initialized',
          }) + '\n', err => err ? reject(err) : resolve()));
          session.ready = true;
        }
        return await this.send(session, 'tools/call', { name, arguments: args }, timeoutMs);
      } catch (err) {
        this.stop(session, err);
        throw err;
      } finally {
        this.idleTimer = setTimeout(() => this.stop(session, new Error('MemoryMCP inactif')), this.idleMs);
        this.idleTimer.unref?.();
      }
    });
    this.queue = run.catch(() => {});
    return run;
  }

  start(root) {
    const binary = this.getBinary();
    if (!binary || !fs.existsSync(binary)) throw new Error('MemoryMCP binaire optionnel manquant; index local de fichiers disponible séparément.');
    const indexDir = path.join(root, '.forge-memory');
    fs.mkdirSync(indexDir, { recursive: true });
    if (fs.lstatSync(indexDir).isSymbolicLink()) throw new Error('Dossier mémoire non sûr');
    const child = this.spawnProcess(binary, ['serve', '--project', root, '--index-dir', indexDir],
      { env: process.env, windowsHide: true, shell: false });
    const session = { root, child, pending: new Map(), nextId: 0, ready: false, dead: false };
    this.session = session;
    let buffer = '';
    const decoder = new StringDecoder('utf8');
    child.stdout.on('data', chunk => {
      if (session.dead) return;
      buffer += decoder.write(chunk);
      let end;
      while ((end = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 1);
        if (line.length > 8 * 1024 * 1024) { this.stop(session, new Error('Réponse MemoryMCP trop volumineuse')); return; }
        let message;
        try { message = JSON.parse(line); } catch (_) { continue; }
        const pending = session.pending.get(message?.id);
        if (!pending) continue;
        if (message.error) pending.reject(new Error(message.error.message || 'Erreur MemoryMCP'));
        else pending.resolve(message.result);
      }
      if (buffer.length > 8 * 1024 * 1024) this.stop(session, new Error('Réponse MemoryMCP trop volumineuse'));
    });
    let diagnostics = '';
    child.stderr.on('data', chunk => { diagnostics = (diagnostics + chunk.toString()).slice(-1000); });
    child.stdin.on('error', err => this.stop(session, err));
    child.on('error', err => this.stop(session, err));
    child.on('exit', code => this.stop(session, new Error(`MemoryMCP arrêté (${code}) ${diagnostics}`.trim())));
    return session;
  }

  send(session, method, params, timeoutMs) {
    if (session.dead) return Promise.reject(new Error('MemoryMCP arrêté'));
    return new Promise((resolve, reject) => {
      const id = ++session.nextId;
      const finish = (callback, value) => {
        clearTimeout(timer);
        session.pending.delete(id);
        callback(value);
      };
      const timer = setTimeout(() => this.stop(session, new Error(`Timeout MemoryMCP (${timeoutMs}ms)`)), timeoutMs);
      session.pending.set(id, { resolve: value => finish(resolve, value), reject: err => finish(reject, err) });
      try {
        session.child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n', err => {
          if (err) this.stop(session, err);
        });
      } catch (err) { this.stop(session, err); }
    });
  }

  stop(session, error) {
    if (!session || session.dead) return;
    session.dead = true;
    for (const request of session.pending.values()) request.reject(error);
    session.pending.clear();
    if (this.session === session) this.session = null;
    try { session.child.kill(); } catch (_) {}
  }

  close() {
    this.closed = true;
    clearTimeout(this.idleTimer);
    this.stop(this.session, new Error('MemoryMCP fermé'));
  }
}

module.exports = { MemoryMcp };
