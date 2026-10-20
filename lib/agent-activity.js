const fs = require('fs');
const path = require('path');

const VERSION = 1;

function cleanText(value, max = 300) {
  return String(value || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function normalizeResource(value) {
  const cleaned = cleanText(value, 500).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, '');
  return process.platform === 'win32' ? cleaned.toLowerCase() : cleaned;
}

function cleanResources(resources) {
  return [...new Set((Array.isArray(resources) ? resources : [])
    .map(normalizeResource)
    .filter(Boolean))].slice(0, 100);
}

function cleanList(values, maxItems = 20) {
  return [...new Set((Array.isArray(values) ? values : []).map(value => cleanText(value, 500)).filter(Boolean))].slice(0, maxItems);
}

function cleanEvidence(value) {
  const source = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    tests: cleanList(source.tests, 20),
    files: cleanList(source.files, 100),
    objects: cleanList(source.objects, 100),
    studio: cleanText(source.studio, 500),
    expected: cleanText(source.expected, 500),
    regression: cleanText(source.regression, 500),
    visual: cleanText(source.visual, 500),
    limits: cleanText(source.limits, 500),
  };
}

function hasEvidence(evidence) {
  const value = cleanEvidence(evidence);
  return value.tests.length > 0 || value.files.length > 0 || value.objects.length > 0 || !!(value.studio || value.expected || value.regression || value.visual);
}

function resourcesOverlap(left, right) {
  if (!left || !right) return false;
  return left === right || left.startsWith(`${right}/`) || right.startsWith(`${left}/`);
}

function withConflicts(agents) {
  const result = agents.map(agent => ({ ...agent, conflicts: [] }));
  for (let i = 0; i < result.length; i++) {
    for (let j = i + 1; j < result.length; j++) {
      const shared = result[i].resources.filter(left => result[j].resources.some(right => resourcesOverlap(left, right)));
      if (!shared.length) continue;
      result[i].conflicts.push({ agentId: result[j].id, agentName: result[j].name, resources: shared });
      result[j].conflicts.push({ agentId: result[i].id, agentName: result[i].name, resources: shared });
    }
  }
  return result;
}

function acquireLock(filePath, timeoutMs = 2500) {
  const lockPath = `${filePath}.lock`;
  const deadline = Date.now() + timeoutMs;
  while (true) {
    try {
      fs.mkdirSync(lockPath);
      return () => fs.rmSync(lockPath, { recursive: true, force: true });
    } catch (error) {
      if (error.code !== 'EEXIST' || Date.now() >= deadline) throw error;
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > 30000) { fs.rmSync(lockPath, { recursive: true, force: true }); continue; }
      } catch (_) {}
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 15);
    }
  }
}

function createAgentActivityStore(filePath) {
  function read() {
    try {
      const value = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return value && value.version === VERSION && value.agents && typeof value.agents === 'object'
        ? value : { version: VERSION, agents: {} };
    } catch (_) {
      return { version: VERSION, agents: {} };
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    try { fs.renameSync(temporary, filePath); }
    catch (error) { fs.rmSync(temporary, { force: true }); throw error; }
  }

  function update(agentId, patch = {}) {
    const id = cleanText(agentId, 120);
    if (!id) throw new Error('Identifiant agent manquant.');
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const release = acquireLock(filePath);
    try {
      const data = read();
      const previous = data.agents[id] || { id, name: 'Agent', task: '', test: '', blocker: '', status: 'idle', resources: [] };
      const nextTask = patch.task === undefined ? previous.task : cleanText(patch.task);
      const startsNewWork = patch.status === 'working' && patch.task !== undefined && nextTask !== previous.task;
      data.agents[id] = {
        ...previous,
        id,
        name: patch.name === undefined ? previous.name : cleanText(patch.name, 120) || previous.name,
        task: nextTask,
        test: patch.test === undefined ? previous.test : cleanText(patch.test),
        blocker: patch.blocker === undefined ? previous.blocker : cleanText(patch.blocker),
        status: patch.status === undefined ? previous.status : cleanText(patch.status, 30) || 'idle',
        resources: patch.resources === undefined ? previous.resources : cleanResources(patch.resources),
        evidence: patch.evidence === undefined ? (startsNewWork ? cleanEvidence({}) : cleanEvidence(previous.evidence)) : cleanEvidence(patch.evidence),
        validatedAt: patch.status === 'validated' ? new Date().toISOString() : (startsNewWork ? null : previous.validatedAt || null),
        updatedAt: new Date().toISOString(),
      };
      write(data);
      return data.agents[id];
    } finally {
      release();
    }
  }

  function list() {
    return withConflicts(Object.values(read().agents).map(agent => ({
      id: cleanText(agent.id, 120),
      name: cleanText(agent.name, 120) || 'Agent',
      task: cleanText(agent.task),
      test: cleanText(agent.test),
      blocker: cleanText(agent.blocker),
      status: cleanText(agent.status, 30) || 'idle',
      resources: cleanResources(agent.resources),
      evidence: cleanEvidence(agent.evidence),
      validatedAt: agent.validatedAt || null,
      updatedAt: agent.updatedAt || null,
    })).filter(agent => agent.id));
  }

  function remove(agentId) {
    const id = cleanText(agentId, 120);
    const release = acquireLock(filePath);
    try {
      const data = read();
      delete data.agents[id];
      write(data);
    } finally { release(); }
  }

  return { update, list, remove };
}

module.exports = { createAgentActivityStore, cleanResources, cleanEvidence, hasEvidence, resourcesOverlap, withConflicts };
