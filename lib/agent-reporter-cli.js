#!/usr/bin/env node
const { createAgentActivityStore } = require('./agent-activity');

function values(name) {
  const result = [];
  for (let index = 0; index < process.argv.length; index++) {
    if (process.argv[index] === name && process.argv[index + 1]) result.push(process.argv[++index]);
  }
  return result;
}

const filePath = process.env.FORGE_AGENT_ACTIVITY_FILE;
const agentId = process.env.FORGE_AGENT_ID;
if (!filePath || !agentId) {
  console.error('Ce rapporteur doit être lancé depuis un agent Forge.');
  process.exit(2);
}

const action = process.argv[2] || 'claim';
const store = createAgentActivityStore(filePath);
try {
  if (action === 'claim' || action === 'update') {
    const task = values('--task')[0];
    const resources = values('--resource');
    store.update(agentId, {
      name: process.env.FORGE_AGENT_NAME || 'Agent',
      task,
      resources: resources.length ? resources : undefined,
      status: 'working',
    });
  } else if (action === 'release' || action === 'done') {
    store.update(agentId, {
      name: process.env.FORGE_AGENT_NAME || 'Agent',
      status: 'done',
      resources: [],
    });
  } else {
    throw new Error('Action inconnue. Utilise claim, update ou release.');
  }
  process.stdout.write('Activité Forge mise à jour.\n');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
