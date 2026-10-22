'use strict';

const ACTIVE_STATUSES = new Set(['working', 'testing', 'blocked']);

function normalizeMission(value) {
  return String(value || '')
    .normalize('NFKC')
    .toLocaleLowerCase('fr')
    .replace(/[^\p{L}\p{N}_./\\-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000);
}

const STOP_WORDS = new Set(['avec', 'dans', 'des', 'les', 'une', 'pour', 'puis', 'mais', 'sur', 'and', 'the', 'with', 'from', 'then']);

function words(value) {
  return new Set(normalizeMission(value).split(' ')
    .map(word => word.replace(/^[._/\\-]+|[._/\\-]+$/g, ''))
    .filter(word => word.length > 2 && !STOP_WORDS.has(word)));
}

function similarity(left, right) {
  const a = normalizeMission(left), b = normalizeMission(right);
  if (!a || !b) return 0;
  if (a === b) return 1;
  const aw = words(a), bw = words(b);
  if (aw.size < 5 || bw.size < 5) return 0;
  if (Math.min(aw.size, bw.size) / Math.max(aw.size, bw.size) < 0.7) return 0;
  let common = 0;
  for (const word of aw) if (bw.has(word)) common += 1;
  return common / Math.max(aw.size, bw.size);
}

function findDuplicateMission({ text, agentId, live = [], persisted = [], threshold = 0.86 }) {
  const candidates = [
    ...live.map(item => ({ ...item, source: 'live' })),
    ...persisted.filter(item => ACTIVE_STATUSES.has(item.status)).map(item => ({ ...item, source: 'activity' })),
  ];
  let best = null;
  for (const item of candidates) {
    if (!item || String(item.agentId || item.id || '') === String(agentId || '')) continue;
    const score = similarity(text, item.task);
    if (score < threshold || (best && best.similarity >= score)) continue;
    best = {
      agentId: item.agentId || item.id || null,
      agentName: item.agentName || item.name || 'Agent',
      task: String(item.task || '').slice(0, 300),
      similarity: score,
      source: item.source,
    };
  }
  return best;
}

module.exports = { normalizeMission, similarity, findDuplicateMission };
