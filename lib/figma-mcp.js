'use strict';

const FIGMA_MCP_URL = 'https://mcp.figma.com/mcp';
const FIGMA_AGENTS = new Set(['codex', 'claude']);

function assertAgent(agent) {
  if (!FIGMA_AGENTS.has(agent)) throw new Error('Agent Figma non pris en charge.');
  return agent;
}

function configureCommand(agent) {
  assertAgent(agent);
  if (agent === 'codex') return { command: 'codex', args: ['mcp', 'add', 'figma', '--url', FIGMA_MCP_URL] };
  return { command: 'claude', args: ['mcp', 'add', '--transport', 'http', '--scope', 'user', 'figma', FIGMA_MCP_URL] };
}

function loginCommand(agent) {
  assertAgent(agent);
  return { command: agent, args: ['mcp', 'login', 'figma'] };
}

function logoutCommand(agent) {
  assertAgent(agent);
  return { command: agent, args: ['mcp', 'logout', 'figma'] };
}

function normalizeState(value) {
  const input = value && typeof value === 'object' ? value : {};
  const agents = {};
  for (const agent of FIGMA_AGENTS) {
    const current = input.agents?.[agent] || {};
    agents[agent] = {
      configured: current.configured === true,
      connected: current.connected === true,
      updatedAt: typeof current.updatedAt === 'string' ? current.updatedAt : null,
    };
  }
  return { version: 1, url: FIGMA_MCP_URL, agents };
}

function updateAgentState(state, agent, patch) {
  assertAgent(agent);
  const next = normalizeState(state);
  next.agents[agent] = {
    ...next.agents[agent],
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  return next;
}

function isEnabledFor(state, agent) {
  const normalized = normalizeState(state);
  return normalized.agents[assertAgent(agent)].configured;
}

function claudeServerEntry(state) {
  return isEnabledFor(state, 'claude')
    ? { figma: { type: 'http', url: FIGMA_MCP_URL } }
    : {};
}

module.exports = {
  FIGMA_MCP_URL,
  configureCommand,
  loginCommand,
  logoutCommand,
  normalizeState,
  updateAgentState,
  isEnabledFor,
  claudeServerEntry,
};
