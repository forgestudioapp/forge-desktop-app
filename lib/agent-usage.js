const fs = require('fs');
const path = require('path');

const VERSION = 1;

function count(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? Math.floor(number) : null;
}

function normalizeUsage(value = {}) {
  const input = count(value.input ?? value.input_tokens ?? value.inputTokens);
  const output = count(value.output ?? value.output_tokens ?? value.outputTokens);
  const cacheRead = count(value.cacheRead ?? value.cached_input_tokens ?? value.cache_read_input_tokens ?? value.cache_read_tokens);
  const cacheWrite = count(value.cacheWrite ?? value.cache_creation_input_tokens ?? value.cache_write_tokens);
  return { input, output, cacheRead, cacheWrite };
}

function available(usage) {
  return Object.values(usage).some(value => value !== null);
}

function emptyTotals() {
  return { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
}

function addTotals(target, delta) {
  for (const key of Object.keys(target)) if (delta[key] !== null) target[key] += delta[key];
}

function createAgentUsageStore(filePath) {
  function read() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      return parsed?.version === VERSION && parsed.sessions && typeof parsed.sessions === 'object'
        ? parsed : { version: VERSION, sessions: {} };
    } catch (error) {
      if (error.code === 'ENOENT') return { version: VERSION, sessions: {} };
      throw error;
    }
  }

  function write(data) {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2));
    fs.renameSync(temporary, filePath);
  }

  function begin(sessionId, metadata = {}) {
    const data = read();
    data.sessions[sessionId] = {
      sessionId,
      provider: metadata.provider || null,
      model: metadata.model || null,
      project: metadata.project || null,
      task: metadata.task || null,
      status: 'running',
      availability: 'unavailable',
      totals: emptyTotals(),
      lastCumulative: emptyTotals(),
      seenEventIds: [],
      startedAt: new Date().toISOString(),
      finishedAt: null,
    };
    write(data);
    return data.sessions[sessionId];
  }

  function record(sessionId, event = {}) {
    const data = read();
    const session = data.sessions[sessionId];
    if (!session) throw new Error('Session de mesure inconnue.');
    const eventId = event.eventId ? String(event.eventId).slice(0, 200) : null;
    if (eventId && session.seenEventIds.includes(eventId)) return { ...session, duplicate: true };
    const usage = normalizeUsage(event.usage || event);
    if (!available(usage)) return session;
    const delta = { ...usage };
    if (event.cumulative === true) {
      for (const key of Object.keys(delta)) {
        if (delta[key] !== null) {
          const previous = count(session.lastCumulative?.[key]) || 0;
          const current = delta[key];
          delta[key] = Math.max(0, current - previous);
          session.lastCumulative[key] = Math.max(previous, current);
        }
      }
    }
    addTotals(session.totals, delta);
    session.availability = 'available';
    if (event.model) session.model = String(event.model).slice(0, 120);
    if (eventId) session.seenEventIds = [...session.seenEventIds, eventId].slice(-1000);
    write(data);
    return session;
  }

  function finish(sessionId, status = 'completed') {
    const data = read();
    const session = data.sessions[sessionId];
    if (!session) return null;
    session.status = ['accepted', 'failed', 'cancelled', 'completed'].includes(status) ? status : 'completed';
    session.finishedAt = new Date().toISOString();
    write(data);
    return session;
  }

  function summary(filter = {}) {
    const sessions = Object.values(read().sessions).filter(session =>
      (!filter.project || session.project === filter.project) &&
      (!filter.provider || session.provider === filter.provider));
    const totals = emptyTotals();
    let measured = 0;
    for (const session of sessions) {
      if (session.availability !== 'available') continue;
      measured += 1;
      addTotals(totals, normalizeUsage(session.totals));
    }
    return {
      availability: measured ? 'available' : 'unavailable',
      totals: measured ? totals : null,
      sessions: sessions.length,
      measuredSessions: measured,
      failedSessions: sessions.filter(session => session.status === 'failed').length,
      bySession: sessions,
    };
  }

  return { begin, record, finish, summary };
}

function codexUsageEvent(message = {}) {
  const params = message.params || message;
  if (message.method && message.method !== 'thread/tokenUsage/updated') return null;
  if (message.type && message.type !== 'turn.completed') return null;
  const usage = params.tokenUsage || params.usage || params;
  return {
    eventId: params.eventId || params.turnId || params.id || message.thread_id,
    model: params.model,
    cumulative: message.method === 'thread/tokenUsage/updated' ? params.cumulative !== false : false,
    usage: normalizeUsage(usage),
  };
}

function claudeUsageEvent(message = {}) {
  if (!message.usage || (message.type && !['result', 'assistant'].includes(message.type))) return null;
  return {
    eventId: message.uuid || message.message_id || message.id,
    model: message.model,
    cumulative: false,
    usage: normalizeUsage(message.usage),
  };
}

function createStructuredUsageParser(provider, onEvent) {
  let buffer = '';
  const adapter = provider === 'claude' ? claudeUsageEvent : codexUsageEvent;
  function consume(line) {
    if (!line.trim()) return;
    try { const event = adapter(JSON.parse(line)); if (event) onEvent(event); } catch (_) {}
  }
  return {
    push(chunk) {
      buffer += String(chunk || '');
      const lines = buffer.split(/\r?\n/); buffer = lines.pop() || '';
      lines.forEach(consume);
    },
    flush() { consume(buffer); buffer = ''; },
  };
}

module.exports = { createAgentUsageStore, normalizeUsage, codexUsageEvent, claudeUsageEvent, createStructuredUsageParser };
