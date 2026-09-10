const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { ensureContextDirectory } = require('./forge-context');
const io = fs.promises;
const jobs = new Map();
const timers = new Map();
const EXCLUDED = new Set(['node_modules', 'out', 'dist', 'build', 'vendor', 'coverage']);
const EXTENSIONS = new Set(['.ts', '.tsx', '.lua', '.luau']);
const LIMITS = { files: 5000, entries: 20000, fileBytes: 256 * 1024, totalBytes: 16 * 1024 * 1024, depth: 24 };

function declarations(source) {
  const result = [];
  const pattern = /^\s*(?:(?:export|default|declare|local|async|abstract)\s+)*(?:function|class|interface|type|enum|namespace|const|let)\s+([A-Za-z_$][\w$]*(?:[.:][A-Za-z_$][\w$]*)*)/;
  source.split('\n').some((line, i) => {
    const match = line.match(pattern);
    if (match) result.push({ name: match[1], line: i + 1 });
    return result.length >= 100;
  });
  return result;
}

async function readPrevious(target, root) {
  try {
    const stat = await io.lstat(target);
    if (stat.isSymbolicLink() || !stat.isFile()) throw new Error('Index non sûr.');
    if (stat.size > 32 * 1024 * 1024) return new Map();
    const rows = (await io.readFile(target, 'utf8')).trim().split('\n').map(line => JSON.parse(line));
    if (rows[0]?.version !== 1 || rows[0]?.root !== root) return new Map();
    return new Map(rows.slice(1).filter(row => typeof row.path === 'string' && Array.isArray(row.symbols))
      .map(row => [row.path, row]));
  } catch (err) {
    if (err.code === 'ENOENT' || err instanceof SyntaxError) return new Map();
    throw err;
  }
}

async function buildIndex(root, limits) {
  const directory = ensureContextDirectory(root);
  const target = path.join(directory, 'files.ndjson');
  const previous = await readPrevious(target, root);
  const files = [];
  const pending = [{ relative: 'src', depth: 0 }];
  let entries = 0, totalBytes = 0, readFiles = 0, reusedFiles = 0, incomplete = false;
  while (pending.length && entries < limits.entries && files.length < limits.files) {
    const { relative, depth } = pending.pop();
    const absolute = path.join(root, relative);
    try {
      const stat = await io.lstat(absolute);
      if (stat.isSymbolicLink()) { incomplete = true; continue; }
      if (stat.isDirectory()) {
        if (depth >= limits.depth) { incomplete = true; continue; }
        const directoryEntries = await io.opendir(absolute);
        for await (const entry of directoryEntries) {
          if (++entries > limits.entries) { incomplete = true; break; }
          if (entry.name.startsWith('.') || EXCLUDED.has(entry.name.toLowerCase())) continue;
          if (entry.isSymbolicLink()) { incomplete = true; continue; }
          if (entry.isDirectory() || EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            pending.push({ relative: `${relative}/${entry.name}`, depth: depth + 1 });
          }
        }
      } else if (stat.isFile() && EXTENSIONS.has(path.extname(relative).toLowerCase())) {
        if (stat.size > limits.fileBytes || totalBytes + stat.size > limits.totalBytes) { incomplete = true; continue; }
        totalBytes += stat.size;
        const signature = `${stat.size}:${stat.mtimeMs}:${stat.ctimeMs}:${stat.ino}`;
        const cached = previous.get(relative);
        if (cached?.signature === signature) {
          files.push(cached);
          reusedFiles++;
        } else {
          const handle = await io.open(absolute, 'r');
          let source;
          try {
            const buffer = Buffer.alloc(limits.fileBytes + 1);
            const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
            if (bytesRead > limits.fileBytes || bytesRead !== stat.size) { incomplete = true; continue; }
            source = buffer.toString('utf8', 0, bytesRead);
          } finally { await handle.close(); }
          // A concurrent write is retried on the next refresh, never cached as stable.
          const after = await io.lstat(absolute);
          if (after.isSymbolicLink() || `${after.size}:${after.mtimeMs}:${after.ctimeMs}:${after.ino}` !== signature) {
            incomplete = true;
            continue;
          }
          files.push({ path: relative, signature, symbols: declarations(source) });
          readFiles++;
        }
      }
    } catch (err) {
      if (!(relative === 'src' && err.code === 'ENOENT')) incomplete = true;
    }
  }
  if (pending.length) incomplete = true;
  files.sort((a, b) => a.path.localeCompare(b.path));
  const header = { version: 1, root, scope: 'src/**/*.{ts,tsx,lua,luau}', approximate: true, maxSymbolsPerFile: 100, incomplete, files: files.length };
  const content = [header, ...files].map(row => JSON.stringify(row)).join('\n') + '\n';
  let existing = '';
  try { existing = await io.readFile(target, 'utf8'); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  if (content !== existing) {
    // Publish a complete snapshot. Readers see either the old or the new index.
    const temporary = path.join(directory, `.index-${crypto.randomUUID()}.tmp`);
    try {
      await io.writeFile(temporary, content, { encoding: 'utf8', flag: 'wx' });
      await io.rename(temporary, target);
    } finally {
      await io.unlink(temporary).catch(err => { if (err.code !== 'ENOENT') throw err; });
    }
  }
  return { path: target, files: files.length, readFiles, reusedFiles, incomplete, updated: content !== existing };
}

async function refreshProjectIndex(projectPath, limits = LIMITS) {
  const root = await io.realpath(projectPath);
  const active = jobs.get(root);
  if (active) { active.again = true; return active.promise; }
  const job = { again: false };
  jobs.set(root, job);
  job.promise = (async () => {
    let result;
    do { job.again = false; result = await buildIndex(root, limits); } while (job.again);
    return result;
  })();
  try { return await job.promise; } finally { jobs.delete(root); }
}

function scheduleProjectIndex(projectPath) {
  const key = path.resolve(projectPath);
  if (timers.has(key)) clearTimeout(timers.get(key));
  const timer = setTimeout(() => {
    timers.delete(key);
    refreshProjectIndex(key).catch(err => console.warn('[ProjectIndex]', err.message));
  }, 800);
  timer.unref?.();
  timers.set(key, timer);
}

module.exports = { declarations, refreshProjectIndex, scheduleProjectIndex, LIMITS };
