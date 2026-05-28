import { readFile, realpath, stat } from 'node:fs/promises';
import { createServer, IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { eventBus } from './jobs';
import { handleRpcRequest, isJsonRpcRequest } from './rpc';

const port = Number(process.env.WEAVELIGHT_ENGINE_PORT ?? 3322);
const staticRoot = path.join(__dirname, '..', 'static');

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};

async function tryServeStatic(req: IncomingMessage, res: ServerResponse<IncomingMessage>): Promise<boolean> {
  if (!req.url || (!req.url.startsWith('/app') && req.url !== '/')) {
    return false;
  }

  const url = new URL(req.url, 'http://127.0.0.1');
  const pathname = decodeURIComponent(url.pathname);
  const withoutPrefix = pathname.replace('/app', '');
  const relativePath =
    pathname === '/' || withoutPrefix === '' || withoutPrefix === '/' ? '/index.html' : withoutPrefix;
  const safePath = path.normalize(relativePath);
  const filePath = path.resolve(staticRoot, `.${safePath}`);

  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile()) {
      return false;
    }
    const resolvedRoot = await realpath(staticRoot);
    const resolvedFile = await realpath(filePath);
    if (!resolvedFile.startsWith(`${resolvedRoot}${path.sep}`)) {
      return false;
    }
    const ext = path.extname(filePath);
    const contentType = CONTENT_TYPES[ext] ?? 'application/octet-stream';
    const body = await readFile(filePath);
    res.writeHead(200, { 'content-type': contentType });
    res.end(body);
    return true;
  } catch {
    return false;
  }
}

const server = createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/health') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
    return;
  }

  if (req.method === 'GET' && req.url?.startsWith('/events')) {
    const url = new URL(req.url, 'http://127.0.0.1');
    const sessionId = url.searchParams.get('sessionId');
    const jobId = url.searchParams.get('jobId');

    res.writeHead(200, {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      connection: 'keep-alive',
    });
    res.write('\n');
    const unsubscribe = eventBus.on((event) => {
      if (sessionId && event.payload?.sessionId !== sessionId) {
        return;
      }
      if (jobId && event.jobId !== jobId) {
        return;
      }
      res.write(`event: ${event.type}\n`);
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    });
    req.on('close', () => {
      unsubscribe();
    });
    return;
  }

  if (req.method === 'GET' && (req.url === '/' || req.url?.startsWith('/app'))) {
    const served = await tryServeStatic(req, res);
    if (served) {
      return;
    }
  }

  if (req.method !== 'POST' || req.url !== '/rpc') {
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }));
    return;
  }

  if (!isJsonRpcRequest(payload)) {
    res.writeHead(400, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } }));
    return;
  }

  const response = await handleRpcRequest(payload);
  res.writeHead(200, { 'content-type': 'application/json' });
  res.end(JSON.stringify(response));
});

server.listen(port, '127.0.0.1', () => {
  process.stdout.write(`WeaveLight engine sidecar listening on http://127.0.0.1:${port}\n`);
});
