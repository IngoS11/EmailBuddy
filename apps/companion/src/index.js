import http from 'node:http';
import { URL } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getConfigSchema, loadConfig, loadStyleMarkdown, saveConfig, saveStyleMarkdown } from './config.js';
import { getSecret, setSecret } from './keychain.js';
import { buildProfile, rewriteEmail } from './rewrite.js';
import { getSystemChecks } from './system-checks.js';

function json(res, code, body) {
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS'
  });
  res.end(JSON.stringify(body));
}

function notFound(res) {
  json(res, 404, { error: 'Not found' });
}

function log(level, event, details = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...details
  };
  console.log(JSON.stringify(payload));
}

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testUiPath = path.join(__dirname, 'static', 'test-ui.html');
let requestCounter = 0;

function nextRequestId() {
  requestCounter += 1;
  return `req-${Date.now()}-${requestCounter}`;
}

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) {
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) {
    return {};
  }
  return JSON.parse(raw);
}

async function handler(req, res) {
  const requestId = nextRequestId();
  const startedAt = Date.now();
  const method = req.method ?? 'UNKNOWN';
  const rawUrl = req.url ?? '';
  log('info', 'http.request.start', { requestId, method, path: rawUrl });

  if (req.method === 'OPTIONS') {
    log('info', 'http.request.end', {
      requestId,
      status: 204,
      durationMs: Date.now() - startedAt
    });
    return json(res, 204, {});
  }

  const url = new URL(req.url, 'http://localhost');

  try {
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/test-ui')) {
      const html = await readFile(testUiPath, 'utf8');
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(html);
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/health') {
      json(res, 200, { ok: true });
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/system/checks') {
      const checks = await getSystemChecks();
      json(res, 200, checks);
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/rewrite') {
      const body = await readBody(req);
      if (!body.text || typeof body.text !== 'string') {
        json(res, 400, { error: 'text is required' });
        log('warn', 'http.request.end', {
          requestId,
          status: 400,
          durationMs: Date.now() - startedAt,
          reason: 'text is required'
        });
        return;
      }

      const result = await rewriteEmail(body, {
        requestId,
        logger: (event, details) => log('info', event, details)
      });
      json(res, 200, result);
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/profile/samples') {
      const body = await readBody(req);
      if (!Array.isArray(body.samples)) {
        json(res, 400, { error: 'samples must be an array of strings' });
        log('warn', 'http.request.end', {
          requestId,
          status: 400,
          durationMs: Date.now() - startedAt,
          reason: 'samples must be an array'
        });
        return;
      }

      const profile = await buildProfile(body.samples);
      json(res, 200, { profile });
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/config') {
      const config = await loadConfig();
      json(res, 200, config);
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/config/schema') {
      const schema = await getConfigSchema();
      json(res, 200, schema);
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/style') {
      const style = await loadStyleMarkdown();
      json(res, 200, { markdown: style });
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/v1/config') {
      const body = await readBody(req);
      try {
        const config = await saveConfig(body);
        json(res, 200, config);
        log('info', 'http.request.end', {
          requestId,
          status: 200,
          durationMs: Date.now() - startedAt
        });
      } catch (error) {
        json(res, 400, { error: error.message });
        log('warn', 'http.request.end', {
          requestId,
          status: 400,
          durationMs: Date.now() - startedAt,
          reason: error.message
        });
      }
      return;
    }

    if (req.method === 'PUT' && url.pathname === '/v1/style') {
      const body = await readBody(req);
      try {
        const markdown = await saveStyleMarkdown(body.markdown);
        json(res, 200, { markdown });
        log('info', 'http.request.end', {
          requestId,
          status: 200,
          durationMs: Date.now() - startedAt
        });
      } catch (error) {
        json(res, 400, { error: error.message });
        log('warn', 'http.request.end', {
          requestId,
          status: 400,
          durationMs: Date.now() - startedAt,
          reason: error.message
        });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/v1/secrets') {
      const body = await readBody(req);
      if (!body.account || !body.value) {
        json(res, 400, { error: 'account and value are required' });
        log('warn', 'http.request.end', {
          requestId,
          status: 400,
          durationMs: Date.now() - startedAt,
          reason: 'account/value required'
        });
        return;
      }

      await setSecret(body.account, body.value);
      json(res, 200, { ok: true });
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/v1/secrets/status') {
      const [openaiKey, anthropicKey] = await Promise.all([
        getSecret('openai_api_key'),
        getSecret('anthropic_api_key')
      ]);
      json(res, 200, {
        openaiConfigured: Boolean(openaiKey),
        anthropicConfigured: Boolean(anthropicKey)
      });
      log('info', 'http.request.end', {
        requestId,
        status: 200,
        durationMs: Date.now() - startedAt
      });
      return;
    }

    notFound(res);
    log('warn', 'http.request.end', {
      requestId,
      status: 404,
      durationMs: Date.now() - startedAt
    });
    return;
  } catch (error) {
    json(res, 500, { error: error.message });
    log('error', 'http.request.end', {
      requestId,
      status: 500,
      durationMs: Date.now() - startedAt,
      error: error.message
    });
    return;
  }
}

const config = await loadConfig();
const server = http.createServer(handler);

server.listen(config.port, config.host, () => {
  log('info', 'server.started', { host: config.host, port: config.port });
  log('info', 'server.test_ui', { url: `http://${config.host}:${config.port}/test-ui` });
});
