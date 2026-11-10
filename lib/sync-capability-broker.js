'use strict';

const http = require('node:http');
const { timingSafeEqual } = require('node:crypto');

// The Studio bridge may have been started by an agent before Forge. It cannot
// inherit Forge's secret, so it asks the running desktop process to verify it.
const PORT = 59174;

function matches(expected, supplied) {
  if (typeof supplied !== 'string' || !expected) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createSyncCapabilityBroker(capability, port = PORT) {
  if (typeof capability !== 'string' || capability.length < 32) throw new Error('Capacité de synchronisation invalide.');
  const server = http.createServer((request, response) => {
    if (request.method !== 'POST' || request.url !== '/verify' || request.headers.origin || request.socket.remoteAddress !== '127.0.0.1') {
      response.writeHead(403).end();
      return;
    }
    let body = '';
    request.on('data', chunk => {
      body += chunk;
      if (body.length > 512) request.destroy();
    });
    request.on('end', () => {
      let accepted = false;
      try { accepted = matches(capability, JSON.parse(body).capability); } catch (_) {}
      response.writeHead(accepted ? 200 : 403, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify({ accepted }));
    });
  });
  return {
    start: () => new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => { server.off('error', reject); resolve(server.address()); });
    }),
    close: () => new Promise(resolve => server.close(() => resolve())),
  };
}

module.exports = { createSyncCapabilityBroker, PORT };
