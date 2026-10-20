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
    const declaredTest = values('--test')[0];
    const blocker = values('--blocker')[0];
    const resources = values('--resource');
    store.update(agentId, {
      name: process.env.FORGE_AGENT_NAME || 'Agent',
      task,
      test: declaredTest || '',
      blocker: blocker || '',
      resources: resources.length ? resources : undefined,
      status: blocker ? 'blocked' : declaredTest ? 'testing' : 'working',
    });
  } else if (action === 'test') {
    const declaredTest = values('--test')[0];
    if (!declaredTest) throw new Error('Indique le test avec --test.');
    store.update(agentId, { name: process.env.FORGE_AGENT_NAME || 'Agent', test: declaredTest, blocker: '', status: 'testing' });
  } else if (action === 'block') {
    const blocker = values('--reason')[0] || values('--blocker')[0];
    if (!blocker) throw new Error('Indique le blocage avec --reason.');
    store.update(agentId, { name: process.env.FORGE_AGENT_NAME || 'Agent', blocker, status: 'blocked' });
  } else if (action === 'complete' || action === 'done') {
    const evidence = {
      tests: values('--test'),
      files: values('--file'),
      objects: values('--object'),
      studio: values('--studio')[0],
      expected: values('--expected')[0],
      regression: values('--regression')[0],
      visual: values('--visual')[0],
      limits: values('--limit')[0],
    };
    if (!evidence.tests.length) throw new Error('Indique au moins un test avec --test, ou précise --test "Non exécuté : raison".');
    if (!evidence.files.length && !evidence.objects.length) throw new Error('Indique au moins un fichier livré avec --file ou un objet Studio avec --object.');
    store.update(agentId, {
      name: process.env.FORGE_AGENT_NAME || 'Agent',
      test: evidence.tests.join(' · '),
      evidence,
      status: 'needs-review',
      blocker: '',
      resources: [],
    });
  } else if (action === 'release') {
    store.update(agentId, {
      name: process.env.FORGE_AGENT_NAME || 'Agent',
      status: 'idle',
      blocker: '',
      resources: [],
    });
  } else {
    throw new Error('Action inconnue. Utilise claim, update, test, block, complete ou release.');
  }
  process.stdout.write('Activité Forge mise à jour.\n');
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
