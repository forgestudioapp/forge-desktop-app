const http = require('http');
const crypto = require('crypto');

const MAX_BODY_BYTES = 256 * 1024;

function constantTimeTokenMatch(expected, actual) {
  if (typeof expected !== 'string' || typeof actual !== 'string') return false;
  const left = Buffer.from(expected, 'utf8');
  const right = Buffer.from(actual, 'utf8');
  return left.length === right.length && crypto.timingSafeEqual(left, right);
}

function sendJson(response, statusCode, payload) {
  const body = Buffer.from(JSON.stringify(payload));
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': body.length,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  response.end(body);
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(Object.assign(new Error('Requête trop volumineuse.'), { statusCode: 413 }));
        request.destroy();
        return;
      }
      chunks.push(chunk);
    });
    request.on('end', () => {
      if (chunks.length === 0) return resolve({});
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch (_) { reject(Object.assign(new Error('JSON invalide.'), { statusCode: 400 })); }
    });
    request.on('error', reject);
  });
}

function createPrivateControlServer({ token, port = 59173, handlers, logger = console }) {
  if (typeof token !== 'string' || token.length < 32) {
    throw new Error('Le jeton de contrôle privé doit contenir au moins 32 caractères.');
  }
  if (!handlers || typeof handlers !== 'object') throw new Error('Gestionnaires privés manquants.');

  const server = http.createServer(async (request, response) => {
    try {
      if (request.headers.origin) return sendJson(response, 403, { error: 'Origine navigateur refusée.' });
      const authorization = request.headers.authorization || '';
      const suppliedToken = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      if (!constantTimeTokenMatch(token, suppliedToken)) {
        return sendJson(response, 401, { error: 'Jeton privé invalide.' });
      }

      const url = new URL(request.url, 'http://127.0.0.1');
      const route = `${request.method || 'GET'} ${url.pathname}`;
      const handler = handlers[route];
      if (typeof handler !== 'function') return sendJson(response, 404, { error: 'Route inconnue.' });
      const body = request.method === 'GET' ? {} : await readJson(request);
      const result = await handler(body, url.searchParams);
      if (result && result.error) return sendJson(response, result.statusCode || 400, result);
      return sendJson(response, 200, result === undefined ? { success: true } : result);
    } catch (error) {
      logger.warn?.('[PrivateControl] Requête refusée :', error.message);
      return sendJson(response, error.statusCode || 500, { error: error.message || 'Erreur interne.' });
    }
  });

  return {
    start() {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, '127.0.0.1', () => {
          server.removeListener('error', reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise(resolve => {
        if (!server.listening) return resolve();
        server.close(() => resolve());
      });
    },
    server,
  };
}

module.exports = { createPrivateControlServer, constantTimeTokenMatch, MAX_BODY_BYTES };
