const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const VERSION = 2;

function agentProjectKey(projectPath) {
  if (typeof projectPath !== 'string' || !projectPath.trim() || !path.isAbsolute(projectPath)) {
    throw new Error('Le chemin du projet est requis pour les agents.');
  }
  let resolved = path.resolve(projectPath);
  try { resolved = fs.realpathSync.native(resolved); }
  catch (error) { if (error.code !== 'ENOENT' && error.code !== 'ENOTDIR') throw error; }
  resolved = resolved.replace(/\\/g, '/');
  return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

function sameAgentProject(left, right) {
  try { return agentProjectKey(left) === agentProjectKey(right); }
  catch { return false; }
}

function checkedState(state) {
  if (!state || typeof state !== 'object' || !Array.isArray(state.agents)) {
    throw new Error('État des agents invalide.');
  }
  return JSON.parse(JSON.stringify({ agents: state.agents, agentCounter: state.agentCounter || {} }));
}

function createAgentStateStore(filePath) {
  function read() {
    let raw;
    try { raw = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return { version: VERSION, projects: {} }; throw error; }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Fichier des agents invalide.');
    if (raw.version === VERSION && raw.projects && typeof raw.projects === 'object' && !Array.isArray(raw.projects)) return raw;
    if (raw.version === undefined && Array.isArray(raw.agents)) {
      // Never infer ownership from whichever project is opened next.
      return { version: VERSION, projects: {}, unassignedLegacy: raw };
    }
    throw new Error('Version du fichier des agents non prise en charge.');
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temporary, JSON.stringify(data, null, 2), { encoding: 'utf8', flag: 'wx' });
      fs.renameSync(temporary, filePath);
    } finally {
      try { fs.unlinkSync(temporary); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
  }

  return {
    migrateLegacy(activeProjectFile) {
      // Called once before the first window can change active-project.json.
      let original;
      try { original = JSON.parse(fs.readFileSync(filePath, 'utf8')); }
      catch (error) { if (error.code === 'ENOENT') return false; throw error; }
      if (!original || original.version !== undefined || !Array.isArray(original.agents)) return false;
      let projectKey;
      try {
        const active = JSON.parse(fs.readFileSync(activeProjectFile, 'utf8'));
        projectKey = agentProjectKey(active.path);
      } catch {
        write({ version: VERSION, projects: {}, unassignedLegacy: original });
        return false;
      }
      write({ version: VERSION, projects: { [projectKey]: checkedState(original) } });
      return true;
    },
    save(projectPath, state) {
      const projectKey = agentProjectKey(projectPath);
      const data = read();
      data.projects[projectKey] = checkedState(state);
      write(data);
    },
    load(projectPath, sessions = new Map()) {
      const projectKey = agentProjectKey(projectPath);
      const data = read();
      const saved = data.projects[projectKey];
      const state = saved ? checkedState(saved) : { agents: [], agentCounter: {} };
      return {
        ...state,
        projectKey,
        agents: state.agents.filter(agent => agent && typeof agent === 'object').map(agent => ({
          ...agent,
          sessionId: agent.sessionId && sameAgentProject(sessions.get(agent.sessionId)?.projectPath, projectPath)
            ? agent.sessionId : null,
        })),
      };
    },
    clear(projectPath) {
      const projectKey = agentProjectKey(projectPath);
      const data = read();
      if (Object.prototype.hasOwnProperty.call(data.projects, projectKey)) {
        delete data.projects[projectKey];
        write(data);
      }
    },
  };
}

module.exports = { createAgentStateStore, agentProjectKey, sameAgentProject };
